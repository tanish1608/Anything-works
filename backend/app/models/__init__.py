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


DEFAULT_PROJECT_SETTINGS = {
    "approval_mode": "pm_required",  # or "auto" (M5)
    "confidence_threshold": 0.85,
    # Layers trade members see as faint, read-only context around their own trade.
    "trade_context_disciplines": ["architecture"],
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
    settings: Mapped[dict] = mapped_column(JSON, default=lambda: dict(DEFAULT_PROJECT_SETTINGS))
    current_version_id: Mapped[str | None] = mapped_column(String(36))  # latest approved model on main

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
    ifc_guid: Mapped[str | None] = mapped_column(String(22), index=True)
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


# ---------------------------------------------------------------- models & elements (M1)

class ElementStatus(enum.StrEnum):
    not_started = "not_started"
    in_progress = "in_progress"
    needs_review = "needs_review"
    done = "done"


class ModelVersion(Base):
    """A commit of the building model. Branch/merge-ready via parent_id + merge_parent_id."""

    __tablename__ = "model_versions"
    __table_args__ = (UniqueConstraint("project_id", "number"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)  # 1, 2, 3 ... per project
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("model_versions.id"))
    merge_parent_id: Mapped[str | None] = mapped_column(ForeignKey("model_versions.id"))
    branch: Mapped[str] = mapped_column(String(100), default="main")
    message: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(30))  # ifc_import | conversion | edit
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | approved | rejected
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # {"meshes": {discipline: storage_key}, "ifc": [storage_key, ...]}
    files: Mapped[dict] = mapped_column(JSON, default=dict)
    stats: Mapped[dict] = mapped_column(JSON, default=dict)


class Element(Base):
    """Stable identity of a physical thing in the building. Status lives here (progress is about the
    physical element, not a model version). Never deleted; versions decide whether it is present."""

    __tablename__ = "elements"
    __table_args__ = (UniqueConstraint("project_id", "ifc_guid"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    ifc_guid: Mapped[str] = mapped_column(String(64))
    status: Mapped[ElementStatus] = mapped_column(
        Enum(ElementStatus, native_enum=False, length=20), default=ElementStatus.not_started
    )
    flags: Mapped[list] = mapped_column(JSON, default=list)  # e.g. ["possibly_missed", "retake_photo"]
    status_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ElementRevision(Base):
    """What an element looks like in one model version."""

    __tablename__ = "element_revisions"
    __table_args__ = (UniqueConstraint("version_id", "element_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id", ondelete="CASCADE"), index=True)
    element_id: Mapped[str] = mapped_column(ForeignKey("elements.id", ondelete="CASCADE"), index=True)
    name: Mapped[str | None] = mapped_column(String(300))
    ifc_class: Mapped[str] = mapped_column(String(80))
    discipline: Mapped[str] = mapped_column(String(30), index=True)
    trade: Mapped[str] = mapped_column(String(30), index=True)
    level_id: Mapped[str | None] = mapped_column(ForeignKey("levels.id", ondelete="SET NULL"), index=True)
    zone_id: Mapped[str | None] = mapped_column(ForeignKey("zones.id", ondelete="SET NULL"), index=True)
    bbox: Mapped[list | None] = mapped_column(JSON)  # [minx, miny, minz, maxx, maxy, maxz] IFC coords (Z up)
    props: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(20), default="drawn")  # drawn | traced | as_built | imported
    confidence: Mapped[float | None] = mapped_column()
    geom_hash: Mapped[str | None] = mapped_column(String(64))


class Job(Base):
    """Background work (IFC import, conversion, photo analysis). Polled by the in-process worker."""

    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)  # queued|running|done|failed
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------- issues & notifications (M2)

