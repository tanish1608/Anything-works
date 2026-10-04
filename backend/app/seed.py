"""Create demo users and a demo project so the app can be tried right away.

    python -m app.seed            # idempotent: skips if the demo project exists

All demo users share the password in DEMO_PASSWORD (default "demo-password")."""

import os
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.db import SessionLocal
from app.models import (
    Building,
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


def _user(db: Session, email: str, name: str, password: str) -> User:
    u = db.scalar(select(User).where(User.email == email))
    if u is None:
        u = User(id=new_id(), email=email, name=name, password_hash=hash_password(password))
        db.add(u)
        db.flush()
    return u


def seed(db: Session) -> Project:
    existing = db.scalar(select(Project).where(Project.name == DEMO_PROJECT))
    if existing:
        return existing
    password = os.environ.get("DEMO_PASSWORD", "demo-password")
    users = {email: _user(db, email, name, password) for email, name, _, _ in PEOPLE}
    org = Organization(id=new_id(), name="Maple Homes LLC")
    db.add(org)
    db.flush()
    for u in users.values():
        db.add(OrgMembership(org_id=org.id, user_id=u.id, is_admin=u.email == "owner@example.com"))
    owner = users["owner@example.com"]
    project = Project(id=new_id(), org_id=org.id, name=DEMO_PROJECT, address="123 Maple St")
    db.add(project)
    db.flush()
    events.record(db, project_id=project.id, actor_id=owner.id, type="project.created", entity_type="project",
                  entity_id=project.id, data={"name": project.name})

    b = Building(id=new_id(), project_id=project.id, name="Building A")
    db.add(b)
    zone_ids: dict[str, str] = {}
    for i, (lname, units) in enumerate([("Level 1", ["101", "102"]), ("Level 2", ["201", "202"])]):
        lv = Level(id=new_id(), building_id=b.id, name=lname, index=i, elevation_m=i * 3.0, height_m=3.0)
        db.add(lv)
        for unit in units:
            for room in ("Kitchen", "Bathroom", "Bedroom 1"):
                z = Zone(id=new_id(), level_id=lv.id, name=f"Unit {unit}, {room}", code=f"{unit}-{room[:3].upper()}")
                db.add(z)
                zone_ids[z.name] = z.id
    db.flush()

    for email, _, role, trades in PEOPLE:
        scope = None
        if email == "plumber@example.com":
            scope = [zid for name, zid in zone_ids.items() if "Kitchen" in name or "Bathroom" in name]
        db.add(ProjectMember(project_id=project.id, user_id=users[email].id, role=role, trades=trades, zone_ids=scope))
    events.record(db, project_id=project.id, actor_id=owner.id, type="project.seeded", entity_type="project",
                  entity_id=project.id, data={"zones": len(zone_ids)})
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


if __name__ == "__main__":
    with SessionLocal() as s:
        p = seed(s)
        seed_sample_ifc(s)
        print(f"Demo project ready: {p.name} ({p.id})")
        print("Log in as owner@example.com / pm@example.com / plumber@example.com / electrician@example.com /")
        print("inspector@example.com with password:", os.environ.get("DEMO_PASSWORD", "demo-password"))
