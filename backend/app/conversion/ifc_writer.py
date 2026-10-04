"""Write converted plans to IFC4 with IfcOpenShell. Every element gets a stable GlobalId (derived from the
project, level and plan element id) so re-converting keeps element identity and progress."""

import json
import math
import uuid
from dataclasses import dataclass, field

import ifcopenshell
import ifcopenshell.api as api
import ifcopenshell.guid
import numpy as np

NS = uuid.UUID("3b7d8a52-56a6-4c5f-9a43-5b1e0b9d6c11")

SANITARY = {"toilet": "TOILETPAN", "lavatory": "WASHHANDBASIN", "kitchen_sink": "SINK", "bathtub": "BATH",
            "shower": "SHOWER", "fixture": "NOTDEFINED"}
DEVICE_CLASS = {"outlet": ("IfcOutlet", "POWEROUTLET"), "switch": ("IfcSwitchingDevice", "TOGGLESWITCH"),
                "light": ("IfcLightFixture", "POINTSOURCE"), "device": ("IfcElectricAppliance", "NOTDEFINED")}


@dataclass
class Transform:
    """sheet metres → building metres: rotate about origin, then translate."""

    dx: float = 0.0
    dy: float = 0.0
    rotation_deg: float = 0.0

    def __call__(self, p) -> tuple[float, float]:
        r = math.radians(self.rotation_deg)
        x, y = p
        return (x * math.cos(r) - y * math.sin(r) + self.dx, x * math.sin(r) + y * math.cos(r) + self.dy)

    def angle(self, a: float) -> float:
        return a + math.radians(self.rotation_deg)


@dataclass
class SheetInput:
    sheet_id: str
    discipline: str
    plan: dict
    transform: Transform


@dataclass
class LevelInput:
    level_id: str
    building: str
    name: str
    elevation: float
    height: float
    sheets: list[SheetInput] = field(default_factory=list)


def stable_guid(*parts: str) -> str:
    return ifcopenshell.guid.compress(uuid.uuid5(NS, "|".join(parts)).hex)


def _matrix(origin, xdir, zdir=(0, 0, 1)) -> np.ndarray:
    x = np.array(xdir, dtype=float)
    x /= np.linalg.norm(x)
    z = np.array(zdir, dtype=float)
    z /= np.linalg.norm(z)
    y = np.cross(z, x)
    m = np.eye(4)
    m[:3, 0], m[:3, 1], m[:3, 2], m[:3, 3] = x, y, z, origin
    return m


