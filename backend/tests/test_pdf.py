import json
from pathlib import Path

import pytest

from app.conversion.pdf import PT_M, NotVectorPdf, detect_pdf_plan, parse_scale

PDF = Path(__file__).resolve().parents[2] / "samples" / "pdf"
EXP = json.loads((PDF / "expected.json").read_text())


@pytest.mark.parametrize("text,factor", [
    ('SCALE: 1/4" = 1\'-0"', 48), ("SCALE: 1/8\" = 1'-0\"", 96), ("3/16\" = 1'-0\"", 64), ('1" = 1\'-0"', 12),
    ("SCALE 1:100", 100), ("1:50", 50), ("SCALE: 1/4” = 1’-0”", 48),
])
def test_parse_scale(text, factor):
    k, _ = parse_scale([text])
    assert k == pytest.approx(PT_M * factor)


def test_parse_scale_ignores_other_text():
    assert parse_scale(["UNIT 101 LIVING", "12'-0\" x 10'-0\""]) is None


@pytest.mark.parametrize("name", list(EXP))
def test_vector_pdf_matches_ground_truth(name):
    e = EXP[name]
    plan, svg = detect_pdf_plan(str(PDF / name), "architecture")
    c = plan["counts"]
    assert c["doors"] == e["doors"] and abs(c["wall_centerline_m"] - e["wall_centerline_m"]) / e["wall_centerline_m"] < 0.05
    assert sorted(r["name"] for r in plan["rooms"]) == sorted(e["rooms"])
    assert plan["units"]["source"] == "title block"
    assert 'data-role="wall"' in svg


def test_scanned_pdf_is_rejected(tmp_path):
    p = tmp_path / "scan.pdf"
    content = b"BT /F1 12 Tf 72 700 Td (scanned page) Tj ET"
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out, offs = bytearray(b"%PDF-1.4\n"), []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    x = len(out)
    out += b"xref\n0 6\n0000000000 65535 f \n" + b"".join(f"{o:010d} 00000 n \n".encode() for o in offs)
    out += f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n".encode()
    p.write_bytes(bytes(out))
    with pytest.raises(NotVectorPdf):
        detect_pdf_plan(str(p), "architecture")


def test_pdf_upload_through_api(client, api):
    h = api.register("pm@example.com")
    pid = api.project(h)
    r = client.post(f"/api/projects/{pid}/sheets", headers=h, data={"discipline": "architecture"},
                    files={"file": ("plan.pdf", (PDF / "house_a_L1_arch.pdf").read_bytes(), "application/pdf")})
    job = r.json()
    assert job["status"] == "done", job
    s = client.get(f"/api/sheets/{job['result']['sheet_id']}", headers=h).json()
    assert s["file_type"] == "pdf" and s["counts"]["rooms"] == 5
    assert client.get(f"/api/sheets/{s['id']}/svg", headers=h).status_code == 200
    # Wrong scale on purpose → user override is respected (re-detects at the given scale)
    r = client.patch(f"/api/sheets/{s['id']}", headers=h, json={"unit_m": PT_M * 96})
    assert client.get(f"/api/sheets/{s['id']}", headers=h).json()["plan"]["units"]["source"] == "user"
