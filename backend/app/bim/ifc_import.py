"""Import one or more IFC files (a federated model: architecture, structure, MEP...) into a draft
ModelVersion: elements + revisions, levels from storeys, zones from IfcSpaces, per-discipline GLBs."""

import hashlib
import logging
from dataclasses import dataclass, field
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element as uel
import ifcopenshell.util.unit as uunit
import numpy as np
from shapely.geometry import MultiPoint, Point, Polygon
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.bim.meshes import build_glb
from app.disciplines import discipline_for, trade_for
from app.models import Building, Element, ElementRevision, Level, ModelVersion, Project, Zone, new_id
from app.services import events
from app.storage import get_storage

log = logging.getLogger(__name__)

SKIP_CLASSES = ("IfcSpatialElement", "IfcOpeningElement", "IfcAnnotation", "IfcGrid", "IfcVirtualElement",
                "IfcSpatialStructureElement")


@dataclass
class Item:
    guid: str
    ifc_class: str
    name: str | None
    discipline: str
    storey: tuple[str, str, float] | None  # (building name, storey name, elevation m)
    verts: np.ndarray
    faces: np.ndarray
    props: dict = field(default_factory=dict)
    source: str = "imported"
    confidence: float | None = None

    @property
    def bbox(self) -> list[float]:
        return [round(float(x), 4) for x in (*self.verts.min(0), *self.verts.max(0))]

    @property
    def geom_hash(self) -> str:
        return hashlib.sha1(np.round(self.verts, 3).tobytes() + self.faces.tobytes()).hexdigest()


@dataclass
class SpaceInfo:
    building: str
    storey: str
    elevation: float
    name: str
    code: str | None
    polygon: list[list[float]]


def _flat_props(product) -> dict:
    out = {}
    try:
        for pset, values in uel.get_psets(product).items():
            for k, v in values.items():
                if k != "id" and isinstance(v, str | int | float | bool) and len(out) < 60:
                    out[f"{pset}.{k}"] = v
    except Exception:  # noqa: BLE001 - property extraction is best effort
        pass
    return out


def _storey_of(product) -> tuple[str, str, float] | None:
    c = uel.get_container(product) or uel.get_aggregate(product)
    while c is not None and not c.is_a("IfcBuildingStorey"):
        c = uel.get_aggregate(c) or uel.get_container(c)
    if c is None:
        return None
    b = uel.get_aggregate(c)
    scale = uunit.calculate_unit_scale(product.file)
    return (b.Name if b is not None and b.Name else "Building", c.Name or "Level", float(c.Elevation or 0) * scale)


def _space_polygon(space, geo) -> list[list[float]] | None:
    """Exact plan outline: our own exports carry it as a property; otherwise project the mesh."""
    import json

    try:
        raw = uel.get_psets(space).get("SiteMesh", {}).get("Polygon")
        if raw:
            return [[round(x, 3), round(y, 3)] for x, y in json.loads(raw)]
    except Exception:  # noqa: BLE001
        pass
    from shapely.ops import unary_union

    v, f = geo
    tris = [Polygon(v[t][:, :2]) for t in f]
    shape = unary_union([t for t in tris if t.is_valid and t.area > 1e-8]).buffer(0)
    if shape.is_empty:
        return None
    if shape.geom_type == "MultiPolygon":
        shape = max(shape.geoms, key=lambda g: g.area)
    shape = shape.simplify(0.005)
    return [[round(x, 3), round(y, 3)] for x, y in shape.exterior.coords[:-1]]


