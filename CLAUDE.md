# Repository guidance

## Product and source of truth

The product is **Everything Works AI**. It checks daily construction photos/updates against approved context, flags mistakes and incomplete work, and updates progress and issues in 3D across construction stages. Before-drywall checking is one use case, not the full concept.

Read [README.md](README.md), [product specification](docs/PRODUCT_SPEC.md), [PLAN.md](PLAN.md), [TODO.md](TODO.md) and [STATUS.md](STATUS.md) before design-level changes. Setup commands are in [the developer guide](docs/DEVELOPMENT.md).

The code still uses SiteMesh identifiers. Do not rename packages, storage keys or persisted identifiers as an incidental documentation change.

## Working approach

- Follow the user's requested scope. The October 5 reset is documentation only; application work is a later task.
- During implementation, complete the authorized work package and its meaningful verification, then report what changed and its limits. Do not introduce an extra permission gate for routine work.
- Preserve useful foundations. Do not rewrite the stack just to implement the new narrative.
- Keep actual functionality separate from plans and fixtures. Update STATUS and the relevant backlog when behavior ships.
- Keep the product original and preserve third-party sample attribution.
- Use focused changes and relevant tests. Do not claim a test passed without running it.
- Do not commit/push or contact customers solely because a planning document mentions those future activities.

## Product invariants for the new workflow

1. Every assessment links evidence, confirmed location, applicable source revisions and the checks performed.
2. No AI-checked completion without adequate evidence and a released check-specific completion policy.
3. AI completion, human acceptance and formal inspection are separate. Never fabricate a reviewer or inspection result.
4. Missing, occluded, ambiguous, unsupported and failed checks remain explicit. They are not passes.
5. New daily evidence can reopen previously completed work. Approved reference changes invalidate affected decisions.
6. Daily updates change observations and status; approved design revisions change geometry.
7. Open issues remain prominent over older completion status. All decisions retain provenance and history.
8. Capture works with offline queuing; a local draft is not a received or checked submission.
9. Permissions apply to model files, evidence, source documents and derived AI results.
10. Generated samples and mock outputs are not proof of field accuracy.

These are target requirements. The current legacy auto-approval and skip-done behavior do not yet satisfy them; see STATUS and P2 in TODO. Do not describe requirements as implemented merely because they appear here.

## Existing technical architecture

**Backend:** FastAPI, SQLAlchemy 2, Alembic, Python 3.11+. Thin API routers; domain logic in `backend/app/services/`.

- Central authorization lives in `app/rbac.py`, combining roles and trade/zone scope. Reuse it for queries and file access.
- Record domain mutations through `services/events.record` in the same transaction. Events are append-only, enforced by DB triggers. Do not bypass history for AI mutations.
- `services/progress.py` enforces photo evidence for existing `done` transitions. Preserve that protection while separating new completion and acceptance semantics.
- `Element` provides identity; `ElementRevision` holds per-version geometry/props; `ModelVersion` tracks versions. Reconciliation must preserve identity and mark affected prior work for review. Geometry-derived IDs need care when drawings change.
- `app/jobs.py` implements a DB-backed queue. Handlers register with `@jobs.handler`; normal mode is `thread`, tests use `inline`. No Redis/RQ dependency is assumed.
- Use `app/storage.py` rather than writing storage paths throughout services.
- Config uses pydantic-settings and environment variables. Never commit credentials or print live secrets.
- Add Alembic migrations for schema changes and support SQLite and PostgreSQL.

**Models and drawings:** ezdxf, pdfminer.six, shapely and IfcOpenShell. Review converted drawings before activating them. Do not fabricate undrawn components or infer exact dimensions from schematic symbols. IFC imports generate per-discipline GLBs server-side; the browser loads GLB, not IFC.

**AI:** `app/vision/` uses the Google Gemini SDK with structured element verdicts. `VISION_MODE` supports auto/gemini/off/mock. Existing model confidence and installed verdicts are not plan-compliance certification. New checks need versioned context, structured results, evaluation and a separate completion policy.

**Frontend:** React, TypeScript, Vite PWA, TanStack Query and three.js.

- `src/viewer/` is a separate viewer with command/event API and embedding bridge; keep it independent of page components.
- `src/field/` uses IndexedDB; replay occurs on app open, online events and a timer. Do not assume iOS Background Sync.
- `src/pages/` is the connected workspace; `src/studio/` is a browser-local fictional demo.
- `src/api/client.ts` handles JWT access and rotating refresh tokens.
- The service worker exists in production builds. Verify actual device behavior when changing offline/cache handling.

## Evaluation and claims

Existing DXF/PDF samples are generated; the photo sample is synthetic. Keep conversion and vision evaluation harnesses usable, and extend them for the new check types without silently changing existing label semantics.

Report false completions, missed supported defects, false alerts, abstention and coverage separately. A single confidence threshold or aggregate accuracy score is insufficient for automatic completion release.

Keep dated research separate from current product decisions. Rework economics are illustrative scenarios unless supported by customer records. Do not assert all current US homes spend 5–6% on rework or that a competitor lacks a feature merely because it was not found in public materials.
