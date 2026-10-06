# Everything Works AI — frontend

React, TypeScript, Vite PWA, TanStack Query and three.js.

The target experience checks daily construction updates for mistakes and incomplete work, updates supported completion, and locates findings in 3D. It applies across construction stages. The chosen workspace is the single website UI; its records currently persist locally while backend integration remains open.

## Current website

The former `/demo` experience is the single public website. There is no separate login/project app in the public route tree.

- `/`: Home, with the daily summary and linked building/work pins.
- `/work`, `/review/:id`, `/issue/:id`: work, evidence, review and corrections.
- `/building`: full-width model with Level/View/Layers and the 3D/2D corner preview; `?work=ID` focuses a component-linked record.
- `/logs`, `/people`, `/setup`: history, project teams and baseline/location context.
- `/capture`, `/result/:id`: daily updates and their recorded results.
- `/demo/...` redirects to the equivalent root URL, preserving query strings and fragments. `/bim-lab` redirects to Building; `/field` redirects to capture. Retired login, private project, QR and embedded-viewer URLs return Home without mapping private IDs onto sample records.

Public routing lives in [App.tsx](src/App.tsx); workspace pages and aliases live in [Workspace.tsx](src/workspace/Workspace.tsx). The PWA starts at `/`. Vite and the shipped Nginx configuration serve the SPA entry for direct page visits; other hosts must also rewrite non-file, non-API routes to `index.html`.

The UI still uses public sample geometry, fictional work records and local storage. Saved records retain their existing keys across the URL change. Generated evidence and simulated checks stay labeled. Backend auth, import, offline queue and connected components remain in source for integration; their older screens are no longer public routes.

Authentication is intentionally disabled on the website for testing; open any workspace page without signing in. Backend APIs retain authentication and project scope. The current UI is the PM sample view; customer, contractor/PM, subcontractor and worker experiences are planned in [TODO.md](../TODO.md). Restore scoped sign-in in this interface when connecting private project data.

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
