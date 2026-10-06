"""Run this worktree's API and web client with a verified chat route and matching ports."""
import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
CHAT_ROUTE = "/api/agent/public-chat"


def backend_python(root: Path) -> Path:
    candidates = [root / "backend/.venv/bin/python", root.parent / "Anything-works/backend/.venv/bin/python"]
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate
    raise RuntimeError("Backend environment missing. Install dependencies using docs/DEVELOPMENT.md.")


def backend_environment(root: Path) -> dict[str, str]:
    return {**os.environ, "PYTHONPATH": str(root / "backend")}


def api_command(python: Path, root: Path, port: int) -> list[str]:
    return [str(python), "-m", "uvicorn", "app.main:app", "--app-dir", str(root / "backend"),
            "--host", "127.0.0.1", "--port", str(port), "--reload"]


def inspect_backend(python: Path, root: Path) -> dict:
    code = (
        "import json,app.main; from app.config import get_settings; from app.vision.client import mode; "
        "s=get_settings(); print(json.dumps({'source':app.main.__file__, "
        "'chat': '/api/agent/public-chat' in app.main.app.openapi()['paths'], "
        "'provider_configured':bool(s.gemini_api_key) and mode() == 'gemini'}))"
    )
    result = subprocess.run([str(python), "-c", code], cwd=root / "backend", env=backend_environment(root),
                            capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError("Backend import failed. Check this worktree's dependencies and backend/.env locally.")
    metadata = json.loads(result.stdout)
    if Path(metadata["source"]).resolve() != (root / "backend/app/main.py").resolve() or not metadata["chat"]:
        raise RuntimeError("Loaded backend does not match this worktree or lacks the chat route.")
    return metadata


def listeners(port: int) -> list[int]:
    result = subprocess.run(["lsof", "-nP", "-t", f"-iTCP:{port}", "-sTCP:LISTEN"], capture_output=True, text=True, check=False)
    if result.returncode not in (0, 1):
        raise RuntimeError(f"Cannot inspect listeners on port {port}.")
    return sorted({int(line) for line in result.stdout.splitlines() if line.strip()})


def owned_listeners(port: int, directory: Path) -> list[int]:
    pids = listeners(port)
    for pid in pids:
        result = subprocess.run(["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"], capture_output=True, text=True, check=False)
        cwd = [line[1:] for line in result.stdout.splitlines() if line.startswith("n")]
        if result.returncode or len(cwd) != 1 or Path(cwd[0]).resolve() != directory.resolve():
            raise RuntimeError(f"Port {port} belongs to another process (PID {pid}); leaving it untouched. Choose another port.")
    return pids


def prepare_ports(root: Path, api_port: int, web_port: int, restart: bool):
    # Validate every listener before stopping any, so unrelated apps cannot be terminated.
    groups = [(api_port, owned_listeners(api_port, root / "backend")),
              (web_port, owned_listeners(web_port, root / "web"))]
    if any(pids for _, pids in groups) and not restart:
        raise RuntimeError("This worktree already has servers running. Stop their terminals or use --restart.")
    for _, pids in groups:
        for pid in pids:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    deadline = time.monotonic() + 5
    while any(listeners(port) for port, _ in groups):
        if time.monotonic() >= deadline:
            raise RuntimeError("A listener did not stop. Stop its original terminal with Ctrl+C and retry.")
        time.sleep(0.1)


def verify_running_api(port: int):
    with urlopen(f"http://127.0.0.1:{port}/openapi.json", timeout=1) as response:
        schema = json.load(response)
    if CHAT_ROUTE not in schema.get("paths", {}):
        raise RuntimeError(f"The API on port {port} lacks {CHAT_ROUTE}; frontend startup stopped.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-port", type=int, default=8010)
    parser.add_argument("--web-port", type=int, default=5174)
    parser.add_argument("--web-host", choices=["127.0.0.1", "0.0.0.0"], default="127.0.0.1", help="Use 0.0.0.0 for phone testing on your local network")
    parser.add_argument("--restart", action="store_true", help="Stop only listeners owned by this worktree")
    parser.add_argument("--check", action="store_true", help="Check imports/configuration without stopping or starting servers")
    args = parser.parse_args()
    processes = []
    try:
        if not 1 <= args.api_port <= 65535 or not 1 <= args.web_port <= 65535 or args.api_port == args.web_port:
            raise RuntimeError("Choose two distinct ports between 1 and 65535.")
        python = backend_python(ROOT)
        metadata = inspect_backend(python, ROOT)
        print(f"Backend: {metadata['source']}\nChat route: registered", flush=True)
        print("Gemini configuration: " + ("present (live access not tested)" if metadata["provider_configured"]
              else "unavailable; check GEMINI_API_KEY and VISION_MODE in backend/.env"), flush=True)
        if args.check:
            return 0
        if not shutil.which("lsof") or not shutil.which("npm") or not (ROOT / "web/node_modules").is_dir():
            raise RuntimeError("Need lsof, npm and web dependencies. Follow docs/DEVELOPMENT.md.")
        prepare_ports(ROOT, args.api_port, args.web_port, args.restart)
        api = subprocess.Popen(api_command(python, ROOT, args.api_port), cwd=ROOT / "backend", env=backend_environment(ROOT), start_new_session=True)
        processes.append(api)
        deadline = time.monotonic() + 20
        while True:
            if api.poll() is not None:
                raise RuntimeError("API exited during startup; see its logs above.")
            try:
                verify_running_api(args.api_port)
                break
            except (URLError, TimeoutError, ConnectionError):
                if time.monotonic() >= deadline:
                    raise RuntimeError("API did not become reachable within 20 seconds.") from None
                time.sleep(0.2)
        api_url = f"http://127.0.0.1:{args.api_port}"
        web = subprocess.Popen(["npm", "run", "dev", "--", "--host", args.web_host, "--port", str(args.web_port), "--strictPort"],
                               cwd=ROOT / "web", env={**os.environ, "API_URL": api_url}, start_new_session=True)
        processes.append(web)
        print(f"Verified API chat route. Web: http://127.0.0.1:{args.web_port} · API: {api_url}/docs\nKeep this terminal open. Ctrl+C stops both.", flush=True)
        while all(process.poll() is None for process in processes):
            time.sleep(0.2)
        raise RuntimeError("A development server exited; see its logs above.")
    except KeyboardInterrupt:
        return 0
    except (RuntimeError, OSError, ValueError) as exc:
        print(f"Setup stopped: {exc}", file=sys.stderr)
        return 1
    finally:
        for process in reversed(processes):
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                continue
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()


if __name__ == "__main__":
    raise SystemExit(main())
