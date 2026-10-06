# Developer guide

This guide runs Placeholder AI and its retained SiteMesh foundations. Read the [product specification](PRODUCT_SPEC.md) for the intended workflow and [current status](../STATUS.md) for gaps.

## Local setup

Requirements: Python 3.11+, Node 22+ and uv (or an equivalent Python virtual environment).

From the repository root, start the backend:

```bash
cd backend
uv venv
uv pip install -e ".[dev]"
```

If `backend/.env` does not exist, copy `backend/.env.example` to it. Set a local `JWT_SECRET` using the generation command in that example. Keep existing configuration and never commit secrets.

Then, from `backend/`:

```bash
.venv/bin/alembic upgrade head
.venv/bin/python -m app.seed
.venv/bin/uvicorn app.main:app --reload
```

API documentation: `http://localhost:8000/docs`. SQLite defaults to `backend/data/app.db`; uploaded/generated files default to `backend/storage/`.

In a second terminal, from the repository root:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies API calls to port 8000.

## Application surfaces

- **Agent Isle:** a floating bottom-right contextual chatbot opens against the current building canvas and panel without login. It uses the explicitly untrusted local screen context; an optional connection adds bounded server facts and citations. It has no write authority.
- **`/agent`:** authenticated assessments, recorded voice and text helpers remain available as the detailed agent workflow.

- **`/`:** one building-centered website with optional right-side panels. It runs without backend/sign-in and stores testing records locally.
- **`/?panel=record&work=ISS-031`:** evidence/review/timeline for a component-linked record, focused on the shared model.
- **`/?panel=issues`, `/?panel=activity`, `/?panel=team`, `/?panel=project`, `/?panel=capture`:** contextual workflows; no separate model pages.
- **Old page and `/demo/...` bookmarks:** normalize to root panel state, preserving relevant work IDs/fragments. Private-project/QR/embed bookmarks no longer mount the retired UI. See [the UI handoff](BUILDING_WORKSPACE.md) and [frontend routes](../web/README.md).

Seeded accounts use `demo-password` unless `DEMO_PASSWORD` is configured.

| Account | Role |
|---|---|
| pm@example.com | Project manager |
| owner@example.com | Owner |
| plumber@example.com | Plumbing trade |
| electrician@example.com | Electrical trade |
| inspector@example.com | Read-only viewer |

The seed includes Maple Court generated from DXF samples and a buildingSMART IFC sample project. Demo credentials and data are for local development.

For a detailed architectural/MEP sample, run `VISION_MODE=off .venv/bin/python -m app.bim.audit --download` from `backend/`, then `.venv/bin/python -m app.seed --duplex` after migrations. This adds **Duplex Apartment — detailed BIM** to the connected workspace. The first tessellation takes a few minutes; subsequent seed runs reuse the project. Migration `0007` adds issue/model-version provenance. Existing unversioned pins retain their unknown revision rather than receiving invented provenance.

## Configuration

Backend configuration is defined in [config.py](../backend/app/config.py). When running from `backend/`, settings load its `.env`.

| Variable | Current behavior |
|---|---|
| APP_ENV | dev by default; prod requires JWT_SECRET |
| DATABASE_URL | SQLite default; PostgreSQL supported |
| JWT_SECRET | Set a persistent local secret; otherwise dev uses an ephemeral one |
| STORAGE_DIR | Local storage root, default ./storage |
| JOBS_MODE | thread normally; inline in tests |
| CORS_ORIGINS | JSON array, default includes localhost:5173 |
| GEMINI_API_KEY | Credentials for real vision calls |
| VISION_MODE | auto, gemini, off or mock |
| VISION_MODEL | `gemini-3.8-flash` default; verify this account's access before a live run |
| VISION_EFFORT | Thinking level for legacy vision and the new agent; low, medium or high; default high |
| AGENT_ENABLED | false by default; true isolates new uploads from legacy auto-approval and enables the review-only agent |
| AGENT_TIMEOUT_SECONDS | Provider timeout, 1–300 seconds, default 60 |
| AGENT_TEXT_MODEL | `gemini-3.5-flash-lite`, for editable suggestions and selecting daily-briefing facts |
| AGENT_TEXT_TIMEOUT_SECONDS | 1–60 seconds, default 15 |
| AGENT_VOICE_MODEL | `gemini-3.5-transcribe`, recorded files via Interactions; live streaming is not implemented |
| AGENT_VOICE_TIMEOUT_SECONDS | 1–300 seconds, default 120; at most two total leased-job attempts |

Use `VISION_MODE=off` for manual review without analysis or `mock` to exercise the pipeline without live inference. Mock returns uncertain results; it does not demonstrate detection accuracy.

The legacy project-level auto-approval setting is not the new scoped completion policy. Do not enable it as a shortcut for implementing the new product.

## Placeholder AI agent demo

Use the **agent worktree**, `Anything-works-agent`, branch `codex/design-iteration-2`. The original `Anything-works/dev` worktree is separate and does not contain this implementation. Install this worktree's backend/web dependencies as above. Reusing the old Python environment requires `PYTHONPATH=.` from this worktree's `backend/`; its editable installation otherwise resolves the original code.

