# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

SiteMesh (working name): 3D construction coordination for small builders. It converts 2D drawings (DXF, vector PDF) into an IFC/3D model, scopes layers per trade, pins issues to elements, tracks progress from photos (Gemini vision checks with PM approval), and keeps git-like model history. `PLAN.md` has the architecture, data model and decisions log (§8); `STATUS.md` lists known weak spots. Read them before making design-level changes.

## Working agreement (from the product brief)

- Work one milestone or feature at a time. When one is done, stop and report what was built, how to run it, what's tested and what's shaky, then wait for a go-ahead before starting the next.
- If a request is technically a bad idea, say so and propose a better option rather than silently following it. Record agreed deviations in `PLAN.md` (§1, §8 and §9 already list several: web PWA instead of Flutter, SQLite by default, DXF only with no DWG, pdfminer.six instead of PyMuPDF, a DB job queue instead of Redis, server-side GLB instead of `@thatopen/components`).
- Make small commits, write tests alongside the code, and keep `README.md` setup steps working.
- The product is inspired by Revizto. Keep it original: don't copy Revizto's branding, UI assets or code.
- Out of scope: ERP, inventory, payments, accounting, lender draws and warranty. Leave room for them in the data model (attach to `Element`, `Zone` or `Project`), but don't build them.

Non-negotiables. Every change must preserve these:
1. No element turns green without linked photo evidence.
2. Every change is logged in the event history.
3. Field upload works offline.
4. Conversion always goes through human review before it's live.
5. Conversion and photo analysis each keep an evaluation script with numbers that can be tracked.
6. Secrets come from environment variables, never from code.

Accuracy rule for photo checks: a false green is far worse than a false gray, so tune for precision over recall.

## Commands

Backend (`backend/`, Python 3.11+, uses a local `.venv`):

```bash
uv venv && uv pip install -e ".[dev]"          # add ,postgres for psycopg
cp .env.example .env                            # set JWT_SECRET
.venv/bin/alembic upgrade head
.venv/bin/python -m app.seed                    # demo projects/users (runs the real converter, ~10 s); password: demo-password
.venv/bin/uvicorn app.main:app --reload         # http://localhost:8000/docs

.venv/bin/pytest -q                             # full suite on SQLite
.venv/bin/pytest tests/test_progress.py::test_name -q   # single test
.venv/bin/ruff check app tests                  # lint (CI runs this)
TEST_DATABASE_URL=postgresql+psycopg://postgres:pg@localhost:5433/sitemesh_test .venv/bin/pytest -q   # same suite on Postgres
```

Throwaway Postgres for that: `docker run -d --name pgtest -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=sitemesh_test -p 5433:5432 postgres:16-alpine`. CI runs the backend suite on both SQLite and Postgres, so schema/queries must work on both.

Web (`web/`, Node 22):

```bash
npm install
npm run dev                    # http://localhost:5173, proxies /api to :8000
npm test                       # vitest (src/test/)
npx vitest run src/test/replay.test.ts   # single test file
npm run lint                   # oxlint
npm run build                  # tsc -b + vite build (type checking happens here)
npx playwright test            # e2e; starts its own backend on :8001 (seeded SQLite in /tmp) and vite on :5174
```

E2E needs `backend/.venv` to exist. Screenshots land in `web/e2e/.results/`.

Evaluation harnesses (run from `backend/`):

```bash
.venv/bin/python -m app.conversion.eval_conversion ../samples/dxf --csv ../samples/dxf/RESULTS.csv
.venv/bin/python -m app.conversion.eval_conversion ../samples/pdf
.venv/bin/python -m app.vision.eval_vision ../samples/photos      # --mock without an API key
```

Full stack: `JWT_SECRET=... docker compose up --build -d && docker compose exec api python -m app.seed` (web :8080, API :8000, Postgres).

## Architecture

**Backend (FastAPI + SQLAlchemy 2 + Alembic).** `app/api/` routers are thin; domain rules live in `app/services/`. Cross-cutting invariants:

