"""Generate sample residential DXF drawings with known ground truth (expected.json next to each file).

    cd backend && .venv/bin/python ../samples/dxf/generate.py

Drawings mimic common US residential CAD conventions: walls drawn as their outline (double lines)
with gaps at doors/windows, door blocks with swing arcs, window blocks, room name labels, AIA-style
layer names, and plumbing/electrical sheets with fixture blocks (and, on some sheets, pipe runs).
All content here is original and generated; licence: CC0.
"""

import json
import math
from pathlib import Path

import ezdxf
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

OUT = Path(__file__).parent


# ----------------------------------------------------------------------------- plan definition helpers

class Plan:
    def __init__(self, units: str):
        self.units = units  # "in" | "mm"
        self.walls: list[tuple[tuple[float, float], tuple[float, float], float]] = []  # (p1, p2, thickness)
        self.openings: list[dict] = []  # {"wall": i, "at": t0, "width": w, "kind": door|window|opening}
        self.rooms: list[tuple[str, tuple[float, float]]] = []

    def wall(self, p1, p2, t):
        self.walls.append((p1, p2, t))
        return len(self.walls) - 1

    def opening(self, wall, start, width, kind):
        self.openings.append({"wall": wall, "start": start, "width": width, "kind": kind})

    def wall_poly(self, i):
        (x1, y1), (x2, y2), t = self.walls[i]
        return LineString([(x1, y1), (x2, y2)]).buffer(t / 2, cap_style="square", join_style="mitre")

    def opening_geom(self, o):
        (x1, y1), (x2, y2), t = self.walls[o["wall"]]
        L = math.hypot(x2 - x1, y2 - y1)
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        a = (x1 + ux * o["start"], y1 + uy * o["start"])
        b = (x1 + ux * (o["start"] + o["width"]), y1 + uy * (o["start"] + o["width"]))
        return a, b, (ux, uy), t

    def outline(self):
        walls = unary_union([self.wall_poly(i) for i in range(len(self.walls))])
        cuts = []
        for o in self.openings:
            a, b, (ux, uy), t = self.opening_geom(o)
            nx, ny = -uy, ux
            h = t  # cut a bit wider than the wall
            cuts.append(Polygon([(a[0] + nx * h, a[1] + ny * h), (b[0] + nx * h, b[1] + ny * h),
                                 (b[0] - nx * h, b[1] - ny * h), (a[0] - nx * h, a[1] - ny * h)]))
        return walls.difference(unary_union(cuts)) if cuts else walls


def to_m(v, units):
    return v * (0.0254 if units == "in" else 0.001)


def new_doc(units):
    doc = ezdxf.new("R2018", setup=True)
    doc.header["$INSUNITS"] = 1 if units == "in" else 4
    msp = doc.modelspace()
    # door: hinge at origin, leaf along +y, swing arc to +x. Unit size; scaled by width on insert.
    b = doc.blocks.new("DOOR")
    b.add_line((0, 0), (0, 1))
    b.add_arc((0, 0), 1, 0, 90)
    b = doc.blocks.new("WINDOW")  # unit square: x along wall (width), y across wall (thickness), centred on y
    b.add_lwpolyline([(0, -0.5), (1, -0.5), (1, 0.5), (0, 0.5)], close=True)
    b.add_line((0, 0), (1, 0))
    return doc, msp


def draw_arch(msp, plan: Plan, layers=("A-WALL", "A-DOOR", "A-GLAZ", "A-AREA-IDEN"), labels=True, noise=False):
    wall_layer, door_layer, win_layer, label_layer = layers
    geom = plan.outline()
    polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
    for p in polys:
        for ring in [p.exterior, *p.interiors]:
            cs = list(ring.coords)
            for a, b in zip(cs, cs[1:], strict=False):
                msp.add_line(a, b, dxfattribs={"layer": wall_layer})
    doors = windows = 0
    for o in plan.openings:
        a, b, (ux, uy), t = plan.opening_geom(o)
        ang = math.degrees(math.atan2(uy, ux))
        if o["kind"] == "door":
            # hinge at a, leaf perpendicular to the wall, arc swinging to b
            msp.add_blockref("DOOR", a, dxfattribs={"layer": door_layer, "xscale": o["width"], "yscale": o["width"],
                                                    "rotation": ang})
            doors += 1
        elif o["kind"] == "window":
            msp.add_blockref("WINDOW", a, dxfattribs={"layer": win_layer, "xscale": o["width"], "yscale": t,
                                                      "rotation": ang})
            windows += 1
    if labels:
        h = 9 if plan.units == "in" else 230
        for name, (x, y) in plan.rooms:
            msp.add_text(name, height=h, dxfattribs={"layer": label_layer, "insert": (x - len(name) * h * 0.35, y)})
            msp.add_text("12'-0\" x 10'-0\"" if plan.units == "in" else "3600 x 3000", height=h * 0.6,
                         dxfattribs={"layer": label_layer, "insert": (x - 3 * h, y - 1.6 * h)})
    if noise:  # furniture on the same layer as everything else
        for x, y, w, d in [(30, 230, 60, 80), (380, 220, 54, 75)]:
            k = 1 if plan.units == "in" else 25.4
            msp.add_lwpolyline([(x * k, y * k), ((x + w) * k, y * k), ((x + w) * k, (y + d) * k), (x * k, (y + d) * k)],
                               close=True, dxfattribs={"layer": wall_layer})
    return doors, windows


