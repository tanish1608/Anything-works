# Repository guidance

## Product and source of truth

The product is **Placeholder AI**. It checks daily construction photos/updates against approved context, flags mistakes and incomplete work, and updates progress and issues in 3D across construction stages. Before-drywall checking is one use case, not the full concept.

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
- The user authorized committing and pushing completed, verified work to `main` by default on October 6, 2026. Continue that preference for subsequent implementation; use ordinary pushes, preserve upstream changes and never force-push main.

## Product invariants for the new workflow

1. Every assessment links evidence, confirmed location, applicable source revisions and the checks performed.
2. AI-checked completion (policy `ai-complete-v1`, decided by the user on October 6, 2026 and on by default) requires every photo check to pass and any submitted measurement to be within tolerance of the approved model, with no open issue on the work. It is labelled "AI-checked complete", never "human accepted" or inspected; PMs can reopen it and a project can opt out (`ai_auto_complete: false`). Issues still close only through a PM decision. Measurements are compared by server code, never by the model.
3. AI completion, human acceptance and formal inspection are separate. Never fabricate a reviewer or inspection result.
4. Missing, occluded, ambiguous, unsupported and failed checks remain explicit. They are not passes.
5. New daily evidence can reopen previously completed work. Approved reference changes invalidate affected decisions.
6. Daily updates change observations and status; approved design revisions change geometry.
7. Open issues remain prominent over older completion status. All decisions retain provenance and history.
8. Capture works with offline queuing; a local draft is not a received or checked submission.
9. Permissions apply to model files, evidence, source documents and derived AI results.
10. Generated samples and mock outputs are not proof of field accuracy.

These are target requirements. The legacy zone-upload auto-approval and skip-done behavior (`vision_jobs.py`) do not satisfy them and must stay isolated from shared work packages; see STATUS and P2 in TODO. Do not describe requirements as implemented merely because they appear here.

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

**AI:** `app/vision/` uses the Google Gemini SDK with structured element verdicts. `VISION_MODE` supports auto/gemini/off/mock. Existing model confidence and installed verdicts are not plan-compliance certification. Shared work checks live in `app/agent/` (frozen context, server-validated citations, deterministic measurement checks, the AI completion policy and Project Copilot chat); see docs/AI_CHECKS.md. New checks need versioned context, structured results and evaluation; AI completion accuracy on real photos is not yet measured.

**Frontend:** React, TypeScript, Vite PWA, TanStack Query and three.js.

- The user selected `src/workspace/` (formerly `/demo`) as the final website UI. The root `/` is now the project showroom/home; opening a project enters a building-centered workspace: one persistent `BuildingCanvas` with contextual `WorldPanels`, root query-state navigation and compatibility redirects for old page URLs. Do not restore the earlier Home/Logs/Building page tabs or mount multiple 3D views for these workflows. Do not restore the older login/project route tree. The chosen interface now offers optional authenticated project/model onboarding in a contextual panel. Private work records now use `services/workflow.py`, the shared workspace API and `useConnectedWork.ts`, with real account permissions, actor history, capture/review/correction and a scoped IndexedDB outbox; retained field/page components are integration foundations. Public samples must remain sign-in free; once signed in, the showroom lists only the account's real projects (the same list the phone app shows). The assistant character is **Works Beaver** (avatar `web/public/brand/works-beaver.png`). Preserve existing local-storage keys and explicit sample/result provenance.
- Design iteration 2 adds a public project selector and per-project local keys. Preserve the original duplex storage key; never reuse its work/room associations for another model. Source grouping for Schependomlaan uses its pinned reviewed room map, not a general unit parser. Distinct IFC space GUIDs remain distinct even when room codes match. Private model layers/plans use authorized loaders, and private API responses must not enter shared URL-keyed service-worker caches. The UI-only checklist is `docs/UI_TODO_ITERATION_2.md`.
- `src/viewer/` is a separate viewer with command/event API and embedding bridge; keep it independent of page components.
- Project switching uses home `/` or `/?screen=projects` and `workspace/ProjectShowroom.tsx`: one selected source-model preview, separate browsing/opening, and preserved return context. Do not mount hidden workspace or thumbnail WebGL canvases. Private previews use authorized current-model/layer loaders; public thumbnails are source-bound SVG silhouettes, not field progress. Keep project names non-interactive and use an explicit Switch project button. Add/import starts from the project home, with private draft review still in the shared canvas. Project pulse and Project context are retired; user-view previews remain in the user menu. The standalone subcontractor companion brief is `docs/SUBCONTRACTOR_MOBILE_BUILD_PROMPT.md`; it is not an implemented mobile app.
- The active shared daily loop is documented in `docs/SHARED_DAILY_WORKFLOW.md`. Keep public sample transitions isolated from authenticated work. Connected decisions must preserve the revision/update the reviewer opened; never silently retry acceptance against newer evidence. New approved references require reconfirmation and fresh evidence. Legacy AI/progress routes cannot change a tracked WorkPackage. Private photo bytes use authenticated fetch and disposable object URLs.
- `mobile/ios/` is the native crew app (SwiftUI, iPhone): `CrewCore` is a Swift package with the API contract, file outbox and measurement maths (`swift test` on macOS); the app is generated with XcodeGen from `PlaceholderCrew/project.yml`. It uses the shared work endpoints only.
- `src/field/` uses IndexedDB; replay occurs on app open, online events and a timer. Do not assume iOS Background Sync.
- `src/pages/` is the connected workspace; `src/studio/` is a browser-local fictional demo.
- `src/api/client.ts` handles JWT access and rotating refresh tokens.
- The service worker exists in production builds. Verify actual device behavior when changing offline/cache handling.

## Evaluation and claims

Existing DXF/PDF samples are generated; the photo sample is synthetic. Keep conversion and vision evaluation harnesses usable, and extend them for the new check types without silently changing existing label semantics.

Report false completions, missed supported defects, false alerts, abstention and coverage separately. A single confidence threshold or aggregate accuracy score is insufficient for automatic completion release.

Keep dated research separate from current product decisions. Rework economics are illustrative scenarios unless supported by customer records. Do not assert all current US homes spend 5–6% on rework or that a competitor lacks a feature merely because it was not found in public materials.