class IssueStatus(enum.StrEnum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


OPEN_ISSUE_STATUSES = (IssueStatus.open, IssueStatus.in_progress)


class Priority(enum.StrEnum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class Issue(Base):
    __tablename__ = "issues"
    __table_args__ = (UniqueConstraint("project_id", "number"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[IssueStatus] = mapped_column(Enum(IssueStatus, native_enum=False, length=20),
                                                default=IssueStatus.open, index=True)
    priority: Mapped[Priority] = mapped_column(Enum(Priority, native_enum=False, length=20), default=Priority.medium)
    trade: Mapped[str | None] = mapped_column(String(30), index=True)
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    due_date: Mapped[str | None] = mapped_column(String(10))  # ISO date
    element_id: Mapped[str | None] = mapped_column(ForeignKey("elements.id", ondelete="SET NULL"), index=True)
    zone_id: Mapped[str | None] = mapped_column(ForeignKey("zones.id", ondelete="SET NULL"), index=True)
    level_id: Mapped[str | None] = mapped_column(ForeignKey("levels.id", ondelete="SET NULL"))
    anchor: Mapped[list | None] = mapped_column(JSON)  # [x, y, z] viewer (three.js) coordinates
    model_version_id: Mapped[str | None] = mapped_column(ForeignKey("model_versions.id", ondelete="SET NULL"))
    sheet_anchor: Mapped[dict | None] = mapped_column(JSON)  # {"sheet_id", "x", "y"} (M3)
    viewpoint: Mapped[dict | None] = mapped_column(JSON)  # camera, target, section box
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    issue_id: Mapped[str] = mapped_column(ForeignKey("issues.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    author: Mapped[User | None] = relationship()


class Attachment(Base):
    """A stored file attached to something (issue, comment...). Progress photos have their own table (M4)."""

    __tablename__ = "attachments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    owner_type: Mapped[str] = mapped_column(String(30))
    owner_id: Mapped[str] = mapped_column(String(36), index=True)
    storage_key: Mapped[str] = mapped_column(String(500))
    filename: Mapped[str] = mapped_column(String(300))
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    uploaded_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str | None] = mapped_column(String(500))  # web app path
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------- drawings & conversion (M3)

class DrawingSheet(Base):
    """An uploaded 2D drawing (DXF now, vector PDF in M7) and its editable detected plan."""

    __tablename__ = "drawing_sheets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    level_id: Mapped[str | None] = mapped_column(ForeignKey("levels.id", ondelete="SET NULL"), index=True)
    discipline: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(300))
    filename: Mapped[str] = mapped_column(String(300))
    file_type: Mapped[str] = mapped_column(String(10))  # dxf | pdf
    storage_key: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="uploaded")  # uploaded|detecting|detected|failed
    error: Mapped[str | None] = mapped_column(Text)
    unit_m: Mapped[float | None] = mapped_column()  # metres per drawing unit (scale)
    units_confirmed: Mapped[bool] = mapped_column(default=False)
    transform: Mapped[dict] = mapped_column(JSON, default=dict)  # {dx, dy, rotation_deg, confirmed}
    layer_roles: Mapped[dict] = mapped_column(JSON, default=dict)  # user overrides {layer: role}
    plan: Mapped[dict | None] = mapped_column(JSON)
    detected_counts: Mapped[dict | None] = mapped_column(JSON)  # counts straight out of detection (for eval)
    corrections: Mapped[dict] = mapped_column(JSON, default=dict)  # {"added": n, "deleted": n, "edited": n}
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------- field progress (M4/M5)

class Upload(Base):
    """One field report: photos + note for a zone and trade, as submitted (possibly after offline queueing)."""

    __tablename__ = "uploads"
    __table_args__ = (UniqueConstraint("project_id", "client_uuid"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    zone_id: Mapped[str | None] = mapped_column(ForeignKey("zones.id", ondelete="SET NULL"), index=True)
    trade: Mapped[str] = mapped_column(String(30))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    note: Mapped[str] = mapped_column(Text, default="")
    client_uuid: Mapped[str] = mapped_column(String(64))  # idempotency key from the offline queue
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # when the worker submitted (device)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)  # when it synced
    reference_key: Mapped[str | None] = mapped_column(String(500))  # viewer snapshot of the zone's trade layer
    analysis_status: Mapped[str] = mapped_column(String(20), default="none")  # none|queued|done|failed|off (M5)
    analysis: Mapped[dict | None] = mapped_column(JSON)  # raw model output + timings (M5)


class Photo(Base):
    __tablename__ = "photos"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    upload_id: Mapped[str] = mapped_column(ForeignKey("uploads.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    zone_id: Mapped[str | None] = mapped_column(String(36), index=True)
    storage_key: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(50))
    size: Mapped[int] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    phash: Mapped[str | None] = mapped_column(String(16), index=True)  # 64-bit difference hash, hex
    exif_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    gps_lat: Mapped[float | None] = mapped_column()
    gps_lon: Mapped[float | None] = mapped_column()
    flags: Mapped[list] = mapped_column(JSON, default=list)  # e.g. ["near_duplicate:<photo_id>"]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Verification(Base):
    """A claim about one element backed by an upload: from the worker's checklist, the AI, or a manager.
    proposed → approved (element done) / rejected. Every approved 'done' links to photo evidence."""

    __tablename__ = "verifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    upload_id: Mapped[str | None] = mapped_column(ForeignKey("uploads.id", ondelete="SET NULL"), index=True)
    element_id: Mapped[str] = mapped_column(ForeignKey("elements.id", ondelete="CASCADE"), index=True)
    verdict: Mapped[str] = mapped_column(String(20))  # installed | missing | not_visible | uncertain
    confidence: Mapped[float | None] = mapped_column()
    reason: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(10))  # worker | ai | manager
    model: Mapped[str | None] = mapped_column(String(100))
    prompt_version: Mapped[str | None] = mapped_column(String(20))
    state: Mapped[str] = mapped_column(String(20), default="proposed", index=True)  # proposed|approved|rejected|superseded
    prev_status: Mapped[str | None] = mapped_column(String(20))  # element status before this claim (to undo on reject)
    confirmed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    overridden: Mapped[bool] = mapped_column(default=False)
    override_reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
