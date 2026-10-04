"""MEP detection: fixtures/devices from block inserts; pipes split into straight segments between
fittings, junctions and fixture connections. Only what is drawn is modelled."""

import math

from app.conversion.layers import classify_block
from app.conversion.reader import Insert, Polyline, Pt, Seg

SNAP = 0.02  # m
PIPE_DEFAULTS = {  # system: (diameter m, height above floor m)
    "cold": (0.02, 0.5),
    "hot": (0.02, 0.55),
    "waste": (0.075, -0.15),
    "vent": (0.05, 2.6),
    "gas": (0.025, 0.4),
}
FIXTURE_SIZE = {  # kind: (height m, default footprint if the block has none)
    "toilet": 0.4, "lavatory": 0.85, "kitchen_sink": 0.9, "bathtub": 0.5, "shower": 0.1, "water_heater": 1.5,
    "dishwasher": 0.85, "washer_box": 1.1, "fixture": 0.8, "outlet": 0.08, "switch": 0.1, "light": 0.08,
    "device": 0.1,
}
DEVICE_Z = {"outlet": 0.3, "switch": 1.2, "light": None, "device": 1.0}  # None = ceiling


def detect_fixtures(inserts: list[Insert], roles: dict[str, str]) -> tuple[list[dict], list[dict]]:
    fixtures, devices = [], []
    for ins in inserts:
        role = roles.get(ins.layer, "auto")
        if role == "ignore":
            continue
        c = classify_block(ins.name, role)
        if c is None or c[0] not in ("fixture", "device"):
            continue
        cat, kind = c
        x0, y0, x1, y1 = ins.bbox
        w, d = max(x1 - x0, 0.08), max(y1 - y0, 0.08)
        item = {"kind": kind, "pos": [round((x0 + x1) / 2, 4), round((y0 + y1) / 2, 4)], "size": [round(w, 3), round(d, 3)],
                "insert": [round(ins.pos[0], 4), round(ins.pos[1], 4)], "block": ins.name,
                "confidence": 0.9 if kind not in ("fixture", "device") else 0.6}
        (fixtures if cat == "fixture" else devices).append(item)
    return fixtures, devices


def _key(p: Pt) -> tuple[int, int]:
    return (round(p[0] / SNAP), round(p[1] / SNAP))


def _point_on_seg(p: Pt, a: Pt, b: Pt, tol: float = SNAP) -> float | None:
    """Parameter t in (0,1) if p lies on the interior of a-b."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy
    if L2 == 0:
        return None
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2
    if t <= 1e-6 or t >= 1 - 1e-6:
        return None
    q = (a[0] + dx * t, a[1] + dy * t)
    return t if math.dist(p, q) <= tol else None


def split_pipes(segs: list[Seg], fixture_points: list[Pt] = ()) -> list[tuple[Pt, Pt, str]]:
    """Straight segments between nodes. Nodes = polyline vertices/ends, T-junctions on another run, and
    points closest to fixtures. Collinear pieces through plain 2-way nodes are merged."""
    pieces = [(s.a, s.b) for s in segs if s.length > SNAP]
    # split at T-junctions: an endpoint of one piece lying on the interior of another
    ends = [p for a, b in pieces for p in (a, b)]
    changed = True
    while changed:
        changed = False
        for i, (a, b) in enumerate(pieces):
            for p in ends:
                t = _point_on_seg(p, a, b)
                if t is not None:
                    pieces[i] = (a, p)
                    pieces.append((p, b))
                    changed = True
                    break
            if changed:
                break
    # graph
    adj: dict[tuple[int, int], list[int]] = {}
    for i, (a, b) in enumerate(pieces):
        adj.setdefault(_key(a), []).append(i)
        adj.setdefault(_key(b), []).append(i)
    fixture_keys = {_key(p) for p in fixture_points}

    def direction(i, from_key):
        a, b = pieces[i]
        if _key(a) != from_key:
            a, b = b, a
        L = math.dist(a, b) or 1
        return ((b[0] - a[0]) / L, (b[1] - a[1]) / L)

    # merge straight-through degree-2 nodes
    merged = True
    while merged:
        merged = False
        for k, idxs in list(adj.items()):
            live = [i for i in idxs if pieces[i] is not None]
            if len(live) != 2 or k in fixture_keys:
                continue
            i, j = live
            di, dj = direction(i, k), direction(j, k)
            if di[0] * dj[0] + di[1] * dj[1] > -0.9994:  # not straight through (> ~2°)
                continue
            ai = pieces[i][0] if _key(pieces[i][1]) == k else pieces[i][1]
            bj = pieces[j][0] if _key(pieces[j][1]) == k else pieces[j][1]
            pieces[i], pieces[j] = (ai, bj), None
            adj[k] = []
            adj[_key(bj)] = [i if x == j else x for x in adj[_key(bj)]]
            merged = True
            break
    out = []
    for p in pieces:
        if p is None:
            continue
        a, b = p
        da, db = len([i for i in adj.get(_key(a), []) if pieces[i] is not None]), len(
            [i for i in adj.get(_key(b), []) if pieces[i] is not None])
        fitting = "tee" if max(da, db) >= 3 else ("elbow" if min(da, db) == 2 else "end")
        out.append((a, b, fitting))
    return out


def detect_pipes(segs: list[Seg], polylines: list[Polyline], roles: dict[str, str]) -> list[dict]:
    out = []
    for system in PIPE_DEFAULTS:
        layer_segs = [s for s in segs if roles.get(s.layer) == f"pipe_{system}"]
        if not layer_segs:
            continue
        dia, z = PIPE_DEFAULTS[system]
        for a, b, fitting in split_pipes(layer_segs):
            out.append({"system": system, "a": [round(a[0], 4), round(a[1], 4)], "b": [round(b[0], 4), round(b[1], 4)],
                        "diameter": dia, "z": z, "fitting": fitting, "confidence": 0.9})
    return out
