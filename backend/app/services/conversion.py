"""Drawing → plan → IFC → draft model version. Detection and building run as background jobs."""

import tempfile
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import jobs
from app.bim.ifc_import import create_version, read_ifc
from app.conversion.detect import counts, detect_plan
from app.conversion.ifc_writer import LevelInput, SheetInput, Transform, write_ifc
from app.conversion.reader import read_dxf
from app.conversion.svg import render_svg
from app.models import Building, DrawingSheet, Job, Level, ModelVersion, Project
from app.services import events
from app.storage import get_storage


def svg_key(sheet: DrawingSheet) -> str:
    return f"projects/{sheet.project_id}/sheets/{sheet.id}/sheet.svg"


def _footprint_min(plan: dict) -> tuple[float, float]:
    pts = plan.get("footprint") or []
    if pts:
        return min(p[0] for p in pts), min(p[1] for p in pts)
    ext = plan.get("extents") or [0, 0, 0, 0]
    return ext[0], ext[1]


def auto_transform(sheet: DrawingSheet) -> dict:
    """Default alignment: the building's outside bottom-left corner on every sheet maps to (0, 0).
    Works when plans share a footprint corner; the PM confirms or picks a reference point."""
    x, y = _footprint_min(sheet.plan or {})
    return {"dx": round(-x, 4), "dy": round(-y, 4), "rotation_deg": 0.0, "confirmed": False, "reference": [x, y]}


@jobs.handler("sheet_detect")
def run_detect(db: Session, job: Job) -> dict:
    sheet = db.get(DrawingSheet, job.payload["sheet_id"])
    detect_sheet(db, sheet, job.created_by)
    db.commit()
    return {"sheet_id": sheet.id, "counts": sheet.plan["counts"]}


def detect_sheet(db: Session, sheet: DrawingSheet, actor_id: str | None) -> None:
    path = get_storage().local_path(sheet.storage_key)
    if sheet.file_type == "pdf":
        from app.conversion.pdf import detect_pdf_plan  # M7

        plan, svg = detect_pdf_plan(str(path), sheet.discipline, sheet.layer_roles or {},
                                    sheet.unit_m if sheet.units_confirmed else None)
    else:
        plan = detect_plan(str(path), sheet.discipline, sheet.layer_roles or {},
                           sheet.unit_m if sheet.units_confirmed else None)
        svg = render_svg(read_dxf(str(path), plan["units"]["unit_m"]), sheet.layer_roles or {})
    get_storage().put_bytes(svg_key(sheet), svg.encode())
    sheet.plan = plan
    sheet.unit_m = plan["units"]["unit_m"]
    sheet.detected_counts = plan["counts"]
    sheet.corrections = {"added": 0, "deleted": 0, "edited": 0}
    if not (sheet.transform or {}).get("confirmed"):
        sheet.transform = auto_transform(sheet)
    sheet.status = "detected"
    sheet.error = None
    sheet.updated_at = datetime.now(UTC)
    events.record(db, project_id=sheet.project_id, actor_id=actor_id, type="sheet.detected",
                  entity_type="sheet", entity_id=sheet.id, data={"counts": plan["counts"],
                                                                 "warnings": len(plan["warnings"]),
                                                                 "review_items": len(plan["review"])})


def mark_failed(db: Session, job: Job) -> None:
    if job.status == "failed":
        sheet = db.get(DrawingSheet, job.payload["sheet_id"])
        if sheet and sheet.status == "detecting":
            sheet.status, sheet.error = "failed", (job.error or "")[:500]
            db.commit()


def build_inputs(db: Session, project: Project,
                 level_ids: list[str] | None = None) -> tuple[list[LevelInput], list[DrawingSheet]]:
    q = select(DrawingSheet).where(DrawingSheet.project_id == project.id, DrawingSheet.status == "detected",
                                   DrawingSheet.level_id.is_not(None)).order_by(DrawingSheet.created_at, DrawingSheet.id)
    sheets = list(db.scalars(q))
    if level_ids:
        sheets = [s for s in sheets if s.level_id in level_ids]
    by_level: dict[str, LevelInput] = {}
    for s in sheets:
        lv = db.get(Level, s.level_id)
        b = db.get(Building, lv.building_id)
        li = by_level.setdefault(lv.id, LevelInput(lv.id, b.name, lv.name, lv.elevation_m, lv.height_m))
        t = s.transform or {}
        li.sheets.append(SheetInput(s.id, s.discipline, s.plan, Transform(t.get("dx", 0), t.get("dy", 0),
                                                                           t.get("rotation_deg", 0))))
    levels = sorted(by_level.values(), key=lambda li: li.elevation)
    return levels, sheets


@jobs.handler("model_build")
def run_build(db: Session, job: Job) -> dict:
    project = db.get(Project, job.project_id)
    v = build_version(db, project, job.created_by, job.payload.get("message") or "Converted from drawings",
                      job.payload.get("level_ids"), job.id)
    db.commit()
    return {"version_id": v.id, "number": v.number, "report": v.stats["report"]}


def build_version(db: Session, project: Project, actor_id: str | None, message: str,
                  level_ids: list[str] | None = None, run_id: str | None = None) -> ModelVersion:
    import uuid

    run_id = run_id or uuid.uuid4().hex
    levels, sheets = build_inputs(db, project, level_ids)
    if not levels:
        raise ValueError("No detected drawings with a level assigned. Upload drawings and assign levels first.")
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "model.ifc"
        stats = write_ifc(project.name, project.id, levels, str(path))
        items, spaces = read_ifc(path)
        key = get_storage().put_file(f"projects/{project.id}/conversions/{run_id}/model.ifc", path)
    report = {
        "levels": stats,
        "sheets": [{"id": s.id, "name": s.name, "discipline": s.discipline, "counts": counts(s.plan),
                    "detected": s.detected_counts, "corrections": s.corrections, "warnings": s.plan.get("warnings", []),
                    "review_open": len(s.plan.get("review", [])),
                    "low_confidence": sum(1 for k in ("walls", "rooms", "fixtures", "devices", "pipes")
                                          for x in s.plan.get(k, []) if x.get("confidence", 1) < 0.7)}
                   for s in sheets],
    }
    return create_version(db, project, items, spaces, actor_id=actor_id, message=message, source="conversion",
                          extra_files={"ifc": [key]}, stats={"report": report})


def latest_conversion(db: Session, project_id: str) -> ModelVersion | None:
    return db.scalar(select(ModelVersion).where(ModelVersion.project_id == project_id,
                                                ModelVersion.source == "conversion")
                     .order_by(ModelVersion.number.desc()).limit(1))


jobs.ON_FAIL["sheet_detect"] = mark_failed
