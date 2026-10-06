"""Create demo users and projects so the app can be tried right away.

    python -m app.seed            # idempotent: skips projects that already exist

* "Maple Court (demo)": a two-storey duplex built through the real pipeline: generated DXF plans
  (samples/dxf) → detection → IFC → approved model. The plumber is scoped to baths and living/kitchens.
* "Sample House (buildingSMART IFC)": the buildingSMART sample house imported from IFC.

All demo users share the password in DEMO_PASSWORD (default "demo-password")."""

import os
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.db import SessionLocal
from app.models import (
    Building,
    DrawingSheet,
    Level,
    Organization,
    OrgMembership,
    Project,
    ProjectMember,
    Role,
    User,
    Zone,
    new_id,
)
from app.services import events

DEMO_PROJECT = "Maple Court (demo)"
SAMPLE_PROJECT = "Sample House (buildingSMART IFC)"
SAMPLES = Path(__file__).resolve().parents[2] / "samples"
PEOPLE = [
    # email, name, role, trades
    ("owner@example.com", "Olivia Owner", Role.owner, []),
    ("pm@example.com", "Pat Manager", Role.pm, []),
    ("plumber@example.com", "Paco Plumber", Role.trade, ["plumbing"]),
    ("electrician@example.com", "Elle Electric", Role.trade, ["electrical"]),
    ("inspector@example.com", "Ian Inspector", Role.viewer, []),
]
SHEETS = [("duplex_L1_arch.dxf", "architecture", 0), ("duplex_L1_plumbing.dxf", "plumbing", 0),
          ("duplex_L2_arch.dxf", "architecture", 1), ("duplex_L2_plumbing.dxf", "plumbing", 1)]


def _user(db: Session, email: str, name: str, password: str) -> User:
    u = db.scalar(select(User).where(User.email == email))
    if u is None:
        u = User(id=new_id(), email=email, name=name, password_hash=hash_password(password))
        db.add(u)
        db.flush()
    return u


def _org(db: Session, users: dict[str, User]) -> Organization:
    owner = users["owner@example.com"]
    org_id = db.scalar(select(OrgMembership.org_id).where(OrgMembership.user_id == owner.id, OrgMembership.is_admin))
    if org_id:
        return db.get(Organization, org_id)
    org = Organization(id=new_id(), name="Maple Homes LLC")
    db.add(org)
    db.flush()
    for u in users.values():
        db.add(OrgMembership(org_id=org.id, user_id=u.id, is_admin=u.email == "owner@example.com"))
    return org


def seed(db: Session) -> Project:
    existing = db.scalar(select(Project).where(Project.name == DEMO_PROJECT))
    if existing:
        return existing
    from app.services.conversion import build_version, detect_sheet
    from app.services.models import approve_version
    from app.storage import get_storage

    password = os.environ.get("DEMO_PASSWORD", "demo-password")
    users = {email: _user(db, email, name, password) for email, name, _, _ in PEOPLE}
    org = _org(db, users)
    owner, pm = users["owner@example.com"], users["pm@example.com"]
    project = Project(id=new_id(), org_id=org.id, name=DEMO_PROJECT, address="123 Maple St")
    db.add(project)
    db.flush()
    events.record(db, project_id=project.id, actor_id=owner.id, type="project.created", entity_type="project",
                  entity_id=project.id, data={"name": project.name})
    for email, _, role, trades in PEOPLE:
        db.add(ProjectMember(project_id=project.id, user_id=users[email].id, role=role, trades=trades))
    b = Building(id=new_id(), project_id=project.id, name="Building A")
    db.add(b)
    levels = [Level(id=new_id(), building_id=b.id, name=f"Level {i + 1}", index=i, elevation_m=i * 3.0, height_m=3.0)
              for i in range(2)]
    db.add_all(levels)
    db.flush()

    for fname, discipline, li in SHEETS:
        sheet = DrawingSheet(project_id=project.id, level_id=levels[li].id, discipline=discipline, name=fname,
                             filename=fname, file_type="dxf", created_by=pm.id,
                             storage_key=f"projects/{project.id}/sheets/seed/{fname}")
        get_storage().put_file(sheet.storage_key, SAMPLES / "dxf" / fname)
        db.add(sheet)
        db.flush()
        detect_sheet(db, sheet, pm.id)
    version = build_version(db, project, pm.id, "Converted from duplex drawings (demo)")
    approve_version(db, version, pm.id, "Reviewed: matches drawings")

    # Plumber works in the baths and kitchens (kitchens are in the living rooms on this plan).
    zones = db.scalars(select(Zone).join(Level).where(Level.building_id == b.id)).all()
    plumber = db.scalar(select(ProjectMember).where(ProjectMember.project_id == project.id,
                                                    ProjectMember.user_id == users["plumber@example.com"].id))
    plumber.zone_ids = [z.id for z in zones if "BATH" in z.name or "LIVING" in z.name]
    db.commit()
    return project


