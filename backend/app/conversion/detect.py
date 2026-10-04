"""Sheet detection: DXF → editable plan model (JSON-serialisable dict, metres, sheet coordinates)."""

import hashlib
import math

from shapely.geometry import LineString, Point, box

from app.conversion.layers import classify_block, suggest_roles
from app.conversion.mep import detect_fixtures, detect_pipes
from app.conversion.reader import RawDrawing, read_dxf
from app.conversion.rooms import detect_rooms, is_name, outline_polygon
from app.conversion.walls import Opening, Wall, detect_walls

DOOR_H, WIN_SILL, WIN_H, OPENING_H = 2.03, 0.9, 1.2, 2.1
PIPE_ROLES = {"pipe_cold", "pipe_hot", "pipe_waste", "pipe_vent", "pipe_gas"}


def sid(*parts) -> str:
    """Stable short id from geometry, so re-running detection keeps ids (and element identity)."""
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:12]


def _r(p, nd=2):
    return (round(p[0], nd), round(p[1], nd))


def _evidence(raw: RawDrawing, roles: dict[str, str]):
    ev = []
    for ins in raw.inserts:
        c = classify_block(ins.name, roles.get(ins.layer))
        if c and c[0] in ("door", "window"):
            ev.append((c[0], box(*ins.bbox), ins))
    for a in raw.arcs:
        if roles.get(a.layer) in ("door", "auto") and 0.5 <= a.radius <= 1.3 and abs((a.end - a.start) % 360 - 90) < 5:
            ev.append(("door", Point(a.center).buffer(a.radius * 0.3), None))
    for s in raw.segs:
        if roles.get(s.layer) == "window":
            ev.append(("window", LineString([s.a, s.b]), None))
    return ev


def _place_unmatched(walls: list[Wall], ev) -> int:
    """Door/window symbols that didn't fall in a wall gap (walls drawn through windows): add the opening
    to the nearest wall. Also upgrades bare gaps that have a symbol."""
    added = 0
    for kind, geom, ins in ev:
        if ins is None:
            continue
        c = geom.centroid
        best = None
        for w in walls:
            d = w.line().distance(c)
            if d <= max(w.thickness, 0.2) + 0.05 and (best is None or d < best[0]):
                best = (d, w)
        if not best:
            continue
        w = best[1]
        u = w.dir
        x0, y0, x1, y1 = geom.bounds
        ts = sorted(((x - w.a[0]) * u[0] + (y - w.a[1]) * u[1]) for x in (x0, x1) for y in (y0, y1))
        lo, hi = max(0.0, ts[0]), min(w.length, ts[-1])
        if kind == "door":  # a door block's bbox includes the swing; width is along the wall
            hi = min(hi, lo + max(0.6, min(hi - lo, 1.25)))
        if hi - lo < 0.3:
            continue
        hit = [o for o in w.openings if o.start < hi and o.end > lo]
        if hit:
            for o in hit:
                if o.kind == "opening" or o.confidence < 0.9:
                    o.kind, o.confidence, o.evidence = kind, 0.9, f"{kind} symbol"
            continue
        w.openings.append(Opening(lo, hi, kind, 0.8, f"{kind} symbol on continuous wall"))
        w.openings.sort(key=lambda o: o.start)
        added += 1
    return added


def detect_plan(path: str, discipline: str, role_overrides: dict[str, str] | None = None,
                unit_override: float | None = None) -> dict:
    return detect_from_raw(read_dxf(path, unit_override), discipline, role_overrides)


