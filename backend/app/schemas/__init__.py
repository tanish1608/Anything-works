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
