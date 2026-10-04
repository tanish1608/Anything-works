"""Buildings → levels → zones. Reads are scoped for trade members; writes need structure.edit."""

from typing import TypeVar

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth.deps import current_user
from app.db import get_db
from app.models import Building, Level, User, Zone, new_id
from app.rbac import Perm, require, zone_visible
from app.schemas import (
    BuildingIn,
    BuildingOut,
    LevelIn,
    LevelOut,
    LevelPatch,
    ZoneIn,
    ZoneOut,
    ZonePatch,
)
from app.services import events
from app.services.structure import project_of_level, project_of_zone

router = APIRouter(tags=["structure"])
T = TypeVar("T")


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _get(db: Session, model: type[T], id_: str) -> T:
    obj = db.get(model, id_)
    if obj is None:
        raise _404(model.__name__)
    return obj


@router.get("/projects/{project_id}/tree", response_model=list[BuildingOut])
def tree(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    member = require(db, project_id, user.id, Perm.project_view)
    buildings = db.scalars(
        select(Building).where(Building.project_id == project_id).order_by(Building.name)
        .options(selectinload(Building.levels).selectinload(Level.zones))
    ).all()
    out = []
    for b in buildings:
        bo = BuildingOut.model_validate(b)
        for lo in bo.levels:
            lo.zones = [z for z in lo.zones if zone_visible(member, z.id)]
        out.append(bo)
    return out


# ---- buildings ----
@router.post("/projects/{project_id}/buildings", response_model=BuildingOut, status_code=201)
def create_building(project_id: str, body: BuildingIn, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    require(db, project_id, user.id, Perm.structure_edit)
    b = Building(id=new_id(), project_id=project_id, name=body.name)
    db.add(b)
    events.record(db, project_id=project_id, actor_id=user.id, type="building.created", entity_type="building",
                  entity_id=b.id, data=body.model_dump())
    db.commit()
    return BuildingOut(id=b.id, project_id=project_id, name=b.name, levels=[])


@router.patch("/buildings/{building_id}", response_model=BuildingOut)
def rename_building(building_id: str, body: BuildingIn, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    b = _get(db, Building, building_id)
    require(db, b.project_id, user.id, Perm.structure_edit)
    events.record(db, project_id=b.project_id, actor_id=user.id, type="building.updated",
                  entity_type="building", entity_id=b.id, data={"before": {"name": b.name},
                                                                "after": body.model_dump()})
    b.name = body.name
    db.commit()
    db.refresh(b)
    return b


@router.delete("/buildings/{building_id}", status_code=204)
def delete_building(building_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    b = _get(db, Building, building_id)
    require(db, b.project_id, user.id, Perm.structure_edit)
    events.record(db, project_id=b.project_id, actor_id=user.id, type="building.deleted",
                  entity_type="building", entity_id=b.id,
                  data={"snapshot": BuildingOut.model_validate(b).model_dump()})
    db.delete(b)
    db.commit()


# ---- levels ----
@router.post("/buildings/{building_id}/levels", response_model=LevelOut, status_code=201)
def create_level(building_id: str, body: LevelIn, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    b = _get(db, Building, building_id)
    require(db, b.project_id, user.id, Perm.structure_edit)
    lv = Level(id=new_id(), building_id=b.id, **body.model_dump())
    db.add(lv)
    events.record(db, project_id=b.project_id, actor_id=user.id, type="level.created", entity_type="level",
                  entity_id=lv.id, data=body.model_dump())
    db.commit()
    db.refresh(lv)
    return lv


@router.patch("/levels/{level_id}", response_model=LevelOut)
def update_level(level_id: str, body: LevelPatch, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    lv = _get(db, Level, level_id)
    pid = project_of_level(db, lv)
    require(db, pid, user.id, Perm.structure_edit)
    changes = body.model_dump(exclude_unset=True)
    before = {k: getattr(lv, k) for k in changes}
    for k, v in changes.items():
        setattr(lv, k, v)
    events.record(db, project_id=pid, actor_id=user.id, type="level.updated", entity_type="level",
                  entity_id=lv.id, data={"before": before, "after": changes})
    db.commit()
    db.refresh(lv)
    return lv


@router.delete("/levels/{level_id}", status_code=204)
def delete_level(level_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    lv = _get(db, Level, level_id)
    pid = project_of_level(db, lv)
    require(db, pid, user.id, Perm.structure_edit)
    events.record(db, project_id=pid, actor_id=user.id, type="level.deleted", entity_type="level",
                  entity_id=lv.id, data={"snapshot": LevelOut.model_validate(lv).model_dump()})
    db.delete(lv)
    db.commit()


# ---- zones ----
@router.post("/levels/{level_id}/zones", response_model=ZoneOut, status_code=201)
def create_zone(level_id: str, body: ZoneIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    lv = _get(db, Level, level_id)
    pid = project_of_level(db, lv)
    require(db, pid, user.id, Perm.structure_edit)
    z = Zone(id=new_id(), level_id=lv.id, **body.model_dump())
    db.add(z)
    db.flush()
    events.record(db, project_id=pid, actor_id=user.id, type="zone.created", entity_type="zone",
                  entity_id=z.id, zone_id=z.id, data=body.model_dump())
    db.commit()
    db.refresh(z)
    return z


@router.get("/zones/{zone_id}", response_model=ZoneOut)
def get_zone(zone_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    z = _get(db, Zone, zone_id)
    member = require(db, project_of_zone(db, z), user.id, Perm.project_view)
    if not zone_visible(member, z.id):
        raise _404("Zone")
    return z


@router.get("/zones/by-qr/{token}", response_model=ZoneOut)
def zone_by_qr(token: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Resolve a printed room QR code to a zone (field workflow, M4)."""
    z = db.scalar(select(Zone).where(Zone.qr_token == token))
    if z is None:
        raise _404("Zone")
    member = require(db, project_of_zone(db, z), user.id, Perm.project_view)
    if not zone_visible(member, z.id):
        raise _404("Zone")
    return z


@router.patch("/zones/{zone_id}", response_model=ZoneOut)
def update_zone(zone_id: str, body: ZonePatch, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    z = _get(db, Zone, zone_id)
    pid = project_of_zone(db, z)
    require(db, pid, user.id, Perm.structure_edit)
    changes = body.model_dump(exclude_unset=True)
    before = {k: getattr(z, k) for k in changes}
    for k, v in changes.items():
        setattr(z, k, v)
    events.record(db, project_id=pid, actor_id=user.id, type="zone.updated", entity_type="zone",
                  entity_id=z.id, zone_id=z.id, data={"before": before, "after": changes})
    db.commit()
    db.refresh(z)
    return z


@router.delete("/zones/{zone_id}", status_code=204)
def delete_zone(zone_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    z = _get(db, Zone, zone_id)
    pid = project_of_zone(db, z)
    require(db, pid, user.id, Perm.structure_edit)
    events.record(db, project_id=pid, actor_id=user.id, type="zone.deleted", entity_type="zone",
                  entity_id=z.id, zone_id=z.id, data={"snapshot": ZoneOut.model_validate(z).model_dump()})
    db.delete(z)
    db.commit()