def read_ifc(path: str | Path, discipline_hint: str | None = None) -> tuple[list[Item], list[SpaceInfo]]:
    f = ifcopenshell.open(str(path))
    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)
    shapes: dict[int, tuple[np.ndarray, np.ndarray]] = {}
    it = ifcopenshell.geom.iterator(settings, f)
    if it.initialize():
        while True:
            sh = it.get()
            v = np.array(sh.geometry.verts, dtype=np.float64).reshape(-1, 3)
            fa = np.array(sh.geometry.faces, dtype=np.int32).reshape(-1, 3)
            shapes[sh.id] = (v, fa)
            if not it.next():
                break

    items, spaces = [], []
    for p in f.by_type("IfcProduct"):
        geo = shapes.get(p.id())
        if p.is_a("IfcSpace"):
            st = _storey_of(p)
            if geo is not None and st is not None:
                poly = _space_polygon(p, geo)
                if poly:
                    name = p.LongName or p.Name or "Space"
                    spaces.append(SpaceInfo(st[0], st[1], st[2], name, p.Name if p.LongName and p.Name != name else None,
                                            poly))
            continue
        if any(p.is_a(c) for c in SKIP_CLASSES) or geo is None or len(geo[1]) == 0:
            continue
        props = _flat_props(p)
        hint = props.get("SiteMesh.Discipline") or discipline_hint
        items.append(Item(
            guid=p.GlobalId, ifc_class=p.is_a(), name=p.Name, storey=_storey_of(p),
            discipline=discipline_for(p.is_a(), getattr(p, "PredefinedType", None), hint),
            verts=geo[0], faces=geo[1], props=props,
            source=props.get("SiteMesh.Source", "imported"), confidence=props.get("SiteMesh.Confidence"),
        ))
    return items, spaces


# ------------------------------------------------------------------ persistence

class _Structure:
    """Finds or creates buildings/levels/zones by name inside a project."""

    def __init__(self, db: Session, project_id: str, actor_id: str | None):
        self.db, self.pid, self.actor = db, project_id, actor_id
        self.buildings = {b.name: b for b in db.scalars(select(Building).where(Building.project_id == project_id))}

    def building(self, name: str) -> Building:
        if name not in self.buildings:
            if len(self.buildings) == 1 and name == "Building":
                return next(iter(self.buildings.values()))
            b = Building(id=new_id(), project_id=self.pid, name=name)
            self.db.add(b)
            self.db.flush()
            events.record(self.db, project_id=self.pid, actor_id=self.actor, type="building.created",
                          entity_type="building", entity_id=b.id, data={"name": name, "via": "model import"})
            self.buildings[name] = b
        return self.buildings[name]

    def level(self, bname: str, lname: str, elevation: float) -> Level:
        b = self.building(bname)
        lv = self.db.scalar(select(Level).where(Level.building_id == b.id, Level.name == lname))
        if lv is None:
            idx = self.db.scalar(select(func.count()).where(Level.building_id == b.id)) or 0
            lv = Level(id=new_id(), building_id=b.id, name=lname, index=idx, elevation_m=elevation)
            self.db.add(lv)
            self.db.flush()
            events.record(self.db, project_id=self.pid, actor_id=self.actor, type="level.created",
                          entity_type="level", entity_id=lv.id, data={"name": lname, "via": "model import"})
        return lv

    def zone(self, lv: Level, name: str, code: str | None, polygon: list) -> Zone:
        z = self.db.scalar(select(Zone).where(Zone.level_id == lv.id, Zone.name == name))
        if z is None:
            z = Zone(id=new_id(), level_id=lv.id, name=name, code=code, polygon=polygon)
            self.db.add(z)
            self.db.flush()
            events.record(self.db, project_id=self.pid, actor_id=self.actor, type="zone.created",
                          entity_type="zone", entity_id=z.id, zone_id=z.id, data={"name": name, "via": "model import"})
        elif not z.polygon:
            z.polygon = polygon
        return z


