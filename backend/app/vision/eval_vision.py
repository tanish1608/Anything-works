"""Vision evaluation harness: run the photo check on a labeled set and report precision/recall per
element type. Run it whenever the prompt (PROMPT_VERSION) or model (VISION_MODEL) changes.

    .venv/bin/python -m app.vision.eval_vision ../samples/photos                    # real API call per case
    .venv/bin/python -m app.vision.eval_vision ../samples/photos --model claude-sonnet-5-5 --threshold 0.9
    .venv/bin/python -m app.vision.eval_vision ../samples/photos --mock             # pipeline check, no API

Positive class = "installed" with confidence >= threshold (what would turn an element amber/green).
A *false green* is a predicted install where the truth is missing/not visible — the number to drive to 0.
Results are appended to DIR/RESULTS.csv with the model and prompt version.
"""

import argparse
import csv
import json
import subprocess
import sys
import time
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

from app.services.photos import analysis_copy
from app.vision import client as vision
from app.vision.prompt import PROMPT_VERSION


def load_cases(folder: Path) -> list[tuple[Path, dict]]:
    out = []
    for f in sorted(folder.glob("*/case.json")):
        if f.parent.name.startswith("_"):
            continue  # templates
        case = json.loads(f.read_text())
        if case.get("photos"):
            out.append((f.parent, case))
    return out


def score(rows: list[dict], threshold: float) -> dict:
    by: dict[str, dict] = defaultdict(lambda: {"n": 0, "tp": 0, "fp": 0, "fn": 0, "missing_caught": 0, "missing_total": 0})
    for r in rows:
        for key in (r["type"], "ALL"):
            s = by[key]
            s["n"] += 1
            pred_pos = r["verdict"] == "installed" and r["confidence"] >= threshold
            true_pos = r["truth"] == "installed"
            s["tp"] += pred_pos and true_pos
            s["fp"] += pred_pos and not true_pos
            s["fn"] += (not pred_pos) and true_pos
            if r["truth"] == "missing":
                s["missing_total"] += 1
                s["missing_caught"] += r["verdict"] == "missing"
    for s in by.values():
        s["precision"] = round(s["tp"] / (s["tp"] + s["fp"]), 3) if s["tp"] + s["fp"] else None
        s["recall"] = round(s["tp"] / (s["tp"] + s["fn"]), 3) if s["tp"] + s["fn"] else None
        s["false_greens"] = s["fp"]
    return dict(by)


def run(folder: Path, model: str | None, threshold: float, mock: bool) -> tuple[list[dict], dict]:
    rows = []
    for path, case in load_cases(folder):
        photos = [analysis_copy((path / p).read_bytes()) for p in case["photos"]]
        ref = analysis_copy((path / case["reference"]).read_bytes()) if case.get("reference") else None
        elements = case["elements"]
        t = time.time()
        if mock:
            result = vision.AnalysisResult([vision.Verdict(e["id"], "uncertain", 0.0, "mock") for e in elements], "mock")
        else:
            result = vision.analyze(photos, ref, zone=case.get("zone", ""), trade=case.get("trade", ""),
                                    note=case.get("note", ""), elements=elements, model=model, client=vision._client())
        took = time.time() - t
        truth = {e["id"]: e for e in elements}
        for v in result.verdicts:
            e = truth[v.element_id]
            rows.append({"case": path.name, "element_id": v.element_id, "type": e.get("ifc_class", "?"),
                         "truth": e["truth"], "verdict": v.verdict, "confidence": v.confidence, "reason": v.reason,
                         "model": result.model, "seconds": round(took, 1), "error": result.error})
    return rows, score(rows, threshold)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", type=Path)
    ap.add_argument("--model", default=None, help="override VISION_MODEL")
    ap.add_argument("--threshold", type=float, default=0.85)
    ap.add_argument("--mock", action="store_true", help="no API calls; checks the harness and data")
    ap.add_argument("--no-csv", action="store_true")
    a = ap.parse_args(argv)
    from app.config import get_settings

    model = "mock" if a.mock else (a.model or get_settings().vision_model)
    rows, scores = run(a.folder, a.model, a.threshold, a.mock)
    if not rows:
        print(f"No labeled cases with photos in {a.folder} (see samples/photos/README.md).")
        return 1
    print(f"model={model} prompt={PROMPT_VERSION} threshold={a.threshold} cases={len({r['case'] for r in rows})}")
    print(f"{'element type':28} {'n':>4} {'prec':>6} {'recall':>6} {'false greens':>13} {'missing caught':>15}")
    for k in sorted(scores, key=lambda x: (x == "ALL", x)):
        s = scores[k]
        print(f"{k:28} {s['n']:>4} {s['precision'] if s['precision'] is not None else '—':>6} "
              f"{s['recall'] if s['recall'] is not None else '—':>6} {s['false_greens']:>13} "
              f"{str(s['missing_caught']) + '/' + str(s['missing_total']):>15}")
    wrong = [r for r in rows if r["verdict"] == "installed" and r["confidence"] >= a.threshold and r["truth"] != "installed"]
    for r in wrong:
        print(f"  FALSE GREEN {r['case']}/{r['element_id']} ({r['type']}): truth={r['truth']} conf={r['confidence']} — {r['reason']}")
    if not a.no_csv:
        out = a.folder / "RESULTS.csv"
        new = not out.exists()
        try:
            sha = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
        except Exception:  # noqa: BLE001
            sha = "unknown"
        with out.open("a", newline="") as f:
            w = csv.writer(f)
            if new:
                w.writerow(["timestamp", "git", "model", "prompt_version", "threshold", "element_type", "n", "tp", "fp",
                            "fn", "precision", "recall", "false_greens", "missing_caught", "missing_total"])
            ts = datetime.now(UTC).isoformat(timespec="seconds")
            for k, s in scores.items():
                w.writerow([ts, sha, model, PROMPT_VERSION, a.threshold, k, s["n"], s["tp"], s["fp"], s["fn"], s["precision"],
                            s["recall"], s["false_greens"], s["missing_caught"], s["missing_total"]])
        (a.folder / "last_run.json").write_text(json.dumps(rows, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
