"""Conversion evaluation: run detection on a folder of drawings with ground truth and report how close it
gets, plus (optionally) how much manual correction real projects needed in the review editor.

    .venv/bin/python -m app.conversion.eval_conversion ../samples/dxf            # sample set
    .venv/bin/python -m app.conversion.eval_conversion ../samples/dxf --db       # + corrections from the DB
    .venv/bin/python -m app.conversion.eval_conversion DIR --csv results.csv      # append results to a CSV

Ground truth lives in DIR/expected.json: {file: {discipline, rooms[], doors, windows, cased_openings,
wall_centerline_m, fixtures{kind:n}, devices{kind:n}, pipe_segments}}. Any key may be omitted.
"""

import argparse
import csv
import json
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from app.conversion.detect import detect_plan


def _pr(det: int, exp: int) -> tuple[float, float]:
    """Count-based precision/recall (no positional matching: counts are what the sample set records)."""
    m = min(det, exp)
    return (m / det if det else 1.0), (m / exp if exp else 1.0)


def evaluate_file(path: Path, exp: dict) -> dict:
    t = time.time()
    if path.suffix.lower() == ".pdf":
        from app.conversion.pdf import detect_pdf_plan

        plan, _ = detect_pdf_plan(str(path), exp.get("discipline", "architecture"))
    else:
        plan = detect_plan(str(path), exp.get("discipline", "architecture"))
    c = plan["counts"]
    out: dict = {"file": path.name, "seconds": round(time.time() - t, 2), "metrics": {}}
    m = out["metrics"]
    for key in ("doors", "windows", "cased_openings", "pipe_segments"):
        if key in exp:
            p, r = _pr(c[key], exp[key])
            m[key] = {"detected": c[key], "expected": exp[key], "precision": round(p, 3), "recall": round(r, 3)}
    if "wall_centerline_m" in exp:
        err = abs(c["wall_centerline_m"] - exp["wall_centerline_m"]) / exp["wall_centerline_m"]
        m["wall_length"] = {"detected": c["wall_centerline_m"], "expected": exp["wall_centerline_m"],
                            "error_pct": round(err * 100, 1)}
    if "rooms" in exp:
        det = {r["name"] for r in plan["rooms"]}
        want = set(exp["rooms"])
        hit = len(det & want)
        m["rooms"] = {"detected": len(det), "expected": len(want), "precision": round(hit / len(det), 3) if det else 1.0,
                      "recall": round(hit / len(want), 3) if want else 1.0, "missing": sorted(want - det),
                      "extra": sorted(det - want)}
    for key in ("fixtures", "devices"):
        if key in exp:
            for kind, n in exp[key].items():
                d = c[key].get(kind, 0)
                p, r = _pr(d, n)
                m[f"{key}.{kind}"] = {"detected": d, "expected": n, "precision": round(p, 3), "recall": round(r, 3)}
            for kind, d in c[key].items():
                if kind not in exp[key]:
                    m[f"{key}.{kind}"] = {"detected": d, "expected": 0, "precision": 0.0, "recall": 1.0}
    out["review_items"] = len(plan["review"])
    out["warnings"] = plan["warnings"]
    return out


def corrections_from_db() -> list[dict]:
    """How much fixing real uploads needed: edits per sheet vs. what detection produced."""
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import DrawingSheet

    rows = []
    with SessionLocal() as db:
        for s in db.scalars(select(DrawingSheet).where(DrawingSheet.status == "detected")):
            det = s.detected_counts or {}
            elements = sum(det.get(k, 0) for k in ("walls", "rooms", "pipe_segments")) + sum(
                (det.get("fixtures") or {}).values()) + sum((det.get("devices") or {}).values())
            corr = s.corrections or {}
            total = sum(corr.values())
            rows.append({"sheet": s.name, "discipline": s.discipline, "detected_elements": elements,
                         "corrections": corr, "corrections_per_100": round(100 * total / elements, 1) if elements else None})
    return rows


def _git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", type=Path)
    ap.add_argument("--db", action="store_true", help="also report manual corrections recorded in the database")
    ap.add_argument("--csv", type=Path, help="append one row per metric to this CSV")
    ap.add_argument("--json", action="store_true", help="print JSON instead of a table")
    a = ap.parse_args(argv)
    expected = json.loads((a.folder / "expected.json").read_text())
    results = [evaluate_file(a.folder / name, exp) for name, exp in expected.items() if (a.folder / name).exists()]
    db_rows = corrections_from_db() if a.db else []
    if a.json:
        print(json.dumps({"files": results, "corrections": db_rows}, indent=2))
    else:
        print(f"{'file':38} {'metric':28} {'det':>6} {'exp':>6} {'prec':>6} {'recall':>6}")
        for r in results:
            for k, v in r["metrics"].items():
                if "error_pct" in v:
                    print(f"{r['file']:38} {k:28} {v['detected']:>6} {v['expected']:>6}  err {v['error_pct']}%")
                else:
                    print(f"{r['file']:38} {k:28} {v['detected']:>6} {v['expected']:>6} {v['precision']:>6} {v['recall']:>6}")
        allm = [v for r in results for v in r["metrics"].values() if "precision" in v]
        if allm:
            print(f"\nmean precision {sum(v['precision'] for v in allm) / len(allm):.3f}   "
                  f"mean recall {sum(v['recall'] for v in allm) / len(allm):.3f}   over {len(allm)} metrics, "
                  f"{len(results)} drawings")
        for row in db_rows:
            print(f"[db] {row['sheet']:40} {row['discipline']:12} corrections {row['corrections']} "
                  f"({row['corrections_per_100']} per 100 detected elements)")
    if a.csv:
        new = not a.csv.exists()
        with a.csv.open("a", newline="") as f:
            w = csv.writer(f)
            if new:
                w.writerow(["timestamp", "git", "file", "metric", "detected", "expected", "precision", "recall", "error_pct"])
            ts, sha = datetime.now(UTC).isoformat(timespec="seconds"), _git_sha()
            for r in results:
                for k, v in r["metrics"].items():
                    w.writerow([ts, sha, r["file"], k, v.get("detected"), v.get("expected"), v.get("precision"),
                                v.get("recall"), v.get("error_pct")])
    return 0


if __name__ == "__main__":
    sys.exit(main())
