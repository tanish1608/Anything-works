"""Rooms = enclosed regions between walls (openings bridged), named by the label text inside them."""

import re

from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

from app.conversion.reader import Text
from app.conversion.walls import Wall

MIN_ROOM_AREA = 0.8  # m²; smaller regions are wall slivers / shafts
_NOT_A_NAME = re.compile(r"^[\d\s.,'\"x×X/\-:=]+$|\d+\s*['\"]\s*-?\s*\d*\s*['\"]?\s*[xX×]|^\d+\s*[xX×]\s*\d+$|SCALE", re.I)


def wall_footprint(walls: list[Wall]):
    return unary_union([LineString([w.a, w.b]).buffer(w.thickness / 2, cap_style="square", join_style="mitre")
                        for w in walls if w.length > 0])


def is_name(text: str) -> bool:
    t = text.strip()
    return bool(t) and any(c.isalpha() for c in t) and not _NOT_A_NAME.search(t)


def detect_rooms(walls: list[Wall], texts: list[Text]) -> tuple[list[dict], object]:
    if not walls:
        return [], None
    fp = wall_footprint(walls)
    minx, miny, maxx, maxy = fp.bounds
    region = box(minx - 1, miny - 1, maxx + 1, maxy + 1)
    free = region.difference(fp)
    parts = list(free.geoms) if free.geom_type == "MultiPolygon" else [free]
    corner = Point(minx - 0.5, miny - 0.5)
    rooms = []
    names = [t for t in texts if is_name(t.text)]
    for poly in parts:
        if poly.contains(corner) or poly.area < MIN_ROOM_AREA:
            continue
        poly = poly.simplify(0.01)
        inside = [t for t in names if poly.contains(Point(t.pos))]
        c = poly.representative_point()
        if inside:
            # Prefer the biggest text (room names are usually larger than area/dimension notes).
            best = max(inside, key=lambda t: (round(t.height, 3), -c.distance(Point(t.pos))))
            name, conf = best.text.upper().strip(), 0.95
        else:
            name, conf = None, 0.6
        rooms.append({"polygon": [[round(x, 4), round(y, 4)] for x, y in poly.exterior.coords[:-1]],
                      "name": name, "confidence": conf, "area": round(poly.area, 2)})
    rooms.sort(key=lambda r: (-r["area"]))
    n = 0
    for r in rooms:
        if r["name"] is None:
            n += 1
            r["name"] = f"ROOM {n}"
    return rooms, fp


def outline_polygon(fp) -> Polygon | None:
    """Building outline (outer face of exterior walls) for the floor slab."""
    if fp is None:
        return None
    polys = list(fp.geoms) if fp.geom_type == "MultiPolygon" else [fp]
    biggest = max(polys, key=lambda p: Polygon(p.exterior).area)
    return Polygon(biggest.exterior)