def centerline_length_m(plan: Plan) -> float:
    return round(sum(to_m(math.dist(p1, p2), plan.units) for p1, p2, _ in plan.walls), 2)


def title_block(msp, x, y, text, scale_text, units):
    h = 12 if units == "in" else 300
    msp.add_text(text, height=h, dxfattribs={"layer": "TITLE", "insert": (x, y)})
    msp.add_text(scale_text, height=h * 0.7, dxfattribs={"layer": "TITLE", "insert": (x, y - 2 * h)})


# ----------------------------------------------------------------------------- house A (inches)

def house_a() -> Plan:
    p = Plan("in")
    T, t = 6.0, 4.5
    # exterior centreline rectangle 0..480 x 0..360 (outer faces at -3/483 ...)
    s = p.wall((0, 0), (480, 0), T)
    e = p.wall((480, 0), (480, 360), T)
    n = p.wall((480, 360), (0, 360), T)
    w = p.wall((0, 360), (0, 0), T)
    i1 = p.wall((0, 200), (240, 200), t)
    i2 = p.wall((240, 0), (240, 360), t)
    i3 = p.wall((240, 180), (480, 180), t)
    i4 = p.wall((340, 180), (340, 360), t)
    p.opening(s, 100, 36, "door")      # front door
    p.opening(s, 300, 72, "window")    # kitchen window
    p.opening(w, 228, 72, "window")    # living window (wall runs top->bottom: 360-228-72 = y 60..132)
    p.opening(w, 50, 60, "window")     # bedroom 1 window (y 250..310)
    p.opening(n, 40, 60, "window")     # bedroom 2 window (x 380..440)
    p.opening(n, 180, 30, "window")    # bath window (x 270..300)
    p.opening(i1, 150, 32, "door")     # living -> bedroom 1
    p.opening(i2, 60, 60, "opening")   # living <-> kitchen cased opening
    p.opening(i3, 30, 30, "door")      # kitchen -> bath
    p.opening(i3, 160, 32, "door")     # kitchen -> bedroom 2
    p.rooms = [("LIVING", (120, 100)), ("BEDROOM 1", (120, 280)), ("KITCHEN", (360, 90)),
               ("BATH", (290, 270)), ("BEDROOM 2", (410, 270))]
    return p


FIXTURE_BLOCKS = {
    # name: (outline polyline in unit-ish inches, kind)
    "WC": ([(-9, 0), (9, 0), (9, -8), (7, -26), (-7, -26), (-9, -8)], "toilet"),
    "LAV": ([(-10, 0), (10, 0), (10, -18), (-10, -18)], "lavatory"),
    "SINK-K": ([(-16, 0), (16, 0), (16, -22), (-16, -22)], "kitchen_sink"),
    "TUB": ([(0, 0), (60, 0), (60, 30), (0, 30)], "bathtub"),
    "WH": None,  # circle, water heater
}


def add_fixture_blocks(doc):
    for name, spec in FIXTURE_BLOCKS.items():
        b = doc.blocks.new(name)
        if spec is None:
            b.add_circle((0, 0), 11)
        else:
            b.add_lwpolyline(spec[0], close=True)


