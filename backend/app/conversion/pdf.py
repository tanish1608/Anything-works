"""Vector PDF input (M7). PDFs plotted from CAD keep their linework and text but lose layers, blocks and
units. We recover what we can:

* scale: from the title-block note ("1/4\\" = 1'-0\\"", "1:100") or the user's confirmation
* walls: the heaviest line weights (walls are plotted heavy); lighter lines are kept as window evidence
* doors: curved paths sized like a door swing become door symbols
* room names: text inside rooms

MEP from PDF (fixture symbols without block names) is out of scope for now: it needs symbol matching.
Scanned/raster PDFs have no linework at all and are rejected with a clear message (see PLAN.md, raster input).
"""

import math
import re
from collections import defaultdict

from pdfminer.high_level import extract_pages
from pdfminer.layout import LTChar, LTCurve, LTFigure, LTImage, LTTextContainer, LTTextLine

from app.conversion.detect import detect_from_raw
from app.conversion.reader import Insert, RawDrawing, Seg, Text
from app.conversion.svg import render_svg

PT_M = 0.0254 / 72  # one PDF point in metres (on paper)
_IMPERIAL = re.compile(r"(\d+)\s*/\s*(\d+)\s*\"?\s*=\s*1\s*'\s*-?\s*0?\s*\"?")
_IMPERIAL_WHOLE = re.compile(r"(\d+)\s*\"\s*=\s*1\s*'\s*-?\s*0?\s*\"?")
_METRIC = re.compile(r"\b1\s*:\s*(\d{1,4})\b")


class NotVectorPdf(ValueError):
    pass


def parse_scale(texts: list[str]) -> tuple[float, str] | None:
    """metres-in-building per PDF point, and the note it came from."""
    for raw in texts:
        t = raw.replace("’", "'").replace("”", '"').replace("″", '"').replace("′", "'")
        m = _IMPERIAL.search(t)
        if m:
            paper_in_per_ft = int(m.group(1)) / int(m.group(2))
            return PT_M * (12 / paper_in_per_ft), raw.strip()
        m = _IMPERIAL_WHOLE.search(t)
        if m:
            return PT_M * (12 / int(m.group(1))), raw.strip()
        m = _METRIC.search(t)
        if m and "SCALE" in t.upper() or (m and len(t) < 20):
            return PT_M * int(m.group(1)), raw.strip()
    return None


def _walk(obj):
    for o in obj:
        yield o
        if isinstance(o, LTFigure):
            yield from _walk(o)


