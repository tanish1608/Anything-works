# SiteMesh

3D construction coordination for small builders:
- turns 2D drawings (DXF, vector PDF) into a 3D model;
- gives each trade its own layer;
- pins issues to the model;
- tracks daily progress from photos, with AI checks and PM approval;
- keeps a git-like history of every change.

> SiteMesh is a working name. See `PLAN.md` for the architecture, decisions and build notes.

## Quick start (local, no Docker)

Requirements: Python 3.11+, Node 22+, and [uv](https://docs.astral.sh/uv/) (or plain `pip`).

```bash
# 1. Backend (SQLite by default; data goes to backend/data/, files to backend/storage/)
cd backend
uv venv && uv pip install -e ".[dev]"        # or: python -m venv .venv && .venv/bin/pip install -e ".[dev]"
cp .env.example .env                          # then set JWT_SECRET (see the comment in the file)
.venv/bin/alembic upgrade head
.venv/bin/python -m app.seed                  # demo projects and users (about 10 s: it runs the real converter)
.venv/bin/uvicorn app.main:app --reload       # http://localhost:8000/docs

# 2. Web app (in a second terminal)
cd web
npm install
npm run dev                                   # http://localhost:5173 (proxies /api to :8000)
```

### Demo logins (after `python -m app.seed`)

All demo accounts use the password `demo-password`.

| Email | Role | Try this |
|---|---|---|
| pm@example.com | Project manager | **Maple Court**: 3D model, Drawings → review editor, Progress → approve, History → replay |
| plumber@example.com | Trade (plumbing; baths + living/kitchens only) | **Field app** (top bar) → Maple Court → UNIT 101 BATH → tick items, add photos, submit (works offline) |
| owner@example.com | Owner | Everything, including switching on AI auto-approval (Progress page) |
| electrician@example.com | Trade (electrical) | Sees only zones and layers for their trade |
| inspector@example.com | Viewer | Read-only: model, evidence, history |

The two demo projects:
- **Maple Court (demo)**: a two-storey duplex built by the real pipeline from `samples/dxf` (DXF → detection → IFC → approved model).
- **Sample House**: the buildingSMART IFC sample (CC BY 4.0).

## Full stack with Docker (Postgres)

```bash
JWT_SECRET=$(python3 -c "import secrets;print(secrets.token_urlsafe(48))") docker compose up --build -d
docker compose exec api python -m app.seed
# web: http://localhost:8080   API docs: http://localhost:8000/docs
```

Behind a TLS-intercepting corporate proxy, add `EXTRA_CA_FILE=/path/to/ca.pem` to the build so pip and npm trust it.

## AI photo checks (M5)

Photo analysis uses Google Gemini and switches on when `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) is set. Otherwise uploads simply go to manual PM review.

| Variable | Default | What it does |
|---|---|---|
| `VISION_MODE` | `auto` | `auto` (on when credentials exist), `gemini`, `off`, or `mock` |
| `VISION_MODEL` | `gemini-3.8-flash` | Any image-capable Gemini model (e.g. `gemini-3.1-pro-preview`) |
| `VISION_EFFORT` | `high` | Gemini thinking level: `low`, `medium` or `high` |

**How a check works:**
1. Each upload sends the photos, the zone's reference render (a snapshot from the field app's 3D view) and the expected elements.
2. Structured outputs force a strict JSON verdict per element.
3. Verdicts map as follows:
   - **installed** at or above the project threshold → amber. It turns green after PM approval, or immediately if an owner enabled auto-approve.
   - **missing** → keeps its colour and is flagged "possibly missed"; the worker and PM are notified.
   - **not visible / uncertain** → flagged "retake photo".
4. Anyone can override a verdict with a reason.

**Evaluation:** `samples/photos/README.md` explains the labeled-set layout. Run:

```bash
cd backend && .venv/bin/python -m app.vision.eval_vision ../samples/photos   # precision/recall per element type → RESULTS.csv
```

## Conversion (M3, M7)

- **DXF:** upload on the Drawings page, review it, then build a draft and approve it in 3D. DWG isn't supported; export to DXF first.
- **Vector PDF:** architectural plans only for now. The scale comes from the title-block note.
- **Evaluation:**

```bash
cd backend
.venv/bin/python -m app.conversion.eval_conversion ../samples/dxf --csv ../samples/dxf/RESULTS.csv
.venv/bin/python -m app.conversion.eval_conversion ../samples/pdf
.venv/bin/python -m app.conversion.eval_conversion ../samples/dxf --db   # + manual-correction counts from real uploads
```

## Tests

```bash
cd backend && .venv/bin/pytest -q && .venv/bin/ruff check app tests          # 122 tests (SQLite)
TEST_DATABASE_URL=postgresql+psycopg://postgres:pg@localhost:5433/sitemesh_test .venv/bin/pytest -q   # same suite on Postgres
cd web && npm test && npm run lint && npm run build                           # unit tests
cd web && npx playwright test                                                 # end-to-end, starts its own backend + dev server
```

To run a throwaway Postgres for the second command:
`docker run -d --name pgtest -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=sitemesh_test -p 5433:5432 postgres:16-alpine`

## Configuration

All configuration comes from environment variables (or `backend/.env`). Secrets never go in code.

| Variable | Default | Notes |
|---|---|---|
| `APP_ENV` | `dev` | `prod` refuses to start without `JWT_SECRET` |
| `DATABASE_URL` | `sqlite:///./data/app.db` | e.g. `postgresql+psycopg://user:pass@host/db` |
| `JWT_SECRET` | none | Required in prod |
| `STORAGE_DIR` | `./storage` | Uploaded drawings, photos, generated IFC and GLB |
| `JOBS_MODE` | `thread` | Background worker in the API process (`inline` is used by tests) |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | JSON list |
| `GEMINI_API_KEY`, `VISION_*` | | See "AI photo checks" above |

## Repo layout

```
backend/app/
  api/          REST routers (auth, projects, structure, models, issues, drawings, progress, history)
  bim/          IFC import (IfcOpenShell) → elements, zones, per-discipline GLB
  conversion/   DXF/PDF reader, wall/opening/room/MEP detection, review edits, IFC writer, SVG, eval
  vision/       photo-check prompt, client, eval harness
  services/     domain rules (events, progress/evidence, history, notifications)
web/src/
  viewer/       three.js viewer with a command/event API + postMessage bridge (embeddable)
  field/        mobile field app, offline upload queue (IndexedDB)
  pages/        office app
samples/        IFC (buildingSMART), generated DXF/PDF with ground truth, labeled-photo layout
```

## Milestone status

| Milestone | Status |
|---|---|
| M0 Foundations | ✅ |
| M1 Viewer | ✅ |
| M2 Issues | ✅ |
| M3 DXF → 3D conversion | ✅ |
| M4 Daily progress (manual) | ✅ |
| M5 Daily progress (AI-assisted) | ✅ (needs an API key and a real photo set to measure) |
| M6 History | ✅ (branch UI partial) |
| M7 Vector PDF | ✅ architectural; raster scoped in PLAN.md |