def house_a_plumbing(with_pipes: bool):
    p = house_a()
    doc, msp = new_doc("in")
    add_fixture_blocks(doc)
    draw_arch(msp, p, layers=("A-WALL", "A-DOOR", "A-GLAZ", "A-AREA-IDEN"), labels=True)
    fx = [("WC", (262, 354), 0), ("LAV", (310, 354), 0), ("TUB", (246, 186), 0), ("SINK-K", (336, 3), 180),
          ("WH", (466, 166), 0)]
    for name, pos, rot in fx:
        msp.add_blockref(name, pos, dxfattribs={"layer": "P-FIXT", "rotation": rot})
    segments = 0
    if with_pipes:
        # water heater -> kitchen sink (cold + hot), and up the wall to the bath
        cold = [[(466, 155), (466, 30), (350, 30), (350, 8)],      # WH area -> sink
                [(466, 155), (440, 175), (300, 175), (300, 340), (262, 340)],  # -> WC  (branch at 300,175? no: separate run)
                [(300, 340), (310, 340)]]                         # tee off to lavatory (starts at existing vertex)
        hot = [[(458, 150), (458, 40), (356, 40), (356, 8)],
               [(458, 150), (430, 170), (310, 170), (310, 335)]]
        waste = [[(262, 330), (262, 300), (230, 300)], [(310, 330), (310, 300), (262, 300)],
                 [(336, -10), (336, -40)]]
        for layer, runs in [("P-DOMW-CPIP", cold), ("P-DOMW-HPIP", hot), ("P-SANR-PIPE", waste)]:
            for r in runs:
                msp.add_lwpolyline(r, dxfattribs={"layer": layer})
                segments += len(r) - 1
    title_block(msp, 0, -80, "PLUMBING PLAN - LEVEL 1", 'SCALE: 1/4" = 1\'-0"', "in")
    return doc, p, segments, {"toilet": 1, "lavatory": 1, "bathtub": 1, "kitchen_sink": 1, "water_heater": 1}


def house_a_arch():
    p = house_a()
    doc, msp = new_doc("in")
    doors, windows = draw_arch(msp, p)
    title_block(msp, 0, -80, "FLOOR PLAN - LEVEL 1", 'SCALE: 1/4" = 1\'-0"', "in")
    msp.add_linear_dim(base=(0, -30), p1=(-3, -3), p2=(483, -3), dxfattribs={"layer": "A-ANNO-DIMS"}).render()
    return doc, p, doors, windows


def house_a_electrical():
    p = house_a()
    doc, msp = new_doc("in")
    draw_arch(msp, p)
    for name in ("RECEP", "SWITCH", "LIGHT"):
        b = doc.blocks.new(name)
        b.add_circle((0, 0), 4)
        if name == "RECEP":
            b.add_line((-2, -1), (-2, 1))
            b.add_line((2, -1), (2, 1))
    devices = {"RECEP": [(60, 4), (180, 4), (4, 150), (120, 196), (260, 4), (476, 90), (300, 184), (420, 356)],
               "SWITCH": [(140, 10), (170, 205), (250, 120), (330, 186)],
               "LIGHT": [(120, 100), (120, 280), (360, 90), (290, 270), (410, 270)]}
    for name, pts in devices.items():
        for pt in pts:
            msp.add_blockref(name, pt, dxfattribs={"layer": "E-POWR" if name == "RECEP" else "E-LITE"})
    title_block(msp, 0, -80, "ELECTRICAL PLAN - LEVEL 1", 'SCALE: 1/4" = 1\'-0"', "in")
    return doc, {"outlet": 8, "switch": 4, "light": 5}


# ----------------------------------------------------------------------------- duplex (millimetres, generic layers)

def duplex_level(level: int) -> Plan:
    p = Plan("mm")
    T, t = 200, 100
    W, D = 14000, 9000
    s = p.wall((0, 0), (W, 0), T)
    p.wall((W, 0), (W, D), T)
    n = p.wall((W, D), (0, D), T)
    p.wall((0, D), (0, 0), T)
    party = p.wall((7000, 0), (7000, D), T)  # party wall between units
    a1 = p.wall((0, 4500), (7000, 4500), t)
    b1 = p.wall((7000, 4500), (W, 4500), t)
    a2 = p.wall((3500, 4500), (3500, D), t)
    b2 = p.wall((10500, 4500), (10500, D), t)
    p.opening(s, 1500, 900, "door")
    p.opening(s, 8500, 900, "door")
    p.opening(s, 4000, 1800, "window")
    p.opening(s, 11000, 1800, "window")
    p.opening(n, 1000, 1200, "window")
    p.opening(n, 9000, 1200, "window")
    p.opening(a1, 1000, 800, "door")
    p.opening(a1, 4500, 800, "door")
    p.opening(b1, 1000, 800, "door")
    p.opening(b1, 4500, 800, "door")
    del party, a2, b2
    u1, u2 = f"{level}01", f"{level}02"
    p.rooms = [(f"UNIT {u1} LIVING", (3500, 2200)), (f"UNIT {u1} BEDROOM", (1700, 6700)),
               (f"UNIT {u1} BATH", (5200, 6700)), (f"UNIT {u2} LIVING", (10500, 2200)),
               (f"UNIT {u2} BEDROOM", (8700, 6700)), (f"UNIT {u2} BATH", (12200, 6700))]
    return p


