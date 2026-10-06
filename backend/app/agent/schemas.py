from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, WithJsonSchema


def _uuid(value: str) -> str:
    return str(UUID(value))


UUIDString = Annotated[str, AfterValidator(_uuid), WithJsonSchema({"type": "string", "format": "uuid"})]


def _unique(values: list[str]) -> list[str]:
    if len(values) != len(set(values)):
        raise ValueError("Duplicate identifiers")
    return values


UniqueIDs = Annotated[list[UUIDString], AfterValidator(_unique), Field(json_schema_extra={"uniqueItems": True})]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SourceRef(StrictModel):
    kind: Literal["drawing", "specification", "approved_change", "model", "event", "issue"]
    id: str
    revision: str
    locator: str | None
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class RunCreate(StrictModel):
    upload_id: UUIDString
    model_version_id: UUIDString


class Error(StrictModel):
    code: Literal["unauthenticated", "forbidden", "not_found", "stale_revision", "superseded", "idempotency_conflict",
                  "invalid_input", "rate_limited", "provider_unavailable", "unsupported_check", "analysis_failed"]
    message: str


Outcome = Literal["pass", "potential_discrepancy", "insufficient_evidence", "unsupported", "failed"]


class CheckResult(StrictModel):
    id: UUIDString
    check_code: str
    check_version: str
    element_ids: UniqueIDs = Field(min_length=1)
    outcome: Outcome
    observation: str
    evidence_ids: UniqueIDs
    sources: list[SourceRef]
    limitations: list[str]
    completion_eligible: bool


class ProposedAction(StrictModel):
    id: UUIDString
    kind: Literal["record_progress", "request_evidence", "open_review"]
    status: Literal["proposed", "applied", "rejected", "superseded", "failed"]
    expected_revision: int = Field(ge=0)
    fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    check_ids: UniqueIDs = Field(min_length=1)
    element_ids: UniqueIDs = Field(min_length=1)
    description: str
    requires_review: bool


class Run(StrictModel):
    id: UUIDString
    project_id: UUIDString
    upload_id: UUIDString
    model_version_id: UUIDString
    status: Literal["queued", "running", "awaiting_review", "completed", "failed", "cancelled", "superseded"]
    created_at: datetime
    updated_at: datetime
    policy_version: str
    prompt_version: str
    model: str | None
    sources: list[SourceRef]
    checks: list[CheckResult]
    actions: list[ProposedAction]
    error: Error | None


class DecisionCreate(StrictModel):
    decision: Literal["accept", "reject"]
    expected_revision: int = Field(ge=0)
    fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    reason: str = Field(min_length=1, max_length=2000)


class Decision(StrictModel):
    id: UUIDString
    action_id: UUIDString
    actor_id: UUIDString
    decision: Literal["accept", "reject"]
    reason: str
    created_at: datetime
    action: ProposedAction


class Observation(StrictModel):
    element_id: str
    outcome: Outcome
    observation: str = Field(min_length=1, max_length=1500)
    evidence_ids: list[str] = Field(max_length=6)
    source_ids: list[str] = Field(max_length=8)
    limitations: list[str] = Field(max_length=8)


class Assessment(StrictModel):
    observations: list[Observation] = Field(max_length=40)


class SuggestionCreate(StrictModel):
    kind: Literal["note", "location", "evidence_request"]
    input_revision: str = Field(min_length=1, max_length=128)
    text: str = Field(max_length=2000)
    model_version_id: UUIDString
    element_ids: UniqueIDs = Field(max_length=50)


class Suggestion(StrictModel):
    text: str
    reason: str
    element_ids: UniqueIDs
    sources: list[SourceRef]


class SuggestionResult(StrictModel):
    input_revision: str
    status: Literal["available", "unavailable"]
    reason: str | None
    suggestions: list[Suggestion] = Field(max_length=5)


class SummaryStatement(StrictModel):
    text: str
    event_ids: Annotated[list[Annotated[int, Field(ge=1)]], AfterValidator(_unique), Field(json_schema_extra={"uniqueItems": True})] = Field(min_length=1)
    run_ids: UniqueIDs


class SummaryRefresh(StrictModel):
    date: date
    timezone: str = Field(min_length=1, max_length=100)


class DailySummary(StrictModel):
    project_id: UUIDString
    date: date
    timezone: str
    status: Literal["available", "unavailable", "stale"]
    generated_at: datetime | None
    partial_history: bool
    statements: list[SummaryStatement]
    reason: str | None


class VoiceCreate(StrictModel):
    zone_id: UUIDString
    trade: str = Field(min_length=1, max_length=30)
    filename: str = Field(min_length=1, max_length=200)
    mime_type: Literal["audio/wav", "audio/mpeg", "audio/m4a", "audio/mp4", "audio/ogg", "audio/webm"]
    captured_at: datetime | None
    audio_base64: str = Field(min_length=1, max_length=11184812)


class VoiceCorrection(StrictModel):
    text: str = Field(min_length=1, max_length=5000)
    expected_revision: int = Field(ge=0)


class VoiceNote(StrictModel):
    id: UUIDString
    project_id: UUIDString
    actor_id: UUIDString
    zone_id: UUIDString
    trade: str
    filename: str
    mime_type: str
    captured_at: datetime | None
    created_at: datetime
    status: Literal["queued", "running", "completed", "failed"]
    original_text: str | None
    text: str | None
    revision: int = Field(ge=0)
    model: str | None
    original_url: str
    error: Error | None


class ChatTurn(StrictModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


class ChatCreate(StrictModel):
    input_revision: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=2000)
    page: Literal["overview", "summary", "record", "issues", "activity", "team", "project", "capture", "component", "locations"]
    display_context: str = Field(default="", max_length=6000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)


class ChatResult(StrictModel):
    input_revision: str = Field(min_length=1, max_length=128)
    status: Literal["available", "unavailable"]
    message: str = Field(min_length=1, max_length=4000)
    sources: list[SourceRef] = Field(max_length=12)
    suggested_questions: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(max_length=3)
    partial_context: bool
