"""Read a DXF into a flat, unit-normalised RawDrawing (metres). Block internals are kept separately
so wall detection only sees top-level linework."""

import math
import re
from dataclasses import dataclass, field

import ezdxf
from ezdxf.document import Drawing
from ezdxf.math import Vec2

Pt = tuple[float, float]

INSUNITS_M = {1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1.0, 14: 0.1}
UNIT_NAMES = {1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m", 14: "dm"}


@dataclass
class Seg:
    layer: str
    a: Pt
    b: Pt
    poly: int | None = None  # index of source polyline (keeps connectivity for pipes)

    @property
    def length(self) -> float:
        return math.dist(self.a, self.b)


@dataclass
class Arc:
    layer: str
    center: Pt
    radius: float
    start: float
    end: float


@dataclass
class Insert:
    layer: str
    name: str
    pos: Pt
    rotation: float
    scale: Pt
    bbox: tuple[float, float, float, float]  # world, metres
    geometry: list[list[Pt]] = field(default_factory=list)  # world polylines for rendering


@dataclass
class Text:
    layer: str
    text: str
    pos: Pt
    height: float


@dataclass
class Polyline:
    layer: str
    points: list[Pt]
    closed: bool


@dataclass
class RawDrawing:
    unit_m: float
    units: str
    unit_source: str
    segs: list[Seg]
    arcs: list[Arc]
    circles: list[Arc]
    inserts: list[Insert]
    texts: list[Text]
    polylines: list[Polyline]
    layers: dict[str, int]  # layer -> entity count
    extents: tuple[float, float, float, float]


SCALE_TEXT = re.compile(r"(1\s*:\s*\d+)|(\d+/\d+\s*\"?\s*=\s*1'\s*-?\s*0\"?)|(SCALE)", re.I)


def detect_units(doc: Drawing) -> tuple[float, str, str, list[str]]:
    """(metres per drawing unit, unit name, source, notes). $INSUNITS first; otherwise guess from the size
    of the drawing (a house is 5-60 m across) and scale notes in the title block."""
    notes = []
    code = doc.header.get("$INSUNITS", 0)
    if code in INSUNITS_M:
        return INSUNITS_M[code], UNIT_NAMES[code], "header", notes
    msp = doc.modelspace()
    xs, ys = [], []
    for e in msp.query("LINE LWPOLYLINE"):
        if e.dxftype() == "LINE":
            xs += [e.dxf.start.x, e.dxf.end.x]
            ys += [e.dxf.start.y, e.dxf.end.y]
        else:
            for p in e.get_points("xy"):
                xs.append(p[0])
                ys.append(p[1])
    span = max(max(xs) - min(xs), max(ys) - min(ys)) if xs else 0
    texts = " ".join(t.dxf.text for t in msp.query("TEXT") if SCALE_TEXT.search(t.dxf.text or ""))
    if "1:" in texts.replace(" ", ""):
        notes.append("Metric scale note found in title block")
    if "=" in texts and "'" in texts:
        notes.append("Imperial scale note found in title block")
    for m, name in [(0.001, "mm"), (0.0254, "in"), (0.3048, "ft"), (1.0, "m"), (0.01, "cm")]:
        if 4 <= span * m <= 300:
            if ("Metric" in " ".join(notes) and name in ("in", "ft")) or ("Imperial" in " ".join(notes) and name in ("mm", "cm")):
                continue
            return m, name, "guessed", notes + [f"Units not set in file; guessed {name} from drawing size"]
    return 1.0, "m", "guessed", notes + ["Units not set; assumed metres. Please confirm the scale."]


def _bbox(pts: list[Pt]) -> tuple[float, float, float, float]:
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def _flatten(e, k: float) -> list[list[Pt]]:
    """World polylines (metres) approximating an entity, for bbox + rendering."""
    t = e.dxftype()
    try:
        if t == "LINE":
            return [[(e.dxf.start.x * k, e.dxf.start.y * k), (e.dxf.end.x * k, e.dxf.end.y * k)]]
        if t in ("LWPOLYLINE", "POLYLINE"):
            pts = [(p[0] * k, p[1] * k) for p in (e.get_points("xy") if t == "LWPOLYLINE" else
                                                     [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices])]
            if e.is_closed and pts:
                pts.append(pts[0])
            return [pts]
        if t in ("ARC", "CIRCLE"):
            return [[(v.x * k, v.y * k) for v in e.flattening(0.01 / k if k else 0.01)]]
    except Exception:  # noqa: BLE001
        return []
    return []


def read_dxf(path: str, unit_override: float | None = None) -> RawDrawing:
    doc = ezdxf.readfile(path)
    unit_m, units, source, notes = detect_units(doc)
    if unit_override:
        unit_m, units, source = unit_override, "custom", "user"
    k = unit_m
    msp = doc.modelspace()
    segs, arcs, circles, inserts, texts, polys = [], [], [], [], [], []
    layers: dict[str, int] = {}
    allpts: list[Pt] = []

    def add_poly(layer, pts, closed):
        idx = len(polys)
        polys.append(Polyline(layer, pts, closed))
        ring = pts + ([pts[0]] if closed else [])
        for a, b in zip(ring, ring[1:], strict=False):
            if a != b:
                segs.append(Seg(layer, a, b, idx))

    for e in msp:
        t = e.dxftype()
        layer = e.dxf.get("layer", "0")
        layers[layer] = layers.get(layer, 0) + 1
        if t == "LINE":
            a, b = (e.dxf.start.x * k, e.dxf.start.y * k), (e.dxf.end.x * k, e.dxf.end.y * k)
            segs.append(Seg(layer, a, b))
            allpts += [a, b]
        elif t == "LWPOLYLINE":
            pts = [(p[0] * k, p[1] * k) for p in e.get_points("xy")]
            add_poly(layer, pts, e.closed)
            allpts += pts
        elif t == "POLYLINE" and not e.is_3d_polyline:
            pts = [(v.dxf.location.x * k, v.dxf.location.y * k) for v in e.vertices]
            add_poly(layer, pts, e.is_closed)
            allpts += pts
        elif t == "ARC":
            c = (e.dxf.center.x * k, e.dxf.center.y * k)
            arcs.append(Arc(layer, c, e.dxf.radius * k, e.dxf.start_angle, e.dxf.end_angle))
            allpts.append(c)
        elif t == "CIRCLE":
            c = (e.dxf.center.x * k, e.dxf.center.y * k)
            circles.append(Arc(layer, c, e.dxf.radius * k, 0, 360))
            allpts.append(c)
        elif t == "TEXT":
            p = e.dxf.insert
            texts.append(Text(layer, (e.dxf.text or "").strip(), (p.x * k, p.y * k), (e.dxf.get("height", 0) or 0) * k))
        elif t == "MTEXT":
            p = e.dxf.insert
            h = (e.dxf.get("char_height", 0) or 0) * k
            # One Text per line so a room name isn't glued to the area note under it.
            for i, line in enumerate(l for l in (e.plain_text() or "").splitlines() if l.strip()):
                texts.append(Text(layer, line.strip(), (p.x * k, p.y * k - i * h * 1.5), h))
        elif t == "INSERT":
            geo: list[list[Pt]] = []
            try:
                for ve in e.virtual_entities():
                    geo += _flatten(ve, k)
            except Exception:  # noqa: BLE001 - broken blocks shouldn't stop the import
                pass
            pts = [p for g in geo for p in g] or [(e.dxf.insert.x * k, e.dxf.insert.y * k)]
            inserts.append(Insert(layer, e.dxf.name, (e.dxf.insert.x * k, e.dxf.insert.y * k), e.dxf.get("rotation", 0),
                                  (e.dxf.get("xscale", 1), e.dxf.get("yscale", 1)), _bbox(pts), geo))
            allpts += pts
    ext = _bbox(allpts) if allpts else (0, 0, 0, 0)
    d = RawDrawing(unit_m, units, source, segs, arcs, circles, inserts, texts, polys, layers, ext)
    d.notes = notes  # type: ignore[attr-defined]
    return d


def vec(a: Pt, b: Pt) -> Vec2:
    return Vec2(b[0] - a[0], b[1] - a[1])
