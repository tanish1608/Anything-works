# Placeholder AI — frontend

React, TypeScript, Vite PWA, TanStack Query and three.js.

The target experience checks daily construction updates for mistakes and incomplete work, updates supported completion, and locates findings in 3D. It applies across construction stages. The chosen workspace is the single website UI; public work records currently persist locally. Optional authenticated project/model onboarding is connected; private field-record integration remains open.

## Current website

The building is the workspace at `/`. There are no page tabs or permanent left sidebar. A single mounted `BuildingCanvas`/`ProjectScene` fills the available space; contextual workflows open on the right, or below the canvas on small screens.

- Overview: exploded source floors, interior visibility, floating floor/system controls and 3D/2D switching.
- Work/issue selection: building → source floor → reviewed unit group → room → component; room context first, with explicit component zoom/isolation.
- Right panels: account/project/model setup, project pulse, work/issues, photo evidence/reference/review, progress history, capture, team and project context.
- Daily updates: confirmed location, photos, note and optional progress claim; draft persistence and offline queueing. Actual uploads await review; no live agent or automatic completion runs here.
- History: replay recorded statuses and compare dates on the same current design. Open records show current evidence, not reconstructed historical photos.

Panel state is bookmarkable: `/?panel=issues`, `/?panel=record&work=ISS-031`, `/?panel=capture&work=PLUMB-402`, `/?panel=activity&date=2026-10-04`, `/?panel=team`, spatial `level`/`unit`/`room` parameters. Old `/demo/...`, `/work`, `/building?work=...`, `/logs`, `/people`, `/setup`, `/capture`, review/issue/result bookmarks normalize to these root panels. Retired private-project URLs return to the sample overview without transferring private IDs.

Routing lives in [App.tsx](src/App.tsx) and [Workspace.tsx](src/workspace/Workspace.tsx); spatial navigation is in [spatialNavigation.ts](src/workspace/spatialNavigation.ts). The PWA opens `/`, the project showroom/home. The explicit Switch project button returns to the selector; the building name is a label. Add / import lives on the selector, with setup at `/?screen=projects&panel=import`. Project pulse and Project context are retired; old links normalize to issues. Vite and production Nginx serve the SPA entry for deep links; other hosts need the same non-file/non-API rewrite.

The public duplex, fictional work records, sample PM identity and existing local-storage keys are preserved. Unit A/B grouping is explicitly limited to the reviewed sample room codes; imported projects will need reviewed unit metadata. Generated images, missing evidence, uncertain checks and formal inspection boundaries remain explicit. Public samples need no sign-in. `/?panel=import` optionally connects an account for real project creation, IFC upload, draft preview and approval; backend permissions remain active. Private model/plan loads use authorized requests and are not service-worker cached. Private field capture remains disabled until its persistence/identity integration exists.

See [the building workspace handoff](../docs/BUILDING_WORKSPACE.md). Legacy tabbed pages and connected components remain as integration/regression-test foundations and are not mounted in the website.

## Run and check

From `web/`:

```bash
npm install
npm run dev
```

Open `http://localhost:5173/` for the website. The current local workspace does not require the backend. See the [developer guide](../docs/DEVELOPMENT.md) for full setup, seeded users and configuration.

```bash
npm test
npm run lint
npm run build
npm run e2e
```

The last command needs Playwright browsers and starts Vite on port 5174. Retired connected-app E2E tests are archived in `e2e/legacy` and excluded. Browser smoke tests were updated but not run under the saved browser-access restriction.

## Next frontend work

Connect the local daily capture/results, exception inbox, reference comparison and correction flows to new backend assessment records. Validate completion checks and policy gates. Reuse the existing auth, project, viewer and field APIs inside this chosen interface; do not restore the old route tree.

See [implementation notes](../docs/design/ui/IMPLEMENTATION.md) for working interactions, verification and browser-review limitations.

Automatic progress completion, human acceptance and formal inspection need distinct labels. A local draft is not a checked upload. Use text/icons with color and a 2D fallback.

See the [product specification](../docs/PRODUCT_SPEC.md), [backlog](../TODO.md) and [current inventory](../STATUS.md). Keep the isolated viewer reusable and the local demo's simulated behavior clearly identified.

See [the shared model workflow](../docs/MODEL_WORKFLOW.md) for hierarchy, first-upload setup, queued daily evidence and agent integration boundaries.

## Design iteration 2

The header/project menu now switches between the original duplex and `/?project=schependomlaan`. Each project uses one renderer and separate local records, drafts, decisions and availability. The apartment model starts with no field observations: select/search a source component, choose **Track work here**, then submit evidence. Camera overview fits projected bounds; desktop panels use wider responsive proportions. See [the UI-only backlog](../docs/UI_TODO_ITERATION_2.md) and [apartment import/test notes](../samples/ifc/schependomlaan/README.md). This bundled selector does not connect arbitrary IFC uploads or private-project onboarding to the public website.

Shared private work now uses `workspace/useConnectedWork.ts` and `workflowQueue.ts`: authorized snapshots, actual actor review, account-scoped drafts/outbox, authenticated photos and shared list/model/history. Public samples retain the original local stores. See [the daily workflow contract](../docs/SHARED_DAILY_WORKFLOW.md).
