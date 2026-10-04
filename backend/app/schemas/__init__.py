from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models import TRADES, Role


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- auth ---
class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    org_name: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(ORM):
    id: str
    email: str
    name: str


# --- projects / members ---
class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str | None = None


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = None


class ProjectOut(ORM):
    id: str
    name: str
    address: str | None
    settings: dict
    created_at: datetime


class ProjectWithRole(ProjectOut):
    my_role: Role


def _check_trades(v: list[str] | None) -> list[str] | None:
    if v is not None:
        bad = [t for t in v if t not in TRADES]
        if bad:
            raise ValueError(f"unknown trades: {bad}")
    return v


class MemberIn(BaseModel):
    email: EmailStr
    role: Role
    trades: list[str] = []
    zone_ids: list[str] | None = None

    _v = field_validator("trades")(_check_trades)


class MemberPatch(BaseModel):
    role: Role | None = None
    trades: list[str] | None = None
    zone_ids: list[str] | None = None
    clear_zone_scope: bool = False  # set zone_ids back to "all zones"

    _v = field_validator("trades")(_check_trades)


class MemberOut(ORM):
    id: str
    user: UserOut
    role: Role
    trades: list[str]
    zone_ids: list[str] | None


# --- structure ---
class BuildingIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class LevelIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    index: int = 0
    elevation_m: float = 0.0
    height_m: float = Field(default=3.0, gt=0, le=20)


class LevelPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    index: int | None = None
    elevation_m: float | None = None
    height_m: float | None = Field(default=None, gt=0, le=20)


Polygon = list[tuple[float, float]]


class ZoneIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str | None = None
    kind: str = "room"
    polygon: Polygon | None = None


class ZonePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = None
    kind: str | None = None
    polygon: Polygon | None = None


class ZoneOut(ORM):
    id: str
    level_id: str
    name: str
    code: str | None
    kind: str
    polygon: list | None
    qr_token: str


class LevelOut(ORM):
    id: str
    building_id: str
    name: str
    index: int
    elevation_m: float
    height_m: float
    zones: list[ZoneOut] = []


class BuildingOut(ORM):
    id: str
    project_id: str
    name: str
    levels: list[LevelOut] = []


class EventOut(ORM):
    id: int
    project_id: str | None
    actor_id: str | None
    actor_name: str | None = None
    at: datetime
    type: str
    entity_type: str
    entity_id: str
    zone_id: str | None
    evidence_ids: list[str]
    data: dict
    message: str | None


# --- models / elements / jobs ---
class JobOut(ORM):
    id: str
    kind: str
    status: str
    result: dict | None
    error: str | None
    created_at: datetime
    finished_at: datetime | None


class ModelVersionOut(ORM):
    id: str
    number: int
    parent_id: str | None
    branch: str
    message: str
    source: str
    status: str
    author_id: str | None
    approved_by: str | None
    approved_at: datetime | None
    created_at: datetime
    stats: dict
    is_current: bool = False


class MeshLayer(BaseModel):
    discipline: str
    url: str
    context: bool  # read-only ghost layer for trade members


class ViewerManifest(BaseModel):
    version: ModelVersionOut | None
    layers: list[MeshLayer]


class ElementOut(BaseModel):
    id: str
    ifc_guid: str
    name: str | None
    ifc_class: str
    discipline: str
    trade: str
    level_id: str | None
    zone_id: str | None
    bbox: list[float] | None
    status: str
    flags: list[str]
    source: str
    confidence: float | None
    open_issues: int = 0
    context: bool = False


class ElementDetail(ElementOut):
    props: dict
    history: list[EventOut]


class ApproveIn(BaseModel):
    message: str | None = None


# --- issues ---
from app.models import IssueStatus, Priority  # noqa: E402


class ViewpointIn(BaseModel):
    position: tuple[float, float, float]
    target: tuple[float, float, float]
    section: dict | None = None


class IssueIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    priority: Priority = Priority.medium
    trade: str | None = None
    assignee_id: str | None = None
    due_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    element_id: str | None = None
    zone_id: str | None = None
    anchor: tuple[float, float, float] | None = None
    sheet_anchor: dict | None = None
    viewpoint: ViewpointIn | None = None

    _v = field_validator("trade")(lambda v: _check_trades([v])[0] if v else v)


class IssuePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    status: IssueStatus | None = None
    priority: Priority | None = None
    trade: str | None = None
    assignee_id: str | None = None
    due_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    viewpoint: ViewpointIn | None = None


class AttachmentOut(ORM):
    id: str
    filename: str
    content_type: str
    size: int
    created_at: datetime
    url: str = ""


class CommentOut(ORM):
    id: str
    body: str
    created_at: datetime
    author: UserOut | None


class IssueOut(ORM):
    id: str
    number: int
    title: str
    description: str
    status: IssueStatus
    priority: Priority
    trade: str | None
    assignee_id: str | None
    assignee_name: str | None = None
    due_date: str | None
    element_id: str | None
    zone_id: str | None
    level_id: str | None
    anchor: list[float] | None
    sheet_anchor: dict | None
    viewpoint: dict | None
    created_by: str | None
    creator_name: str | None = None
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None
    comment_count: int = 0


class IssueDetail(IssueOut):
    comments: list[CommentOut]
    attachments: list[AttachmentOut]


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class NotificationOut(ORM):
    id: str
    project_id: str | None
    kind: str
    title: str
    body: str
    link: str | None
    created_at: datetime
    read_at: datetime | None


# --- drawings ---
class SheetOut(ORM):
    id: str
    project_id: str
    level_id: str | None
    discipline: str
    name: str
    filename: str
    file_type: str
    status: str
    error: str | None
    unit_m: float | None
    units_confirmed: bool
    transform: dict
    layer_roles: dict
    detected_counts: dict | None
    corrections: dict
    created_at: datetime
    updated_at: datetime
    counts: dict | None = None
    warnings: list[str] = []
    review_open: int = 0


class SheetDetail(SheetOut):
    plan: dict | None


class SheetPatch(BaseModel):
    name: str | None = None
    level_id: str | None = None
    discipline: str | None = None
    unit_m: float | None = Field(default=None, gt=0, le=10)  # confirming/overriding the scale re-runs detection
    layer_roles: dict[str, str] | None = None  # re-runs detection
    transform: dict | None = None  # {dx, dy, rotation_deg} or {reference: [x, y]} (sheet metres)


class EditsIn(BaseModel):
    ops: list[dict] = Field(min_length=1, max_length=500)


class BuildIn(BaseModel):
    level_ids: list[str] | None = None
    message: str = ""


# --- progress ---
class PhotoOut(ORM):
    id: str
    upload_id: str
    width: int | None
    height: int | None
    exif_time: datetime | None
    gps_lat: float | None
    gps_lon: float | None
    flags: list[str]
    created_at: datetime
    url: str = ""
    thumb_url: str = ""


class VerificationOut(ORM):
    id: str
    upload_id: str | None
    element_id: str
    verdict: str
    confidence: float | None
    reason: str
    source: str
    model: str | None
    prompt_version: str | None
    state: str
    confirmed_by: str | None
    confirmed_at: datetime | None
    overridden: bool
    override_reason: str | None
    created_at: datetime
    element_name: str | None = None
    element_class: str | None = None


class UploadOut(ORM):
    id: str
    zone_id: str | None
    trade: str
    user_id: str | None
    user_name: str | None = None
    zone_name: str | None = None
    note: str
    client_uuid: str
    captured_at: datetime | None
    created_at: datetime
    analysis_status: str
    photos: list[PhotoOut] = []
    verifications: list[VerificationOut] = []


class ReviewIn(BaseModel):
    reason: str = ""


class StatusIn(BaseModel):
    status: str
    reason: str = Field(min_length=3, max_length=2000)
    upload_id: str | None = None  # evidence; required for "done"