def duplex(level: int, generic_layers: bool):
    p = duplex_level(level)
    doc, msp = new_doc("mm")
    layers = ("0", "0", "0", "0") if generic_layers else ("WALLS", "DOORS", "WINDOWS", "ROOM NAMES")
    doors, windows = draw_arch(msp, p, layers=layers, noise=generic_layers)
    title_block(msp, 0, -2000, f"DUPLEX - LEVEL {level}", "SCALE 1:100", "mm")
    return doc, p, doors, windows


def house_a_messy(seed: int = 7):
    """Same building, drawn sloppily: no units in the header, face lines broken into overlapping pieces,
    endpoints off by up to 3 mm (1/8"), labels as multi-line MTEXT."""
    import random

    rnd = random.Random(seed)
    p = house_a()
    doc, msp = new_doc("in")
    doc.header["$INSUNITS"] = 0
    geom = p.outline()
    polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
    j = lambda v: v + rnd.uniform(-0.12, 0.12)  # noqa: E731  (inches)
    for poly in polys:
        for ring in [poly.exterior, *poly.interiors]:
            cs = list(ring.coords)
            for a, b in zip(cs, cs[1:], strict=False):
                L = math.dist(a, b)
                cuts = sorted(rnd.uniform(0.2, 0.8) for _ in range(rnd.randint(0, 2))) if L > 40 else []
                ts = [0.0, *cuts, 1.0]
                for t0, t1 in zip(ts, ts[1:], strict=False):
                    t0 = max(0.0, t0 - (0.01 if t0 > 0 else 0))  # small overlaps between pieces
                    pa = (j(a[0] + (b[0] - a[0]) * t0), j(a[1] + (b[1] - a[1]) * t0))
                    pb = (j(a[0] + (b[0] - a[0]) * t1), j(a[1] + (b[1] - a[1]) * t1))
                    msp.add_line(pa, pb, dxfattribs={"layer": "A-WALL"})
    doors = windows = 0
    for o in p.openings:
        a, b, (ux, uy), t = p.opening_geom(o)
        ang = math.degrees(math.atan2(uy, ux))
        if o["kind"] == "door":
            msp.add_blockref("DOOR", a, dxfattribs={"layer": "A-DOOR", "xscale": o["width"], "yscale": o["width"], "rotation": ang})
            doors += 1
        elif o["kind"] == "window":
            msp.add_blockref("WINDOW", a, dxfattribs={"layer": "A-GLAZ", "xscale": o["width"], "yscale": t, "rotation": ang})
            windows += 1
    for name, (x, y) in p.rooms:
        msp.add_mtext(f"{name}\\P12'-0\" x 10'-0\"", dxfattribs={"layer": "A-AREA-IDEN", "char_height": 9,
                                                                    "insert": (x - 30, y + 5)})
    title_block(msp, 0, -80, "FLOOR PLAN - LEVEL 1", 'SCALE: 1/4" = 1\'-0"', "in")
    return doc, p, doors, windows


def duplex_plumbing(level: int):
    """Plumbing for both duplex units: bath (WC, LAV, TUB) and kitchen sink in the living room, with
    cold/hot/waste runs. Includes a branch that tees into the middle of a run."""
    p = duplex_level(level)
    doc, msp = new_doc("mm")
    add_fixture_blocks(doc)
    draw_arch(msp, p, layers=("A-WALL", "A-DOOR", "A-GLAZ", "A-AREA-IDEN"))
    segs = 0
    k = 25.4  # fixture blocks are drawn in inches
    for ox in (0, 7000):
        for name, pos, rot in [("WC", (ox + 5000, 8900), 0), ("LAV", (ox + 6000, 8900), 0), ("TUB", (ox + 3700, 4650), 0),
                               ("SINK-K", (ox + 5500, 100), 180)]:
            msp.add_blockref(name, pos, dxfattribs={"layer": "P-FIXT", "rotation": rot, "xscale": k, "yscale": k})
        runs = {
            "P-DOMW-CPIP": [[(ox + 6800, 4700), (ox + 6800, 8600), (ox + 5000, 8600)],
                            [(ox + 6000, 8600), (ox + 6000, 8800)],  # tees into the middle of the run above
                            [(ox + 6800, 4600), (ox + 6800, 500), (ox + 5600, 500)]],
            "P-DOMW-HPIP": [[(ox + 6700, 4700), (ox + 6700, 8500), (ox + 6100, 8500), (ox + 6100, 8800)],
                            [(ox + 6700, 4600), (ox + 6700, 600), (ox + 5650, 600)]],
            "P-SANR-PIPE": [[(ox + 5000, 8750), (ox + 5000, 8200), (ox + 6900, 8200)]],
        }
        for layer, rs in runs.items():
            for r in rs:
                msp.add_lwpolyline(r, dxfattribs={"layer": layer})
                segs += len(r) - 1
        segs += 1  # the tee splits the run it lands on into two segments
    title_block(msp, 0, -2000, f"DUPLEX - LEVEL {level} - PLUMBING", "SCALE 1:100", "mm")
    return doc, segs


