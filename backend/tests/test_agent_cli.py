import importlib.util
import sys
from pathlib import Path

import pytest

from app.agent import provider
from app.config import get_settings

SPEC = importlib.util.spec_from_file_location("agent_provider_cli", Path(__file__).resolve().parents[2] / "scripts/check_agent_provider.py")
cli = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cli)


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.chdir(Path(__file__).resolve().parents[1])
    monkeypatch.setattr(get_settings(), "gemini_api_key", "explicit-private-test-fixture")
    monkeypatch.setattr(get_settings(), "vision_mode", "gemini")
    monkeypatch.setattr(cli.socket, "getaddrinfo", lambda *args: [])


def test_configuration_check_never_calls_provider_or_prints_key(configured, monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["check_agent_provider.py", "--check"])
    monkeypatch.setattr(provider, "assess", lambda *args: pytest.fail("Configuration check cannot call a model"))
    assert cli.main() == 0
    output = capsys.readouterr().out
    assert "not yet verified" in output and "explicit-private-test-fixture" not in output


def test_provider_failure_is_redacted_and_returns_failure(configured, monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["check_agent_provider.py"])
    def failed(*args):
        raise ValueError("https://provider.invalid/?key=explicit-private-test-fixture private-photo-data")
    monkeypatch.setattr(provider, "assess", failed)
    assert cli.main() == 1
    output = capsys.readouterr().out
    assert "smoke failed" in output and "explicit-private-test-fixture" not in output and "private-photo-data" not in output