- **RBAC lives only in `app/rbac.py`**: a role → `Perm` matrix (owner/pm/trade/viewer) plus `require(db, project_id, user_id, perm)`. Trade members are further scoped by `ProjectMember.trades` and optional `zone_ids`. That scoping applies to queries *and* file access (a trade never downloads another discipline's GLB). Don't put permission checks anywhere else.
- **Append-only event log.** Every service mutation calls `services/events.record(...)` in the same transaction as the change. `Event` rows can't be updated or deleted: DB triggers block it (`events_no_update` / `events_no_delete`, installed by `install_event_guards` in `app/models/__init__.py` and by the migrations). Activity feed, timeline replay and status history all come from events.
- **No green without evidence.** `services/progress.py` raises `EvidenceRequired` if an element is set to `done` without a verification linked to an upload that has photos. Tests enforce this.
- **Status precedence** in the UI: red (open issue) > amber (needs review) > green (done) > discipline default.
- **Versioning.** `ModelVersion` is a commit (`parent_id`, `merge_parent_id`, `branch`, draft/approved/merged/rejected). `Element` is identity only, with stable UUIDs that are never deleted. `ElementRevision` holds per-version geometry/props. Element *status* is per physical element, not per version. A changed or moved element that was `done` is reset to `needs_review` and flagged. Diff/replay logic is in `services/history.py`.
- **Jobs** (`app/jobs.py`): a DB-backed job table instead of Redis. Handlers register with `@jobs.handler("kind")` (`ifc_import`, `sheet_detect`, `model_build`, `photo_analysis`) and are enqueued with `jobs.enqueue(...)`; they run after the caller commits. `JOBS_MODE=thread` starts a worker thread in the API process. Tests force `inline` (see `tests/conftest.py`).
- **Storage** goes through the `Storage` interface in `app/storage.py` (local FS under `STORAGE_DIR`).
- **Config** is pydantic-settings in `app/config.py`, from env or `backend/.env`. `APP_ENV=prod` refuses to start without `JWT_SECRET`.

**Conversion pipeline** (`app/conversion/`): `reader.py` (ezdxf) or `pdf.py` (pdfminer.six; PyMuPDF is deliberately avoided for AGPL reasons) produce a `RawDrawing`. `layers.py` maps layer names to roles. `detect.py` orchestrates `walls.py`, openings, `rooms.py` (shapely polygonize → zones) and `mep.py` into a plan dict. `edits.py` applies review-editor corrections. `ifc_writer.py` writes IFC (IfcOpenShell) with our element UUID in a property set. `svg.py` renders the sheet for the 2D editor. `services/conversion.py` wires this into jobs and `ModelVersion`s. Element IDs come from hashes of rounded geometry so they stay stable across re-runs. Never invent pipe runs that aren't drawn: report them as missing so the PM can trace them.

**BIM** (`app/bim/`): IFC import → elements and zones, plus one GLB per discipline (node name = element UUID) generated server-side. The browser loads GLBs, not IFC. IFC stays the system of record per version.

**Vision** (`app/vision/`): Google Gemini (`google-genai` SDK, `GEMINI_API_KEY`) with structured JSON output per element (`installed` / `missing` / `not_visible` / `uncertain`), mapped to statuses and flags in `services/photos.py` / `vision_jobs.py`. Controlled by `VISION_MODE` (`auto|gemini|off|mock`), `VISION_MODEL`, `VISION_EFFORT` (thinking level). Default approval mode is PM approval. Auto-approve is an opt-in project setting.

**Migrations:** `backend/migrations/versions/` are numbered (`0001_…`). Add a new one for any model change. `tests/test_migrations.py` checks migrations against the models (SQLite only).

**Web (React 19 + TS + Vite PWA, TanStack Query, three.js).**
- `src/viewer/`: `SiteViewer` is an isolated three.js module with a command/event API (`setColors`, `select`, `flyTo`, `setSection`, `setWalkMode`, snapshot, …) and a postMessage `bridge.ts`, so it can be embedded (`EmbedViewerPage`) or wrapped natively later. Keep it independent of React pages.
- `src/field/`: the mobile field app. Uploads queue offline in IndexedDB (`queue.ts`) and sync on open, `online` and a timer (no Background Sync on iOS).
- `src/pages/`: office app. `src/api/client.ts` handles auth tokens (JWT access + rotating refresh). `src/lib/replay.ts` folds events for the timeline.
- The service worker (workbox in `vite.config.ts`) caches GLBs cache-first and GET `/api/*` network-first. It only exists in production builds.

## Samples

`samples/dxf` and `samples/pdf` are **generated** (`generate.py`, `generate_pdf.py`) with ground truth in `expected.json`. Perfect eval scores there only show the pipeline works and catch regressions; they don't measure accuracy on real drawings. `samples/ifc` holds buildingSMART samples (CC BY 4.0). Tests reference samples via `SAMPLES` in `tests/conftest.py`.