def detect_from_raw(raw: RawDrawing, discipline: str, role_overrides: dict[str, str] | None = None) -> dict:
    """Detection on an already-parsed drawing (DXF or vector PDF), coordinates in metres."""
    roles = suggest_roles(raw.layers)
    roles.update(role_overrides or {})
    warnings: list[str] = list(getattr(raw, "notes", []))
    review: list[dict] = []

    wall_segs = [s for s in raw.segs if roles.get(s.layer) in ("wall", "auto") and s.poly is None
                 or roles.get(s.layer) in ("wall", "auto") and raw.polylines[s.poly].closed is False
                 or roles.get(s.layer) == "wall"]
    ev = _evidence(raw, roles)
    walls, wstats = detect_walls(wall_segs, [(k, g) for k, g, _ in ev])
    _place_unmatched(walls, ev)
    rooms, fp = detect_rooms(walls, [t for t in raw.texts if roles.get(t.layer) in ("room_label", "auto")])
    outline = outline_polygon(fp)

    plan: dict = {
        "units": {"unit_m": raw.unit_m, "name": raw.units, "source": raw.unit_source},
        "layers": {name: {"role": roles[name], "count": n} for name, n in raw.layers.items()},
        "extents": [round(float(v), 3) for v in raw.extents],
        "walls": [], "rooms": [], "fixtures": [], "devices": [], "pipes": [], "slab": None,
        "warnings": warnings, "review": review, "stats": {"walls": wstats},
    }
    is_arch = discipline in ("architecture", "structure")
    if outline is not None:
        plan["footprint"] = [[round(x, 4), round(y, 4)] for x, y in outline.exterior.coords[:-1]]
    if is_arch:
        for w in walls:
            wid = sid("wall", _r(w.a, 1), _r(w.b, 1))
            ops = []
            for o in w.openings:
                h, sill = {"door": (DOOR_H, 0.0), "window": (WIN_H, WIN_SILL)}.get(o.kind, (OPENING_H, 0.0))
                ops.append({"id": sid("op", wid, round(o.start, 1)), "kind": o.kind, "start": round(o.start, 4),
                            "end": round(o.end, 4), "height": h, "sill": sill, "confidence": o.confidence,
                            "evidence": o.evidence})
                if o.confidence < 0.7:
                    review.append({"id": ops[-1]["id"], "type": "opening", "reason": "Gap in wall with no door or "
                                   "window symbol: confirm it's an opening"})
            plan["walls"].append({"id": wid, "a": list(_r(w.a, 4)), "b": list(_r(w.b, 4)), "thickness": w.thickness,
                                  "height": None, "confidence": w.confidence, "source": "drawn", "openings": ops})
        for r in rooms:
            rid = sid("room", r["name"]) if r["confidence"] > 0.9 else sid("room", _r(r["polygon"][0], 1))
            plan["rooms"].append({"id": rid, **r})
            if r["confidence"] < 0.9:
                review.append({"id": rid, "type": "room", "reason": "No room name found: rename it"})
        if outline is not None:
            plan["slab"] = {"polygon": plan["footprint"], "thickness": 0.2}
        if not walls:
            warnings.append("No walls found. Check the layer roles (which layer holds the walls?) and the scale.")
        if wstats["unpaired_long_lines"]:
            warnings.append(f"{wstats['unpaired_long_lines']} long lines on wall layers weren't part of a wall pair "
                            "(single-line walls or annotation). Add missing walls in the editor if needed.")
    if discipline == "plumbing":
        fixtures, _ = detect_fixtures(raw.inserts, roles)
        pipes = detect_pipes(raw.segs, raw.polylines, roles)
        for f in fixtures:
            f["id"] = sid("fx", f["kind"], _r(f["insert"], 2))
            f["z"] = 0.0
            plan["fixtures"].append(f)
        for p in pipes:
            p["id"] = sid("pipe", p["system"], *sorted([_r(p["a"], 2), _r(p["b"], 2)]))
            p["source"] = "drawn"
            plan["pipes"].append(p)
        if not pipes:
            warnings.append("No pipe runs are drawn on this sheet (fixtures only). That's normal for residential "
                            "sets where the plumber routes on site; nothing has been invented. Trace runs in the "
                            "review editor if you want to track them.")
        if not fixtures:
            warnings.append("No plumbing fixtures recognised. Check the fixture layer role or block names.")
    if discipline == "electrical":
        _, devices = detect_fixtures(raw.inserts, roles)
        for d in devices:
            d["id"] = sid("dev", d["kind"], _r(d["insert"], 2))
            plan["devices"].append(d)
        wires = [s for s in raw.segs if roles.get(s.layer) == "wire"]
        if not wires:
            warnings.append("No wiring runs drawn (devices only); nothing has been invented.")
    plan["labels"] = [{"text": t.text, "pos": [round(t.pos[0], 4), round(t.pos[1], 4)], "height": round(t.height, 4)}
                      for t in raw.texts if roles.get(t.layer) in ("room_label", "auto") and is_name(t.text)]
    plan["counts"] = counts(plan)
    return plan


def counts(plan: dict) -> dict:
    ops = [o for w in plan["walls"] for o in w["openings"]]
    by = {}
    for f in plan["fixtures"]:
        by[f["kind"]] = by.get(f["kind"], 0) + 1
    dev = {}
    for d in plan["devices"]:
        dev[d["kind"]] = dev.get(d["kind"], 0) + 1
    return {
        "walls": len(plan["walls"]),
        "wall_centerline_m": round(sum(math.dist(w["a"], w["b"]) for w in plan["walls"]), 2),
        "doors": sum(o["kind"] == "door" for o in ops),
        "windows": sum(o["kind"] == "window" for o in ops),
        "cased_openings": sum(o["kind"] == "opening" for o in ops),
        "rooms": len(plan["rooms"]),
        "fixtures": by,
        "devices": dev,
        "pipe_segments": len(plan["pipes"]),
    }
