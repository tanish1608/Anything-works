from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Outcome = Literal["pass", "potential_discrepancy", "insufficient_evidence", "unsupported", "failed"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Observation(StrictModel):
    """What the model returns per component; every identifier is validated server-side."""

    element_id: str
    outcome: Literal["pass", "potential_discrepancy", "insufficient_evidence", "unsupported"]
    observation: str = Field(min_length=1, max_length=1500)
    evidence_ids: list[str] = Field(max_length=6)
    limitations: list[str] = Field(max_length=8)


class Assessment(StrictModel):
    observations: list[Observation] = Field(max_length=40)


class CheckResult(StrictModel):
    check_code: str
    check_version: str
    element_id: str
    outcome: Outcome
    observation: str
    evidence_ids: list[str]
    sources: list[dict]
    limitations: list[str]
    completion_eligible: bool = False


class ChatTurn(StrictModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


class ChatCreate(StrictModel):
    input_revision: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=2000)
    page: str = Field(default="overview", max_length=40)
    # Public samples only: the browser's visible local records (untrusted, never authenticated facts).
    display_context: str = Field(default="", max_length=6000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)
    # Photos waiting in the chat composer; the copilot suggests which work item they belong to.
    attachments: int = Field(default=0, ge=0, le=6)
    selected_work_id: str | None = Field(default=None, max_length=80)
    # Public samples only: work the current user may submit photos for.
    candidate_work_ids: list[str] = Field(default_factory=list, max_length=60)


class ChatResult(StrictModel):
    input_revision: str
    status: Literal["available", "unavailable"]
    message: str
    suggested_questions: list[str] = Field(max_length=3)
    work_ids: list[str] = Field(max_length=3)
    sources: list[str]
    partial_context: bool
