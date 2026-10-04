"""SQLAlchemy models. Kept portable between SQLite and Postgres (JSON, string UUIDs, no PG-only types)."""

import enum
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, event
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship

from app.db import Base


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class Role(enum.StrEnum):
    owner = "owner"
    pm = "pm"
    trade = "trade"
    viewer = "viewer"


# Trades/disciplines. A code constant for now; becomes a table when orgs need custom trades.
TRADES: dict[str, str] = {
    "architecture": "Architecture",
    "structure": "Structure",
    "framing": "Framing",
    "plumbing": "Plumbing",
    "electrical": "Electrical",
    "hvac": "HVAC",
    "flooring": "Flooring",
}


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(100))


class RefreshToken(Base):
    """One row per issued refresh token, so tokens can be rotated, revoked and reuse detected."""

    __tablename__ = "refresh_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)  # jti
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family_id: Mapped[str] = mapped_column(String(36), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))


class OrgMembership(Base):
    __tablename__ = "org_memberships"
    __table_args__ = (UniqueConstraint("org_id", "user_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    is_admin: Mapped[bool] = mapped_column(default=False)


class Project(TimestampMixin, Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(500))
    # approval_mode ("pm_required" | "auto"), confidence_threshold, ...
    settings: Mapped[dict] = mapped_column(JSON, default=lambda: {"approval_mode": "pm_required"})

    buildings: Mapped[list["Building"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Building.name"
    )


class ProjectMember(TimestampMixin, Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[Role] = mapped_column(Enum(Role, native_enum=False, length=20))
    # Scope for trade members. trades: list of TRADES codes. zone_ids: None = all zones.
    trades: Mapped[list] = mapped_column(JSON, default=list)
    zone_ids: Mapped[list | None] = mapped_column(JSON, default=None)

    user: Mapped[User] = relationship()


class Building(TimestampMixin, Base):
    __tablename__ = "buildings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))

    project: Mapped[Project] = relationship(back_populates="buildings")
    levels: Mapped[list["Level"]] = relationship(
        back_populates="building", cascade="all, delete-orphan", order_by="Level.index"
    )


class Level(TimestampMixin, Base):
    __tablename__ = "levels"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    building_id: Mapped[str] = mapped_column(ForeignKey("buildings.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    index: Mapped[int] = mapped_column(Integer, default=0)  # 0 = ground, -1 = basement
    elevation_m: Mapped[float] = mapped_column(default=0.0)
    height_m: Mapped[float] = mapped_column(default=3.0)  # floor-to-floor

    building: Mapped[Building] = relationship(back_populates="levels")
    zones: Mapped[list["Zone"]] = relationship(
        back_populates="level", cascade="all, delete-orphan", order_by="Zone.name"
    )


class Zone(TimestampMixin, Base):
    __tablename__ = "zones"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    level_id: Mapped[str] = mapped_column(ForeignKey("levels.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))  # "Unit 304, Master Bedroom"
    code: Mapped[str | None] = mapped_column(String(50))  # "304-MB"
    kind: Mapped[str] = mapped_column(String(30), default="room")  # room | unit | area | lot
    polygon: Mapped[list | None] = mapped_column(JSON)  # [[x, y], ...] in level coordinates (m)
    qr_token: Mapped[str] = mapped_column(
        String(32), unique=True, default=lambda: secrets.token_urlsafe(16)
    )

    level: Mapped[Level] = relationship(back_populates="zones")


class Event(Base):
    """Append-only change log. Never updated or deleted (enforced by ORM guard + DB triggers)."""

    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str | None] = mapped_column(String(36), index=True)  # no FK: outlives the project
    actor_id: Mapped[str | None] = mapped_column(String(36), index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    type: Mapped[str] = mapped_column(String(80))  # e.g. "zone.created"
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(36))
    zone_id: Mapped[str | None] = mapped_column(String(36), index=True)
    evidence_ids: Mapped[list] = mapped_column(JSON, default=list)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    message: Mapped[str | None] = mapped_column(Text)


class AppendOnlyViolation(RuntimeError):
    pass


@event.listens_for(Session, "before_flush")
def _guard_events(session: Session, _ctx, _instances) -> None:
    for obj in list(session.dirty) + list(session.deleted):
        if isinstance(obj, Event):
            raise AppendOnlyViolation("events are append-only")


EVENT_GUARD_SQL = {
    "sqlite": [
        "CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events "
        "BEGIN SELECT RAISE(ABORT, 'events are append-only'); END",
        "CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events "
        "BEGIN SELECT RAISE(ABORT, 'events are append-only'); END",
    ],
    "postgresql": [
        "CREATE OR REPLACE FUNCTION events_append_only() RETURNS trigger AS $$ "
        "BEGIN RAISE EXCEPTION 'events are append-only'; END; $$ LANGUAGE plpgsql",
        "DROP TRIGGER IF EXISTS events_append_only ON events",
        "CREATE TRIGGER events_append_only BEFORE UPDATE OR DELETE ON events "
        "FOR EACH ROW EXECUTE FUNCTION events_append_only()",
    ],
}


def install_event_guards(conn) -> None:
    from sqlalchemy import text

    for stmt in EVENT_GUARD_SQL.get(conn.dialect.name, []):
        conn.execute(text(stmt))
