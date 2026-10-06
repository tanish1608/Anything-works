# Developer guide

This guide runs the existing SiteMesh implementation. Read the [product specification](PRODUCT_SPEC.md) for the intended Everything Works AI workflow and [current status](../STATUS.md) for gaps.

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

- **`/demo`:** designer daily-update workspace with local tasks/evidence/decisions and a reset control. Actions persist in the browser. This is not a live AI or multi-user project workflow.
- **`/demo/building`:** simple full-width duplex viewer with floating Level/View/Layers and a corner 3D/2D preview switch; solid context with exterior walls/roof hidden. `?view=workflow` and `?unit=` links retain the illustrated building and fictional locations. `/bim-lab` keeps detailed inspection authoring.
- **`/` and `/field`:** authenticated connected workspace and field capture. Seed the backend for example projects.
- **`/bim-lab`:** detailed public duplex IFC import with component-level 3D inspection and model-derived 2D plans. Evidence/pins/progress here are local test records, and AI results are simulated. See [the BIM audit](BIM_AUDIT.md).

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
| VISION_MODEL | Configurable; check source for the current default and provider availability before a live run |
| VISION_EFFORT | Current integration's thinking-level setting |

Use `VISION_MODE=off` for manual review without analysis or `mock` to exercise the pipeline without live inference. Mock returns uncertain results; it does not demonstrate detection accuracy.

The legacy project-level auto-approval setting is not the new scoped completion policy. Do not enable it as a shortcut for implementing the new product.

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

End-to-end tests require the backend virtual environment and Playwright's browser installation. They start dedicated servers on ports 8001 and 5174. The configuration recreates its test SQLite file (default `/tmp/sitemesh-e2e.db`); any `E2E_DB` override must remain disposable. Screenshots/results go to `web/e2e/.results/`.

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
