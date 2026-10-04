"""Render a DXF sheet to SVG (metres, sheet coordinates) for the sheet viewer and review editor.
Own renderer (not ezdxf's drawing add-on) so coordinates match the plan model exactly."""

import math
from xml.sax.saxutils import escape

from app.conversion.layers import suggest_roles
from app.conversion.reader import RawDrawing

ROLE_COLOR = {"wall": "#222", "door": "#8a5a00", "window": "#1565c0", "room_label": "#444", "fixture": "#1e88e5",
              "pipe_cold": "#1e88e5", "pipe_hot": "#e53935", "pipe_waste": "#6d4c41", "pipe_vent": "#7cb342",
              "pipe_gas": "#fbc02d", "electrical": "#ef6c00", "wire": "#ef6c00", "ignore": "#aaa", "auto": "#333"}


def _pts(pts) -> str:
    return " ".join(f"{x:.4f},{y:.4f}" for x, y in pts)


def render_svg(raw: RawDrawing, role_overrides: dict[str, str] | None = None) -> str:
    roles = suggest_roles(raw.layers)
    roles.update(role_overrides or {})
    x0, y0, x1, y1 = raw.extents
    pad = max(x1 - x0, y1 - y0) * 0.03 + 0.2
    vb = (x0 - pad, -(y1 + pad), (x1 - x0) + 2 * pad, (y1 - y0) + 2 * pad)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]:.4f} {vb[1]:.4f} {vb[2]:.4f} {vb[3]:.4f}" '
           f'data-x0="{vb[0]:.4f}" data-y0="{vb[1]:.4f}">',
           '<g transform="scale(1,-1)" fill="none" stroke-linecap="round" vector-effect="non-scaling-stroke">']
    by_layer: dict[str, list[str]] = {}

    def add(layer, el):
        by_layer.setdefault(layer, []).append(el)

    seen_poly = set()
    for s in raw.segs:
        if s.poly is not None:
            if s.poly in seen_poly:
                continue
            seen_poly.add(s.poly)
            pl = raw.polylines[s.poly]
            tag = "polygon" if pl.closed else "polyline"
            add(s.layer, f'<{tag} points="{_pts(pl.points)}"/>')
        else:
            add(s.layer, f'<line x1="{s.a[0]:.4f}" y1="{s.a[1]:.4f}" x2="{s.b[0]:.4f}" y2="{s.b[1]:.4f}"/>')
    for a in raw.arcs:
        a0, a1 = math.radians(a.start), math.radians(a.end)
        if a1 < a0:
            a1 += 2 * math.pi
        n = max(4, int((a1 - a0) / 0.15))
        angs = [a0 + (a1 - a0) * i / n for i in range(n + 1)]
        pts = [(a.center[0] + a.radius * math.cos(t), a.center[1] + a.radius * math.sin(t)) for t in angs]
        add(a.layer, f'<polyline points="{_pts(pts)}"/>')
    for c in raw.circles:
        add(c.layer, f'<circle cx="{c.center[0]:.4f}" cy="{c.center[1]:.4f}" r="{c.radius:.4f}"/>')
    for ins in raw.inserts:
        for g in ins.geometry:
            if len(g) >= 2:
                add(ins.layer, f'<polyline points="{_pts(g)}"/>')
    for layer, els in by_layer.items():
        role = roles.get(layer, "auto")
        sw = 0.02 if role == "wall" else 0.012
        out.append(f'<g data-layer="{escape(layer)}" data-role="{role}" stroke="{ROLE_COLOR.get(role, "#333")}" '
                   f'stroke-width="{sw}">' + "".join(els) + "</g>")
    out.append("</g>")
    # text (not mirrored)
    out.append('<g font-family="sans-serif" fill="#333">')
    for t in raw.texts:
        if not t.text or t.height <= 0:
            continue
        out.append(f'<text x="{t.pos[0]:.4f}" y="{-t.pos[1]:.4f}" font-size="{t.height:.4f}" '
                   f'data-layer="{escape(t.layer)}">{escape(t.text)}</text>')
    out.append("</g></svg>")
    return "".join(out)
