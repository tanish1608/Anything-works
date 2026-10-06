"""Check the configured Gemini adapter without uploading project data or changing progress."""
import argparse
import os
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check local configuration and DNS without a model request")
    parser.add_argument("--list-models", action="store_true", help="List models accessible to this key without assessing work")
    args = parser.parse_args()
    os.chdir(ROOT / "backend")
    sys.path.insert(0, str(ROOT / "backend"))
    from app.agent import provider
    from app.config import get_settings
    from app.vision.client import mode

    settings = get_settings()
    if not settings.gemini_api_key.strip():
        print("Missing GEMINI_API_KEY in backend/.env; never paste credentials into logs/chat.")
        return 2
    print(f"Configured model: {settings.vision_model}; key present (not printed).")
    if mode() != "gemini":
        print("Set VISION_MODE=gemini (or auto with credentials) for a live provider check.")
        return 2
    try:
        socket.getaddrinfo("generativelanguage.googleapis.com", 443)
    except OSError:
        print("Gemini DNS is unavailable here. Run this command from a terminal with outbound HTTPS access.")
        return 2
    if args.check:
        print("Local configuration/DNS check passed. Credentials and inference are not yet verified.")
        return 0
    try:
        if args.list_models:
            from google import genai
            from google.genai import types
            options = types.HttpOptions(timeout=settings.agent_timeout_seconds * 1000,
                                        retry_options=types.HttpRetryOptions(attempts=1))
            with genai.Client(api_key=settings.gemini_api_key, http_options=options) as client:
                for model in client.models.list():
                    print(model.name)
            return 0
        print("Sending one live typed-output smoke request; no project photos/records are included.")
        result, usage = provider.assess({"elements": [], "sources": [], "photos": [],
                                        "note": "Provider connectivity check. There is no construction work to assess."}, [])
        if result.observations:
            print("Provider invented observations for an empty work scope; smoke check failed.")
            return 1
        print(f"Live provider smoke passed: {usage['model']}; input tokens={usage['input_tokens']}; output tokens={usage['output_tokens']}.")
        print("This verifies connectivity/typed output only, not photo assessment quality or field accuracy.")
        return 0
    except Exception as exc:  # noqa: BLE001 - SDK errors may contain credential URLs/private payloads
        # SDK errors can include credential URLs/private payloads. Only a numeric status is public.
        code = getattr(exc, "code", None)
        if code in (401, 403):
            print("Provider denied access. Check the key, API permissions and account configuration.")
        elif code == 404:
            print("Configured model is unavailable. Use --list-models, then set VISION_MODEL in backend/.env.")
        elif code == 429:
            print("Provider quota/rate limit reached. Check this account's quota before retrying.")
        else:
            print("Provider smoke failed. Check outbound HTTPS and model/account configuration; no work was assessed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