# ----------------------------------------------------------------------------- write everything

def main():
    samples = []

    doc, p, doors, windows = house_a_arch()
    doc.saveas(OUT / "house_a_L1_arch.dxf")
    samples.append(("house_a_L1_arch.dxf", {
        "discipline": "architecture", "units": "in", "rooms": [r for r, _ in p.rooms], "doors": doors,
        "windows": windows, "cased_openings": 1, "wall_centerline_m": centerline_length_m(p),
        "notes": "AIA layers, walls drawn as outlines with gaps at openings"}))

    doc, p, segs, fixtures = house_a_plumbing(with_pipes=True)
    doc.saveas(OUT / "house_a_L1_plumbing.dxf")
    samples.append(("house_a_L1_plumbing.dxf", {
        "discipline": "plumbing", "units": "in", "fixtures": fixtures, "pipe_segments": segs,
        "notes": "fixtures + cold/hot/waste runs drawn as polylines"}))

    doc, p, segs, fixtures = house_a_plumbing(with_pipes=False)
    doc.saveas(OUT / "house_a_L1_plumbing_fixtures_only.dxf")
    samples.append(("house_a_L1_plumbing_fixtures_only.dxf", {
        "discipline": "plumbing", "units": "in", "fixtures": fixtures, "pipe_segments": 0,
        "notes": "typical residential set: fixtures shown, routes left to the plumber"}))

    doc, devices = house_a_electrical()
    doc.saveas(OUT / "house_a_L1_electrical.dxf")
    samples.append(("house_a_L1_electrical.dxf", {"discipline": "electrical", "units": "in", "devices": devices}))

    doc, p, doors, windows = house_a_messy()
    doc.saveas(OUT / "house_a_L1_arch_messy.dxf")
    samples.append(("house_a_L1_arch_messy.dxf", {
        "discipline": "architecture", "units": "in", "rooms": [r for r, _ in p.rooms], "doors": doors,
        "windows": windows, "cased_openings": 1, "wall_centerline_m": centerline_length_m(p),
        "notes": "sloppy drafting: no $INSUNITS, broken/overlapping face lines, 1/8in jitter, MTEXT labels"}))

    for level in (1, 2):
        doc, p, doors, windows = duplex(level, generic_layers=False)
        doc.saveas(OUT / f"duplex_L{level}_arch.dxf")
        samples.append((f"duplex_L{level}_arch.dxf", {
            "discipline": "architecture", "units": "mm", "rooms": [r for r, _ in p.rooms], "doors": doors,
            "windows": windows, "cased_openings": 0, "wall_centerline_m": centerline_length_m(p),
            "notes": "non-AIA layer names (WALLS, DOORS...), metric"}))

    for level in (1, 2):
        doc, segs = duplex_plumbing(level)
        doc.saveas(OUT / f"duplex_L{level}_plumbing.dxf")
        samples.append((f"duplex_L{level}_plumbing.dxf", {
            "discipline": "plumbing", "units": "mm", "pipe_segments": segs,
            "fixtures": {"toilet": 2, "lavatory": 2, "bathtub": 2, "kitchen_sink": 2},
            "notes": "two units; a branch tees into the middle of a run"}))

    doc, p, doors, windows = duplex(1, generic_layers=True)
    doc.saveas(OUT / "duplex_L1_layer0.dxf")
    samples.append(("duplex_L1_layer0.dxf", {
        "discipline": "architecture", "units": "mm", "rooms": [r for r, _ in p.rooms], "doors": doors,
        "windows": windows, "cased_openings": 0, "wall_centerline_m": centerline_length_m(p),
        "notes": "everything on layer 0 plus furniture noise: geometry-only detection"}))

    expected = {name: exp for name, exp in samples}
    (OUT / "expected.json").write_text(json.dumps(expected, indent=2) + "\n")
    print("\n".join(f"wrote {n}" for n, _ in samples))


if __name__ == "__main__":
    main()
