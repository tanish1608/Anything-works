"""Compare the implemented assessment contract with FastAPI's generated schemas."""
import json
from pathlib import Path

import yaml

from app.main import app

CONTRACT = yaml.safe_load((Path(__file__).resolve().parents[2] / "contracts/openapi.yaml").read_text())
IMPLEMENTED = {"listAgentRuns", "createAgentRun", "getAgentRun", "cancelAgentRun", "decideAgentAction",
               "suggestAgentInput", "getAgentDailySummary", "refreshAgentDailySummary", "createAgentVoice",
               "getAgentVoice", "correctAgentVoice", "getAgentVoiceFile", "listAgentVoice"}
SCHEMAS = {"RunCreate", "Run", "CheckResult", "SourceRef", "ProposedAction", "DecisionCreate", "Decision", "Error",
           "SuggestionCreate", "Suggestion", "SuggestionResult", "SummaryStatement", "DailySummary", "SummaryRefresh",
           "VoiceCreate", "VoiceCorrection", "VoiceNote"}


def normalize(value):
    if isinstance(value, list):
        return [normalize(item) for item in value]
    if not isinstance(value, dict):
        return value
    result = {key: normalize(item) for key, item in value.items()
              if key not in {"title", "description", "default", "examples"}}
    if "$ref" in result:
        result["$ref"] = result["$ref"].split("/")[-1]
    if isinstance(result.get("type"), list):
        result["anyOf"] = [{"type": kind} for kind in result.pop("type")]
    if "oneOf" in result:
        result["anyOf"] = result.pop("oneOf")
    for key in ("required", "enum"):
        if isinstance(result.get(key), list):
            result[key] = sorted(result[key])
    if "anyOf" in result:
        result["anyOf"] = sorted(result["anyOf"], key=lambda item: json.dumps(item, sort_keys=True))
    return result


def test_agent_dtos_match_authoritative_openapi():
    generated = app.openapi()["components"]["schemas"]
    for name in SCHEMAS:
        assert normalize(generated[name]) == normalize(CONTRACT["components"]["schemas"][name]), name


def test_assessment_operations_match_contract():
    generated = app.openapi()
    found = set()
    for path, methods in CONTRACT["paths"].items():
        for method, expected in methods.items():
            if expected["operationId"] not in IMPLEMENTED:
                continue
            found.add(expected["operationId"])
            actual = generated["paths"][f"/api{path}"][method]
            assert actual["operationId"] == expected["operationId"]
            assert actual["security"]
            def parameters(operation):
                return sorted([normalize({**parameter, "required": parameter.get("required", False)})
                               for parameter in operation.get("parameters", [])], key=lambda item: (item["in"], item["name"]))
            assert parameters(actual) == parameters(expected)
            assert normalize(actual.get("requestBody")) == normalize(expected.get("requestBody"))
            for status, response in expected["responses"].items():
                if "$ref" in response:
                    response = CONTRACT["components"]["responses"][response["$ref"].split("/")[-1]]
                assert normalize(actual["responses"][status]["content"]) == normalize(response["content"])
    assert found == IMPLEMENTED