def _assign_zone(item: Item, zones: list[tuple[Zone, Polygon]]) -> Zone | None:
    """Zone whose polygon contains the element's plan centroid; else the one it overlaps most."""
    bb = item.bbox
    c = Point((bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2)
    for z, poly in zones:
        if poly.contains(c):
            return z
    foot = MultiPoint(item.verts[:, :2]).convex_hull
    best, best_area = None, 0.0
    for z, poly in zones:
        a = poly.intersection(foot).area if foot.area > 0 else (0.0 if poly.distance(c) > 0.05 else 1e-6)
        if a > best_area:
            best, best_area = z, a
    return best


def create_version(db: Session, project: Project, items: list[Item], spaces: list[SpaceInfo], *,
                   actor_id: str | None, message: str, source: str, extra_files: dict | None = None,
                   stats: dict | None = None) -> ModelVersion:
    st = _Structure(db, project.id, actor_id)
    for s in spaces:
        st.zone(st.level(s.building, s.storey, s.elevation), s.name, s.code, s.polygon)
    db.flush()

    number = (db.scalar(select(func.max(ModelVersion.number)).where(ModelVersion.project_id == project.id)) or 0) + 1
    version = ModelVersion(id=new_id(), project_id=project.id, number=number, parent_id=project.current_version_id,
                           message=message, source=source, status="draft", author_id=actor_id)
    db.add(version)
    db.flush()

    existing = {e.ifc_guid: e for e in db.scalars(select(Element).where(Element.project_id == project.id))}
    zone_cache: dict[str, list[tuple[Zone, Polygon]]] = {}
    by_disc: dict[str, list] = {}
    seen: set[str] = set()
    for it in items:
        if it.guid in seen:  # federated files often repeat shared elements
            continue
        seen.add(it.guid)
        el = existing.get(it.guid)
        if el is None:
            el = Element(id=new_id(), project_id=project.id, ifc_guid=it.guid)
            db.add(el)
            existing[it.guid] = el
        lv = st.level(*it.storey) if it.storey else None
        zone = None
        if lv is not None:
            if lv.id not in zone_cache:
                zone_cache[lv.id] = [(z, Polygon(z.polygon)) for z in
                                     db.scalars(select(Zone).where(Zone.level_id == lv.id))
                                     if z.polygon and len(z.polygon) >= 3]
            zone = _assign_zone(it, zone_cache[lv.id])
        db.add(ElementRevision(version_id=version.id, element_id=el.id, name=it.name, ifc_class=it.ifc_class,
                               discipline=it.discipline, trade=trade_for(it.discipline),
                               level_id=lv.id if lv else None, zone_id=zone.id if zone else None,
                               bbox=it.bbox, props=it.props, source=it.source, confidence=it.confidence,
                               geom_hash=it.geom_hash))
        by_disc.setdefault(it.discipline, []).append((el.id, it.verts, it.faces))
    db.flush()

    store = get_storage()
    meshes = {}
    for disc, ms in by_disc.items():
        key = f"projects/{project.id}/models/v{number}-{version.id[:8]}/{disc}.glb"
        store.put_bytes(key, build_glb(ms))
        meshes[disc] = key
    version.files = {"meshes": meshes, **(extra_files or {})}
    version.stats = {"elements": len(seen), "by_discipline": {d: len(m) for d, m in by_disc.items()},
                     "zones_from_model": len(spaces), **(stats or {})}
    events.record(db, project_id=project.id, actor_id=actor_id, type="model.version_created",
                  entity_type="model_version", entity_id=version.id, message=message,
                  data={"number": number, "source": source, "stats": version.stats})
    return version


def import_ifc(db: Session, project: Project, files: list[tuple[str, str | None]], *, actor_id: str | None,
               message: str) -> ModelVersion:
    """files: (storage key of the uploaded .ifc, discipline hint or None)."""
    items, spaces = [], []
    store = get_storage()
    for key, hint in files:
        i, s = read_ifc(store.local_path(key), hint)
        items += i
        spaces += s
    return create_version(db, project, items, spaces, actor_id=actor_id, message=message, source="ifc_import",
                          extra_files={"ifc": [k for k, _ in files]})
