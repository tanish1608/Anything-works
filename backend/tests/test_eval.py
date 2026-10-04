from pathlib import Path

from app.conversion.eval_conversion import evaluate_file, main

DXF = Path(__file__).resolve().parents[2] / "samples" / "dxf"


def test_eval_reports_metrics(tmp_path, capsys):
    r = evaluate_file(DXF / "house_a_L1_plumbing.dxf", {"discipline": "plumbing", "pipe_segments": 20,
                                                         "fixtures": {"toilet": 2}})
    assert r["metrics"]["pipe_segments"] == {"detected": 19, "expected": 20, "precision": 1.0, "recall": 0.95}
    assert r["metrics"]["fixtures.toilet"]["recall"] == 0.5
    assert r["metrics"]["fixtures.lavatory"]["precision"] == 0.0  # detected but not expected
    out = tmp_path / "r.csv"
    assert main([str(DXF), "--csv", str(out)]) == 0
    assert "mean precision" in capsys.readouterr().out
    assert out.read_text().count("\n") > 30
