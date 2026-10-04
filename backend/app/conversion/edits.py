"""Review-editor operations on a plan model. Each op is small, validated and counted as a manual
correction (the conversion evaluation tracks how much fixing each drawing needed)."""

import copy
import math
import uuid

from app.conversion.detect import sid
from app.conversion.mep import PIPE_DEFAULTS
from app.conversion.reader import Text
from app.conversion.rooms import detect_rooms
from app.conversion.walls import Opening, Wall

KINDS = {"wall": "walls", "room": "rooms", "fixture": "fixtures", "device": "devices", "pipe": "pipes"}


class EditError(ValueError):
    pass


def _find(plan, kind, id_):
    if kind == "opening":
        for w in plan["walls"]:
            for o in w["openings"]:
                if o["id"] == id_:
                    return w["openings"], o
    else:
        lst = plan[KINDS[kind]]
        for x in lst:
            if x["id"] == id_:
                return lst, x
    raise EditError(f"{kind} {id_} not found")


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _pt(v) -> list[float]:
    if not (isinstance(v, list | tuple) and len(v) == 2 and all(isinstance(c, int | float) for c in v)):
        raise EditError("points must be [x, y]")
    return [round(float(v[0]), 4), round(float(v[1]), 4)]


def apply_ops(plan: dict, ops: list[dict]) -> tuple[dict, dict]:
    plan = copy.deepcopy(plan)
    c = {"added": 0, "deleted": 0, "edited": 0}
    for op in ops:
        kind = op.get("op")
        if kind == "delete":
            lst, item = _find(plan, op["kind"], op["id"])
            lst.remove(item)
            c["deleted"] += 1
        elif kind == "update_wall":
            _, w = _find(plan, "wall", op["id"])
            for k in ("thickness", "height"):
                if k in op:
                    v = op[k]
                    if v is not None and not (0.03 <= float(v) <= (1.0 if k == "thickness" else 20)):
                        raise EditError(f"{k} out of range")
                    w[k] = None if v is None else round(float(v), 4)
            w["source"] = "edited" if w.get("source") == "drawn" else w.get("source")
            c["edited"] += 1
        elif kind == "add_wall":
            a, b = _pt(op["a"]), _pt(op["b"])
            if math.dist(a, b) < 0.1:
                raise EditError("wall too short")
            t = float(op.get("thickness", 0.15))
            plan["walls"].append({"id": _new_id("w"), "a": a, "b": b, "thickness": t, "height": op.get("height"),
                                  "confidence": 1.0, "source": "added", "openings": []})
            c["added"] += 1
        elif kind == "update_opening":
            _, o = _find(plan, "opening", op["id"])
            if op.get("kind") not in ("door", "window", "opening"):
                raise EditError("kind must be door, window or opening")
            o["kind"], o["confidence"] = op["kind"], 1.0
            if o["kind"] == "window":
                o["sill"], o["height"] = 0.9, 1.2
            else:
                o["sill"], o["height"] = 0.0, 2.03 if o["kind"] == "door" else 2.1
            c["edited"] += 1
        elif kind == "add_opening":
            _, w = _find(plan, "wall", op["wall_id"])
            L = math.dist(w["a"], w["b"])
            s, e = float(op["start"]), float(op["end"])
            if not (0 <= s < e <= L):
                raise EditError("opening outside wall")
            k = op.get("kind", "door")
            w["openings"].append({"id": _new_id("o"), "kind": k, "start": s, "end": e, "confidence": 1.0,
                                  "height": 1.2 if k == "window" else 2.03, "sill": 0.9 if k == "window" else 0.0,
                                  "evidence": "added in review"})
            c["added"] += 1
        elif kind == "rename_room":
            _, r = _find(plan, "room", op["id"])
            name = str(op.get("name", "")).strip()
            if not name:
                raise EditError("name required")
            r["name"], r["confidence"] = name.upper(), 1.0
            c["edited"] += 1
        elif kind == "add_pipe":
            system = op.get("system", "cold")
            if system not in PIPE_DEFAULTS:
                raise EditError(f"unknown system {system}")
            pts = [_pt(p) for p in op.get("points", [])]
            if len(pts) < 2:
                raise EditError("a pipe needs at least two points")
            dia, z = PIPE_DEFAULTS[system]
            for a, b in zip(pts, pts[1:], strict=False):
                if math.dist(a, b) < 0.02:
                    continue
                plan["pipes"].append({"id": _new_id("p"), "system": system, "a": a, "b": b,
                                      "diameter": float(op.get("diameter", dia)), "z": float(op.get("z", z)),
                                      "fitting": "traced", "confidence": 1.0, "source": "traced"})
                c["added"] += 1
        elif kind == "update_pipe":
            _, p = _find(plan, "pipe", op["id"])
            for k in ("z", "diameter"):
                if k in op:
                    p[k] = float(op[k])
            c["edited"] += 1
        elif kind == "add_fixture":
            pos = _pt(op["pos"])
            plan["fixtures"].append({"id": _new_id("f"), "kind": op.get("kind", "fixture"), "pos": pos, "insert": pos,
                                     "size": op.get("size", [0.5, 0.5]), "z": 0.0, "confidence": 1.0, "source": "added"})
            c["added"] += 1
        elif kind == "resolve":
            plan["review"] = [r for r in plan.get("review", []) if r["id"] != op["id"]]
        elif kind == "recompute_rooms":
            walls = [Wall(tuple(w["a"]), tuple(w["b"]), w["thickness"],
                          openings=[Opening(o["start"], o["end"], o["kind"]) for o in w["openings"]]) for w in plan["walls"]]
            texts = [Text("label", lb["text"], tuple(lb["pos"]), lb["height"]) for lb in plan.get("labels", [])]
            rooms, _ = detect_rooms(walls, texts)
            for r in rooms:
                r["id"] = sid("room", r["name"])
            plan["rooms"] = rooms
        else:
            raise EditError(f"unknown op {kind}")
    return plan, c