class Writer:
    def __init__(self, project_name: str, project_key: str):
        self.key = project_key
        f = self.f = api.run("project.create_file", version="IFC4")
        self.project = api.run("root.create_entity", f, ifc_class="IfcProject", name=project_name)
        units = [api.run("unit.add_si_unit", f, unit_type=t) for t in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")]
        api.run("unit.assign_unit", f, units=units)
        model = api.run("context.add_context", f, context_type="Model")
        self.body = api.run("context.add_context", f, context_type="Model", context_identifier="Body",
                            target_view="MODEL_VIEW", parent=model)
        self.site = api.run("root.create_entity", f, ifc_class="IfcSite", name="Site")
        api.run("aggregate.assign_object", f, products=[self.site], relating_object=self.project)
        self.buildings: dict[str, object] = {}

    # -- helpers
    def _entity(self, cls, name, guid, storey, matrix, rep, props, predefined=None):
        f = self.f
        el = api.run("root.create_entity", f, ifc_class=cls, name=name, predefined_type=predefined)
        el.GlobalId = guid
        api.run("geometry.edit_object_placement", f, product=el, matrix=matrix, is_si=True)
        if rep is not None:
            api.run("geometry.assign_representation", f, product=el, representation=rep)
        if storey is not None:
            if el.is_a("IfcSpace"):
                api.run("aggregate.assign_object", f, products=[el], relating_object=storey)
            else:
                api.run("spatial.assign_container", f, products=[el], relating_structure=storey)
        if props:
            pset = api.run("pset.add_pset", f, product=el, name="SiteMesh")
            api.run("pset.edit_pset", f, pset=pset, properties={k: v for k, v in props.items() if v is not None})
        return el

    def _box(self, length, thickness, height):
        return api.run("geometry.add_wall_representation", self.f, context=self.body, length=length,
                       height=height, thickness=thickness)

    def _prism(self, polygon, depth):
        return api.run("geometry.add_slab_representation", self.f, context=self.body, depth=depth,
                       polyline=[tuple(p) for p in polygon] + [tuple(polygon[0])])

    def _cylinder(self, radius, length):
        f = self.f
        prof = f.createIfcCircleProfileDef("AREA", None, f.createIfcAxis2Placement2D(f.createIfcCartesianPoint((0.0, 0.0))),
                                           float(radius))
        solid = f.createIfcExtrudedAreaSolid(prof, f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0.0, 0.0, 0.0))),
                                             f.createIfcDirection((0.0, 0.0, 1.0)), float(length))
        return f.createIfcShapeRepresentation(self.body, "Body", "SweptSolid", [solid])

    def storey(self, lv: LevelInput):
        f = self.f
        if lv.building not in self.buildings:
            b = api.run("root.create_entity", f, ifc_class="IfcBuilding", name=lv.building)
            api.run("aggregate.assign_object", f, products=[b], relating_object=self.site)
            self.buildings[lv.building] = b
        st = api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name=lv.name)
        st.Elevation = lv.elevation
        api.run("aggregate.assign_object", f, products=[st], relating_object=self.buildings[lv.building])
        api.run("geometry.edit_object_placement", f, product=st, matrix=_matrix((0, 0, lv.elevation), (1, 0, 0)), is_si=True)
        return st

    def props(self, discipline, item, sheet_id, source=None):
        return {"Discipline": discipline, "Source": source or item.get("source", "drawn"),
                "Confidence": float(item.get("confidence", 1.0)), "PlanId": item["id"], "SheetId": sheet_id}

    # -- elements
    def level(self, lv: LevelInput) -> dict:
        st = self.storey(lv)
        z0 = lv.elevation
        n = {"walls": 0, "openings": 0, "slabs": 0, "spaces": 0, "fixtures": 0, "devices": 0, "pipes": 0}
        for sh in lv.sheets:
            T, p = sh.transform, sh.plan
            g = lambda *k: stable_guid(self.key, lv.level_id, *k)  # noqa: E731
            if sh.discipline in ("architecture", "structure"):
                slab = p.get("slab")
                if slab and slab.get("polygon"):
                    poly = [T(q) for q in slab["polygon"]]
                    th = slab.get("thickness", 0.2)
                    self._entity("IfcSlab", "Floor slab", g("slab", sh.sheet_id), st, _matrix((0, 0, z0 - th), (1, 0, 0)),
                                 self._prism(poly, th), {"Discipline": "architecture", "Source": "drawn",
                                                         "Confidence": 0.9, "PlanId": "slab", "SheetId": sh.sheet_id},
                                 "FLOOR")
                    n["slabs"] += 1
                for w in p["walls"]:
                    a, b = T(w["a"]), T(w["b"])
                    L = math.dist(a, b)
                    if L < 0.05:
                        continue
                    t = w["thickness"]
                    h = w.get("height") or max(lv.height - 0.2, 2.0)
                    u = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
                    nrm = (-u[1], u[0])
                    origin = (a[0] - nrm[0] * t / 2, a[1] - nrm[1] * t / 2, z0)
                    wall = self._entity("IfcWall", f"Wall {w['id'][:6]}", g("wall", w["id"]), st, _matrix(origin, (*u, 0)),
                                        self._box(L, t, h), self.props("architecture", w, sh.sheet_id))
                    n["walls"] += 1
                    for o in w["openings"]:
                        ow = o["end"] - o["start"]
                        if ow <= 0.05:
                            continue
                        oh = min(o.get("height", 2.03), h - 0.05)
                        sill = o.get("sill", 0.0)
                        oorigin = (a[0] + u[0] * o["start"] - nrm[0] * (t / 2 + 0.05),
                                   a[1] + u[1] * o["start"] - nrm[1] * (t / 2 + 0.05), z0 + sill)
                        op = self._entity("IfcOpeningElement", f"Opening {o['id'][:6]}", g("open", o["id"]), None,
                                          _matrix(oorigin, (*u, 0)), self._box(ow, t + 0.1, oh), None, "OPENING")
                        api.run("feature.add_feature", self.f, feature=op, element=wall)
                        n["openings"] += 1
                        if o["kind"] in ("door", "window"):
                            cls = "IfcDoor" if o["kind"] == "door" else "IfcWindow"
                            ft = 0.04 if o["kind"] == "door" else 0.06
                            forigin = (a[0] + u[0] * o["start"] - nrm[0] * ft / 2, a[1] + u[1] * o["start"] - nrm[1] * ft / 2,
                                       z0 + sill)
                            fill = self._entity(cls, f"{o['kind'].title()} {o['id'][:6]}", g(o["kind"], o["id"]), st,
                                                _matrix(forigin, (*u, 0)), self._box(ow, ft, oh),
                                                self.props("architecture", o, sh.sheet_id, "drawn"))
                            fill.OverallWidth, fill.OverallHeight = ow, oh
                            api.run("feature.add_filling", self.f, opening=op, element=fill)
                for r in p["rooms"]:
                    poly = [T(q) for q in r["polygon"]]
                    sp = self._entity("IfcSpace", r["name"], g("room", r["id"]), st, _matrix((0, 0, z0), (1, 0, 0)),
                                      self._prism(poly, max(lv.height - 0.2, 2.0)),
                                      {**self.props("architecture", r, sh.sheet_id), "Polygon": json.dumps(poly)}, "SPACE")
                    sp.LongName = r["name"]
                    n["spaces"] += 1
            for fx in p.get("fixtures", []):
                cx, cy = T(fx["pos"])
                w, d = fx["size"]
                hgt = {"water_heater": 1.5, "toilet": 0.4, "lavatory": 0.85, "kitchen_sink": 0.9, "bathtub": 0.55,
                       "shower": 0.1}.get(fx["kind"], 0.8)
                rect = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
                rot = T.angle(0)
                if fx["kind"] == "water_heater":
                    cls, pre = "IfcTank", "STORAGE"
                else:
                    cls, pre = "IfcSanitaryTerminal", SANITARY.get(fx["kind"], "NOTDEFINED")
                el = self._entity(cls, fx["kind"].replace("_", " ").title(), g("fx", fx["id"]), st,
                                  _matrix((cx, cy, z0 + fx.get("z", 0.0)), (math.cos(rot), math.sin(rot), 0)),
                                  self._prism(rect, hgt), {**self.props("plumbing", fx, sh.sheet_id), "Kind": fx["kind"]}, pre)
                if fx["kind"] == "water_heater":
                    el.ObjectType = "Water heater"
                n["fixtures"] += 1
            for dv in p.get("devices", []):
                cx, cy = T(dv["pos"])
                cls, pre = DEVICE_CLASS.get(dv["kind"], DEVICE_CLASS["device"])
                z = {"outlet": 0.3, "switch": 1.2}.get(dv["kind"], lv.height - 0.3)
                s = 0.12
                rect = [(-s / 2, -s / 2), (s / 2, -s / 2), (s / 2, s / 2), (-s / 2, s / 2)]
                self._entity(cls, dv["kind"].title(), g("dev", dv["id"]), st, _matrix((cx, cy, z0 + z), (1, 0, 0)),
                             self._prism(rect, 0.08), {**self.props("electrical", dv, sh.sheet_id), "Kind": dv["kind"]}, pre)
                n["devices"] += 1
            for pp in p.get("pipes", []):
                a, b = T(pp["a"]), T(pp["b"])
                L = math.dist(a, b)
                if L < 0.02:
                    continue
                z = z0 + pp.get("z", 0.5)
                u = ((b[0] - a[0]) / L, (b[1] - a[1]) / L, 0.0)
                m = _matrix((a[0], a[1], z), (-u[1], u[0], 0), u)
                self._entity("IfcPipeSegment", f"{pp['system'].title()} pipe {pp['id'][:6]}", g("pipe", pp["id"]), st, m,
                             self._cylinder(pp.get("diameter", 0.02) / 2, L),
                             {**self.props("plumbing", pp, sh.sheet_id), "System": pp["system"], "Fitting": pp.get("fitting")},
                             "RIGIDSEGMENT")
                n["pipes"] += 1
        return n


def write_ifc(project_name: str, project_key: str, levels: list[LevelInput], path: str) -> dict:
    w = Writer(project_name, project_key)
    stats = {}
    for lv in levels:
        stats[lv.name] = w.level(lv)
    w.f.write(path)
    return stats