def seed_sample_ifc(db: Session) -> Project | None:
    """Second demo project: the buildingSMART sample house imported from IFC and approved."""
    from app.bim.ifc_import import import_ifc
    from app.services.models import approve_version
    from app.storage import get_storage

    existing = db.scalar(select(Project).where(Project.name == SAMPLE_PROJECT))
    if existing:
        return existing
    files = ["Building-Architecture.ifc", "Building-Structural.ifc", "Building-Hvac.ifc"]
    if not all((SAMPLES / "ifc" / f).exists() for f in files):
        return None
    demo = seed(db)
    owner = db.scalar(select(User).where(User.email == "owner@example.com"))
    project = Project(id=new_id(), org_id=demo.org_id, name=SAMPLE_PROJECT, address="buildingSMART Simple-Scene")
    db.add(project)
    db.flush()
    for m in db.scalars(select(ProjectMember).where(ProjectMember.project_id == demo.id)):
        trades = ["hvac", "framing"] if m.role == Role.trade and "plumbing" in m.trades else m.trades
        db.add(ProjectMember(project_id=project.id, user_id=m.user_id, role=m.role, trades=trades))
    events.record(db, project_id=project.id, actor_id=owner.id, type="project.created", entity_type="project",
                  entity_id=project.id, data={"name": project.name})
    keys = [(get_storage().put_file(f"projects/{project.id}/uploads/seed/{f}", SAMPLES / "ifc" / f), None)
            for f in files]
    v = import_ifc(db, project, keys, actor_id=owner.id, message="buildingSMART sample house (CC BY 4.0)")
    approve_version(db, v, owner.id, "Seeded")
    db.commit()
    return project


def seed_duplex_ifc(db: Session) -> Project:
    """Optional detailed public project; costs a few minutes to tessellate on first import."""
    import json

    from app.bim.ifc_import import import_ifc
    from app.services.models import approve_version
    from app.storage import get_storage

    name = "Duplex Apartment — detailed BIM"
    existing = db.scalar(select(Project).where(Project.name == name))
    if existing:
        return existing
    root = SAMPLES / "ifc/duplex"
    source = json.loads((root / "source.json").read_text())
    if not all((root / filename).exists() for filename in source["files"]):
        raise FileNotFoundError("Run python -m app.bim.audit --download before seeding the detailed model")
    demo = seed(db)
    owner = db.scalar(select(User).where(User.email == "owner@example.com"))
    project = Project(id=new_id(), org_id=demo.org_id, name=name, address="Public buildingSMART duplex sample",
                      settings={"model_building_aliases": source["building_aliases"], "approval_mode": "manual"})
    db.add(project)
    db.flush()
    for member in db.scalars(select(ProjectMember).where(ProjectMember.project_id == demo.id)):
        db.add(ProjectMember(project_id=project.id, user_id=member.user_id, role=member.role, trades=member.trades))
    keys = [(get_storage().put_file(f"projects/{project.id}/uploads/duplex/{filename}", root / filename), None)
            for filename in source["files"]]
    version = import_ifc(db, project, keys, actor_id=owner.id, message=source["attribution"])
    approve_version(db, version, owner.id, "Public test model; not a live construction project")
    db.commit()
    return project


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--duplex", action="store_true", help="Also import the detailed public duplex project")
    args = parser.parse_args()
    with SessionLocal() as s:
        p = seed(s)
        seed_sample_ifc(s)
        if args.duplex:
            seed_duplex_ifc(s)
        print(f"Demo projects ready: {DEMO_PROJECT}, {SAMPLE_PROJECT}")
        print("Log in as owner@example.com / pm@example.com / plumber@example.com / electrician@example.com /")
        print("inspector@example.com with password:", os.environ.get("DEMO_PASSWORD", "demo-password"))
