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