def read_pdf(path: str, unit_override: float | None = None) -> tuple[RawDrawing, list[str]]:
    pages = list(extract_pages(path))
    if not pages:
        raise NotVectorPdf("The PDF has no pages")
    notes = [] if len(pages) == 1 else [f"This PDF has {len(pages)} pages; only page 1 was read. Upload one sheet per file."]
    page = pages[0]
    curves, texts, images = [], [], 0
    for el in _walk(page):
        if isinstance(el, LTCurve):
            curves.append(el)
        elif isinstance(el, LTTextContainer):
            for line in el:
                if isinstance(line, LTTextLine) and line.get_text().strip():
                    sizes = [c.size for c in line if isinstance(c, LTChar)]
                    texts.append((line.get_text().strip(), (line.x0, line.y0), max(sizes) if sizes else line.height))
        elif isinstance(el, LTImage):
            images += 1
    if len(curves) < 20:
        raise NotVectorPdf("This PDF has almost no vector linework (it looks scanned or exported as an image). "
                           "Scanned drawings aren't supported yet; export a vector PDF or DXF from CAD.")

    scale = parse_scale([t for t, _, _ in texts])
    if unit_override:
        k, source = unit_override, "user"
    elif scale:
        k, source = scale[0], "title block"
        notes.append(f"Scale read from title block: “{scale[1]}”")
    else:
        k, source = PT_M * 48, "guessed"
        notes.append("No scale note found; assumed 1/4\" = 1'-0\". Confirm the scale (measure a known wall).")

    # Line weights: heavy = walls. Interior walls are sometimes plotted a bit lighter, so take every weight
    # at least ~45% of the heaviest one that carries real length.
    length_by_w: dict[float, float] = defaultdict(float)
    for c in curves:
        if len(c.pts) == 2:
            length_by_w[round(c.linewidth or 0, 2)] += math.dist(*c.pts)
    total = sum(length_by_w.values()) or 1
    significant = [w for w, L in length_by_w.items() if L / total > 0.05] or list(length_by_w)
    heavy = max(significant) if significant else 0
    wall_min = heavy * 0.45

    segs, inserts = [], []
    for c in curves:
        pts = [(x * k, y * k) for x, y in c.pts]
        if len(pts) < 2:
            continue
        if _is_bezier(c):
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            w, h = max(xs) - min(xs), max(ys) - min(ys)
            # A door swing plots as a quarter arc: a roughly square bbox 0.5-1.35 m on a side.
            is_door = 0.5 <= max(w, h) <= 1.35 and h > 0 and 0.6 <= w / h <= 1.6
            inserts.append(Insert("PDF-LIGHT", "DOOR_ARC" if is_door else "CURVE", (min(xs), min(ys)), 0.0, (1, 1),
                                  (min(xs), min(ys), max(xs), max(ys)), [pts]))
            continue
        layer = "PDF-HEAVY" if (c.linewidth or 0) >= wall_min else "PDF-LIGHT"
        ring = list(c.pts) + ([c.pts[0]] if c.__class__.__name__ == "LTRect" else [])  # paper points
        for a, b in zip(ring, ring[1:], strict=False):
            if a != b:
                seg_layer = "PDF-FRAME" if _on_page_edge(a, b, page.bbox) else layer
                segs.append(Seg(seg_layer, (a[0] * k, a[1] * k), (b[0] * k, b[1] * k)))
    txt = [Text("PDF-TEXT", t, (x * k, y * k), size * k) for t, (x, y), size in texts]
    allx = [p[0] for s in segs for p in (s.a, s.b)] or [0]
    ally = [p[1] for s in segs for p in (s.a, s.b)] or [0]
    raw = RawDrawing(k, "pdf-pt", source, segs, [], [], inserts, txt, [],
                     {"PDF-HEAVY": sum(s.layer == "PDF-HEAVY" for s in segs), "PDF-FRAME": sum(s.layer == "PDF-FRAME" for s in segs), "PDF-LIGHT": sum(s.layer == "PDF-LIGHT" for s in segs) + len(inserts),
                      "PDF-TEXT": len(txt)},
                     (min(allx), min(ally), max(allx), max(ally)))
    if images:
        notes.append(f"{images} embedded image(s) ignored (logos or raster content).")
    return raw, notes


FRAME_MARGIN = 54  # pt (0.75 in): sheet borders live here, drawings don't


def _on_page_edge(a, b, bbox) -> bool:
    """Both ends of the line hug the same page edge → sheet border / title block frame, not building."""
    x0, y0, x1, y1 = bbox
    for near in (lambda p: p[0] - x0 < FRAME_MARGIN, lambda p: x1 - p[0] < FRAME_MARGIN,
                 lambda p: p[1] - y0 < FRAME_MARGIN, lambda p: y1 - p[1] < FRAME_MARGIN):
        if near(a) and near(b):
            return True
    return False


def _is_bezier(c) -> bool:
    """pdfminer flattens a Bezier to its end points; the original path operators tell us it was curved."""
    ops = getattr(c, "original_path", None) or []
    return any(op[0] == "c" for op in ops)


PDF_ROLES = {"PDF-HEAVY": "wall", "PDF-LIGHT": "window", "PDF-TEXT": "room_label", "PDF-FRAME": "ignore"}


def detect_pdf_plan(path: str, discipline: str, role_overrides: dict[str, str] | None = None,
                    unit_m: float | None = None) -> tuple[dict, str]:
    raw, notes = read_pdf(path, unit_m)
    roles = {**PDF_ROLES, **(role_overrides or {})}
    if discipline not in ("architecture", "structure"):
        notes.append("Only architectural plans are read from PDF for now (walls, doors, rooms). Trade symbols in PDFs "
                     "need symbol matching; upload the DXF, or trace pipes/fixtures in the review editor.")
    plan = detect_from_raw(raw, discipline, roles)
    plan["warnings"] = notes + plan["warnings"]
    plan["units"] = {"unit_m": raw.unit_m, "name": "pdf-pt", "source": raw.unit_source}
    return plan, render_svg(raw, roles)