For an isolated local demo, use a separate database and storage so existing development records remain untouched. From this worktree's `backend/`, with its `.venv` installed and a persistent `JWT_SECRET` configured:

```bash
export DATABASE_URL=sqlite:///./data/agent-demo.db
export STORAGE_DIR=./storage-agent-demo
export AGENT_ENABLED=true
.venv/bin/alembic upgrade head
VISION_MODE=off .venv/bin/python -m app.seed
VISION_MODE=gemini .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010
```

Configure `GEMINI_API_KEY` locally for live assessment; never put it in chat/Git. Check the adapter from `backend/`:

For the two-person demo, set `VISION_MODEL=gemini-3.8-flash` and `VISION_EFFORT=medium` in `backend/.env`. This is a stable multimodal model with structured-output support. Medium is an initial latency/cost choice, not a field-accuracy result; evaluate it with representative photos before changing the review policy. The provider records model identity and token usage, including thinking tokens. See [the model decision](decisions/0001-placeholder-agent-harness.md#gemini-selection-for-the-two-person-demo).

```bash
.venv/bin/python ../scripts/check_agent_provider.py --check
.venv/bin/python ../scripts/check_agent_provider.py
```

`--check` validates only local configuration/DNS. The second command makes one live structured-output request with empty work scope, sends no project data and writes no progress. It distinguishes typed-output connectivity from field accuracy. If the configured model is unavailable, `--list-models` lists accessible models; choose `VISION_MODEL` from the account's actual capabilities. Failure output excludes raw SDK errors and credentials. `VISION_MODEL` must be a model available to that account and support typed image responses. Missing/unavailable provider access creates a saved failure and leaves work incomplete. `off`/`mock` cannot produce a live agent verdict. The legacy project auto-approval toggle does not authorize the new check.

In a second terminal, from this worktree's `web/`:

```bash
npm install
API_URL=http://127.0.0.1:8010 npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://127.0.0.1:5174/`. Agent Isle is the floating button in the bottom-right of the building workspace; open it to ask about the visible project without logging in. Use “Connect project records” only when you need authenticated issues, model status and citations. For the detailed workflow, open `http://127.0.0.1:5174/agent`. Use two separate browser profiles (or one normal and one private window): `plumber@example.com` for the worker, `pm@example.com` for the PM. **Fresh seed accounts** default to `demo-password` unless `DEMO_PASSWORD` was set at creation. Seed does not reset passwords of existing accounts.

1. Both identities select **Maple Court (demo)**, which the seed converts from explicitly sample DXF drawings. The imported IFC-only sample projects have no approved drawing extraction and deliberately abstain.
2. Worker selects an allowed room, plumbing components, photos and a note, then submits. Intake is saved before assessment; a failed create request can retry without uploading photos again. This view requires connectivity; it does not implement a new offline queue.
3. PM opens the saved run/pin, inspects photos, cited sources and limitations, optionally previews the drawing, enters a reason and accepts/rejects the exact proposal. Accepted work records human completion, never AI inspection certification.
4. Worker sees the saved decision and model status after polling. Refreshing/restarting keeps assessment records. Cancel/retry and stale references are guarded server-side.

Existing converted projects created before migration `0008` have no snapshots. Create a new conversion through `POST /api/projects/{project_id}/conversions`, then approve its returned version through `POST /api/models/{version_id}/approve`, using authorized existing drawing/setup APIs. Do not fabricate historical snapshot approval or modify a production project for a demo.

The root Home/Logs remain the public sample workspace; their shared authenticated projections are remaining BEAV-003 work. A drawing preview is the current rendered extraction, while acceptance validates that the source still matches the saved revision. Agent Isle is read-only and session-only: it cannot approve, assign, update progress, send messages or call anyone. Recorded voice and text helpers run at `/agent`; LiDAR/calendar/MCP/phone and live streaming remain unimplemented. Provider test doubles exercise workflow correctness only, not real-site accuracy.

### Teammate test walkthrough

Start the API and Vite using the commands above, with `VISION_MODE=gemini` and your key in this worktree's `backend/.env`. Keep both terminals running. The correct page is **`http://127.0.0.1:5174/agent`**. If a port is occupied, identify its listener with `lsof -nP -iTCP:8010 -sTCP:LISTEN` or the equivalent for 5174; choose another port and update `API_URL` consistently. There is no reference server.

1. Open a normal browser window as `plumber@example.com` and a private window as `pm@example.com`; fresh seeded accounts use `demo-password`. Select **Maple Court** in both. This sample has approved converted drawing context; an IFC-only import without that binding correctly abstains from photo checks.
2. In the worker session select a permitted room and Plumbing. Under **Voice updates**, click **Record voice**, allow microphone access, say a short update such as “The sink is positioned in the bathroom; the connections are still pending,” then **Stop recording** and **Transcribe recording**. Alternatively upload a real WAV/MP3/M4A/Ogg/WebM recording up to 8 MiB. Expected: saved queued/running → completed transcript, original playback and provider name. `getUserMedia` needs localhost or HTTPS; a plain HTTP LAN address may disable recording. Saved-file uploads still work.
3. Correct one word in **Transcript**, click **Save transcript correction**, then open **Original transcript**. The original text must remain. Click **Use transcript in update**; the daily note changes only on this explicit click. In the PM window, select the same file in **Saved voice updates**: its corrected text/audio are shared, and PM cannot overwrite the worker's transcript. Refresh the browser and select it again to prove persistence.
4. Choose relevant **Work components**, enter a short factual note (up to 2,000 characters for assistance), then **Suggest update**. Select Update wording, Work components or Evidence request. Expected: editable suggestions with explanations; **Use suggestion** explicitly applies text or component selection. Changing the draft while a request is pending hides its old response. Suggestions never assign people or complete work.
5. Attach real photos of the selected work and **Submit for assessment**. Review the result in the PM session. Missing/irrelevant evidence may correctly yield insufficient evidence; acceptance is always a human decision. Do not describe seeded geometry or an unrelated photo as successful construction inspection.
6. In either session choose the local date/timezone at the top and **Refresh AI briefing**. Expected: a saved briefing citing event numbers and links to source assessments where available. The model chooses important saved facts; the server renders actual statuses/times. New updates make the previous briefing stale and require refresh; reading the page does not generate it automatically. Each identity gets a separately scoped briefing.
7. Stop the API briefly and try a request: the UI must show failure, not fabricate a transcript or result. Provider errors retain received audio and leave work incomplete. Restart the API; persisted queued/expired jobs recover under the attempt bound. Check `/docs` for the voice, suggestion and summary operations.

For provider 401/403 check key/account permissions; 404 means that configured model is not available to this account; 429 means quota/rate limiting. This sandbox could not verify the key or run browser microphone/WebGL checks. A working local UI plus successful provider output in your terminal is the live acceptance step, separate from the automated tests.

Regenerate web agent DTOs from the contract-tested schemas after approved changes:

```bash
.venv/bin/python ../scripts/generate_agent_types.py
.venv/bin/pytest tests/test_agent.py tests/test_agent_helpers.py tests/test_agent_contract.py tests/test_agent_provider.py tests/test_agent_migration.py -q
```

## Docker

From the repository root, configure a root `.env` containing a locally generated `JWT_SECRET`. Compose reads this root file for the API service; merely setting a shell variable does not replace the service's environment configuration.

```bash
docker compose up --build -d
docker compose exec api python -m app.seed
```

Web: `http://localhost:8080`. API docs: `http://localhost:8000/docs`. Compose includes PostgreSQL and persistent database/storage volumes.

Optional `POSTGRES_PASSWORD` configures the local database. Behind a TLS-intercepting proxy, `EXTRA_CA_FILE` can point to the required CA bundle. See [docker-compose.yml](../docker-compose.yml). These are existing commands, not a production deployment recipe.

## Checks for implementation work

From `backend/`:

```bash
.venv/bin/pytest -q
.venv/bin/ruff check app tests
```

For PostgreSQL testing, install the optional driver with `uv pip install -e ".[dev,postgres]"` and point `TEST_DATABASE_URL` at a dedicated disposable test database. Do not use a real project database.

From `web/`:

```bash
npm test
npm run lint
npm run build
npm run e2e
```

Public-website end-to-end smoke tests require Playwright browsers and start Vite on port 5174; no backend or database reset is needed. The former connected-app tests are archived under `web/e2e/legacy` and excluded by configuration. Screenshots/results go to `web/e2e/.results/`. These browser tests were not run under the saved browser-access restriction.

Do not repeat historical test counts as current results. Report the commands actually run with a change.

## Evaluation harnesses

From `backend/`:

```bash
.venv/bin/python -m app.conversion.eval_conversion ../samples/dxf --csv ../samples/dxf/RESULTS.csv
.venv/bin/python -m app.conversion.eval_conversion ../samples/pdf
.venv/bin/python -m app.vision.eval_vision ../samples/photos --mock
```

Live photo evaluation uses provider credentials and may incur API cost. Existing result files can change when running evaluation.

The conversion datasets are generated. The existing vision harness checks element presence/absence/visibility; it needs extension for the new plan-discrepancy and completion tasks. See [photo dataset instructions](../samples/photos/README.md). A working harness is not evidence of real-site performance.

## Repository map

| Path | Responsibility |
|---|---|
| backend/app/api | REST endpoints |
| backend/app/services | Domain rules, progress, events, issues and history |
| backend/app/models | Persistence models and event guards |
| backend/app/rbac.py | Central permissions and scope |
| backend/app/jobs.py | Database-backed job processing |
| backend/app/bim | IFC import and GLB generation |
| backend/app/conversion | Drawing interpretation, review and model generation |
| backend/app/vision | Model client, prompt and evaluation |
| backend/migrations | Database migrations |
| web/src/studio | Standalone interactive local demo |
| web/src/pages | Connected office workspace |
| web/src/field | Field capture and offline queue |
| web/src/viewer | 3D viewer and integration API |
| samples | Attribution, generated plans and evaluation examples |

See [CLAUDE.md](../CLAUDE.md) for repository implementation invariants.
