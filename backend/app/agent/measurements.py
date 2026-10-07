"""Phone capture metadata and deterministic measurement checks against approved model geometry.

The AI never judges numbers: the server compares a LiDAR measurement with the value derived from the approved
model component, using the measurement's stated uncertainty and the project's tolerance.
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.agent.schemas import CheckResult

MEASUREMENT_CHECK = "mounting_height"


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Measurement(Strict):
    # Floor-to-centre height of the work's component, measured by tapping the floor and the device in AR.
    kind: Literal["mounting_height"]
    value_m: float = Field(ge=0, le=20)
    uncertainty_m: float = Field(ge=0, le=1)
    method: Literal["arkit_lidar", "arkit_camera", "manual"]
    note: str = Field(default="", max_length=300)


class GeoFix(Strict):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    accuracy_m: float = Field(ge=0, le=100000)
    at: datetime


class Device(Strict):
    model: str = Field(default="", max_length=80)
    os: str = Field(default="", max_length=40)
    app: str = Field(default="", max_length=40)
    lidar: bool = False


class Capture(Strict):
    measurements: list[Measurement] = Field(default_factory=list, max_length=10)
    location: GeoFix | None = None
    device: Device | None = None


def expected_mounting_height(bbox: list[float] | None, level_elevation: float | None) -> float | None:
    """Component centre above its level, from the approved model (IFC metres, Z up)."""
    if not bbox or level_elevation is None:
        return None
    return round((bbox[2] + bbox[5]) / 2 - level_elevation, 3)


def checks(context: dict) -> list[CheckResult]:
    capture = context.get("capture") or {}
    tolerance = context.get("measurement_tolerance_m")
    out = []
    for element in context["elements"]:
        expected = (element.get("expected") or {}).get(MEASUREMENT_CHECK)
        for m in capture.get("measurements", []):
            if m["kind"] != MEASUREMENT_CHECK:
                continue
            value, unc = m["value_m"], m["uncertainty_m"]
            limits = ["Compared with approved model geometry, not a dimensioned drawing",
                      f"Phone measurement accuracy is not validated (stated ±{unc:.3f} m, method {m['method']})"]
            if expected is None:
                outcome, text = "unsupported", "The model has no floor reference for this component's height."
            elif unc > tolerance:
                outcome = "insufficient_evidence"
                text = f"Measured {value:.3f} m ±{unc:.3f} m; uncertainty exceeds the ±{tolerance:.3f} m tolerance."
            else:
                diff = value - expected
                if abs(diff) <= tolerance - unc:
                    outcome = "pass"
                elif abs(diff) > tolerance + unc:
                    outcome = "potential_discrepancy"
                else:
                    outcome = "insufficient_evidence"
                text = (f"Measured mounting height {value:.3f} m (±{unc:.3f}) vs model {expected:.3f} m: "
                        f"{'+' if diff >= 0 else ''}{diff * 1000:.0f} mm, tolerance ±{tolerance * 1000:.0f} mm.")
            out.append(CheckResult(check_code=MEASUREMENT_CHECK, check_version="1", element_id=element["id"],
                                   outcome=outcome, observation=text, evidence_ids=[],
                                   sources=[s for s in context["sources"] if s["locator"] == f"element:{element['id']}"],
                                   limitations=limits))
    return out

