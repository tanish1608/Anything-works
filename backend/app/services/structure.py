from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Building, Level, Zone


def project_zone_ids(db: Session, project_id: str) -> set[str]:
    return set(
        db.scalars(
            select(Zone.id).join(Level, Zone.level_id == Level.id).join(Building, Level.building_id == Building.id)
            .where(Building.project_id == project_id)
        )
    )


def project_of_level(db: Session, level: Level) -> str:
    return db.get(Building, level.building_id).project_id


def project_of_zone(db: Session, zone: Zone) -> str:
    return project_of_level(db, db.get(Level, zone.level_id))
