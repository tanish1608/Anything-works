"""Generate vector-PDF floor plans (as if plotted from CAD) for the same buildings as ../dxf, with ground
truth in expected.json. Uses a tiny built-in PDF writer (no dependencies). Licence: CC0.

    cd backend && .venv/bin/python ../samples/pdf/generate_pdf.py
"""

import importlib.util
import json
import math
from pathlib import Path

OUT = Path(__file__).parent
spec = importlib.util.spec_from_file_location("gen", OUT.parent / "dxf" / "generate.py")
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)  # type: ignore[union-attr]


class PdfPage:
    def __init__(self, w: float, h: float):
        self.w, self.h, self.ops = w, h, []

    def width(self, w):
        self.ops.append(f"{w:.2f} w")

    def line(self, a, b):
        self.ops.append(f"{a[0]:.3f} {a[1]:.3f} m {b[0]:.3f} {b[1]:.3f} l S")

    def poly(self, pts, close=False):
        s = f"{pts[0][0]:.3f} {pts[0][1]:.3f} m " + " ".join(f"{x:.3f} {y:.3f} l" for x, y in pts[1:])
        self.ops.append(s + (" h S" if close else " S"))

    def arc(self, c, r, a0, a1):
        """Quarter-circle-ish arc as one cubic Bezier (as CAD plots do)."""
        k = 4 / 3 * math.tan((a1 - a0) / 4)
        p0 = (c[0] + r * math.cos(a0), c[1] + r * math.sin(a0))
        p3 = (c[0] + r * math.cos(a1), c[1] + r * math.sin(a1))
        p1 = (p0[0] - k * r * math.sin(a0), p0[1] + k * r * math.cos(a0))
        p2 = (p3[0] + k * r * math.sin(a1), p3[1] - k * r * math.cos(a1))
        self.ops.append(f"{p0[0]:.3f} {p0[1]:.3f} m {p1[0]:.3f} {p1[1]:.3f} {p2[0]:.3f} {p2[1]:.3f} {p3[0]:.3f} {p3[1]:.3f} c S")

    def text(self, x, y, size, s):
        s = s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        self.ops.append(f"BT /F1 {size:.1f} Tf 1 0 0 1 {x:.2f} {y:.2f} Tm ({s}) Tj ET")

    def save(self, path: Path):
        content = "\n".join(["0 0 0 RG 1 J 1 j", *self.ops]).encode("latin-1")
        objs = [
            b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {self.w:.0f} {self.h:.0f}] /Contents 4 0 R "
            f"/Resources << /Font << /F1 5 0 R >> >> >>".encode(),
            b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        ]
        out = bytearray(b"%PDF-1.4\n")
        offsets = []
        for i, o in enumerate(objs, 1):
            offsets.append(len(out))
            out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
        xref = len(out)
        out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
        out += b"".join(f"{off:010d} 00000 n \n".encode() for off in offsets)
        out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
        path.write_bytes(bytes(out))


def plot(plan, pt_per_unit: float, page: PdfPage, origin=(60, 120), label_pt=8):
    tx = lambda p: (origin[0] + p[0] * pt_per_unit, origin[1] + p[1] * pt_per_unit)  # noqa: E731
    geom = plan.outline()
    polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
    page.width(1.4)  # heavy: walls
    for poly in polys:
        for ring in [poly.exterior, *poly.interiors]:
            cs = [tx(c) for c in ring.coords]
            for a, b in zip(cs, cs[1:], strict=False):
                page.line(a, b)
    page.width(0.35)  # light: doors, windows
    for o in plan.openings:
        a, b, (ux, uy), t = plan.opening_geom(o)
        nx, ny = -uy, ux
        if o["kind"] == "door":
            w = o["width"]
            leaf = (a[0] + nx * w, a[1] + ny * w)
            page.line(tx(a), tx(leaf))
            ang0 = math.atan2(uy, ux)
            page.arc(tx(a), w * pt_per_unit, ang0, ang0 + math.pi / 2)
        elif o["kind"] == "window":
            for off in (-t / 2, 0, t / 2):
                page.line(tx((a[0] + nx * off, a[1] + ny * off)), tx((b[0] + nx * off, b[1] + ny * off)))
    for name, (x, y) in plan.rooms:
        px, py = tx((x, y))
        page.text(px - len(name) * label_pt * 0.28, py, label_pt, name)


def main():
    exp = json.loads((OUT.parent / "dxf" / "expected.json").read_text())
    out = {}
    # House A, 1/4" = 1'-0" on Tabloid (11x17) landscape: 1 model inch = 1/48 paper inch = 1.5 pt
    p = gen.house_a()
    page = PdfPage(1224, 792)
    plot(p, 1.5, page, origin=(150, 140))
    page.width(0.25)
    page.line((145.5, 110), (145.5 + 486 * 1.5, 110))  # dimension line under the plan
    page.text(500, 98, 7, "40'-0\"")
    page.width(1.6)  # sheet frame: heavy double border like a real title-block sheet
    page.poly([(18, 18), (1206, 18), (1206, 774), (18, 774)], close=True)
    page.width(0.8)
    page.poly([(26, 26), (1198, 26), (1198, 766), (26, 766)], close=True)
    page.line((960, 26), (960, 90))
    page.line((960, 90), (1198, 90))
    page.text(980, 66, 10, "FLOOR PLAN - LEVEL 1")
    page.text(980, 48, 8, 'SCALE: 1/4" = 1\'-0"')
    page.save(OUT / "house_a_L1_arch.pdf")
    e = {k: v for k, v in exp["house_a_L1_arch.dxf"].items() if k != "notes"}
    out["house_a_L1_arch.pdf"] = {**e, "windows_as": "opening", "notes": "vector PDF plotted at 1/4in=1ft; windows as thin lines"}

    # Duplex level 1, 1:100 on A4 landscape: 1 mm = 0.01 mm paper = 0.02835 pt
    p = gen.duplex_level(1)
    page = PdfPage(842, 595)
    plot(p, 72 / 25.4 / 100, page, origin=(80, 150), label_pt=7)
    page.width(0.3)
    page.text(600, 60, 10, "DUPLEX - LEVEL 1")
    page.text(600, 46, 8, "SCALE 1:100")
    page.save(OUT / "duplex_L1_arch.pdf")
    e = {k: v for k, v in exp["duplex_L1_arch.dxf"].items() if k != "notes"}
    out["duplex_L1_arch.pdf"] = {**e, "windows_as": "opening", "notes": "vector PDF plotted at 1:100"}
    (OUT / "expected.json").write_text(json.dumps(out, indent=2) + "\n")
    print("wrote", ", ".join(out))


if __name__ == "__main__":
    main()
