# SiteMesh

3D construction coordination for small builders. It turns 2D drawings into a 3D model, gives each trade its own layer, pins issues to the model, and tracks progress from photos, with a full change history.

> SiteMesh is a working name. See `PLAN.md` for the architecture, milestones and decisions.

## Quick start (local, no Docker)

Requirements: Python 3.11+, Node 22+, and [uv](https://docs.astral.sh/uv/) (or plain `pip`).

```bash
# 1. Backend (SQLite by default; the database file goes to backend/data/app.db)
cd backend
uv venv && uv pip install -e ".[dev]"        # or: python -m venv .venv && .venv/bin/pip install -e ".[dev]"
cp .env.example .env                          # then set JWT_SECRET (see the comment in the file)
.venv/bin/alembic upgrade head                # create or upgrade the schema
.venv/bin/python -m app.seed                  # optional: demo project and users
.venv/bin/uvicorn app.main:app --reload       # http://localhost:8000/docs

# 2. Web app (in a second terminal)
cd web
npm install
npm run dev                                   # http://localhost:5173 (proxies /api to :8000)
```

### Demo logins (after `python -m app.seed`)

All demo accounts use the password `demo-password`, which you can override with `DEMO_PASSWORD`.

| Email | Role | What they see |
|---|---|---|
| owner@example.com | Owner | everything |
| pm@example.com | Project manager | everything; can edit |
| plumber@example.com | Trade (plumbing) | only kitchens and bathrooms |
| electrician@example.com | Trade (electrical) | all zones, electrical only |
| inspector@example.com | Viewer | read-only |

## Full stack with Docker

```bash
cp backend/.env.example .env      # set JWT_SECRET
docker compose up --build         # web: http://localhost:8080, API: http://localhost:8000/docs
docker compose exec api python -m app.seed
```

The compose stack runs **Postgres**. Local dev defaults to **SQLite**. The schema is the same, and CI runs the tests on both.

## Tests

```bash
cd backend && .venv/bin/pytest -q                 # SQLite
TEST_DATABASE_URL=postgresql+psycopg://postgres:pg@localhost:5433/sitemesh_test .venv/bin/pytest -q   # Postgres
.venv/bin/ruff check app tests

cd web && npm test && npm run lint && npm run build
```

To run a throwaway Postgres for the second command:
`docker run -d --name pgtest -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=sitemesh_test -p 5433:5432 postgres:16-alpine`

## Configuration

All configuration comes from environment variables, or `backend/.env`. Secrets never go in code.

| Variable | Default | Notes |
|---|---|---|
| `APP_ENV` | `dev` | `prod` refuses to start without `JWT_SECRET` |
| `DATABASE_URL` | `sqlite:///./data/app.db` | e.g. `postgresql+psycopg://user:pass@host/db` |
| `JWT_SECRET` | *(none)* | Required in prod. In dev, if it's unset, an ephemeral secret is used and logins reset on restart |
| `ACCESS_TOKEN_MINUTES` / `REFRESH_TOKEN_DAYS` | 15 / 30 | |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | JSON list |

## Repo layout

```
backend/   FastAPI app, SQLAlchemy models, Alembic migrations, tests
web/       React + TypeScript (Vite) web app
samples/   sample models, drawings and photo sets (with sources and licences)
PLAN.md    architecture, data model, milestones and decisions
```

## Milestone status

| Milestone | Status |
|---|---|
| M0 Foundations | ✅ done |
| M1 Viewer | ⏳ |
| M2 Issues | ⏳ |
| M3 DXF → 3D conversion | ⏳ |
| M4 Daily progress (manual) | ⏳ |
| M5 Daily progress (AI-assisted) | ⏳ |
| M6 History | ⏳ |
| M7 Vector PDF | ⏳ |

## Building behind a corporate proxy

If `docker compose build` fails with `CERTIFICATE_VERIFY_FAILED`, your network re-signs TLS traffic. Point `EXTRA_CA_FILE` at the proxy's CA bundle so pip and npm inside the build trust it:

```bash
EXTRA_CA_FILE=/path/to/corporate-ca.pem docker compose build
```
