# Everything Works AI — frontend

React, TypeScript, Vite PWA, TanStack Query and three.js.

The target experience checks daily construction updates for mistakes and incomplete work, updates supported completion, and locates findings in 3D. It applies across construction stages. This documentation change does not implement that new workflow.

## Current surfaces

- `/demo`: fictional browser-local Studio experience in `src/studio/`; independent of backend AI and live notifications.
- `/` and `/p/:pid/...`: authenticated project workspace.
- `/field`: mobile field workflow and IndexedDB upload queue.
- `/embed/p/:pid/viewer`: authenticated embedded viewer.

Source route definitions are in [App.tsx](src/App.tsx).

## Run and check

From `web/`:

```bash
npm install
npm run dev
```

Open `http://localhost:5173/demo` for the local demo. The connected workspace also needs the backend. See the [developer guide](../docs/DEVELOPMENT.md) for full setup, seeded users and configuration.

```bash
npm test
npm run lint
npm run build
npm run e2e
```

The last command needs the backend environment and Playwright browsers. See the guide for its disposable database and ports.

## Next frontend work

Implement daily capture/results, the exception inbox, evidence-to-plan comparison, supported completion badges and the correction loop. Project consistent statuses into model, list and report views. Keep offline, inadequate-evidence and failed-analysis states visible.

Automatic progress completion, human acceptance and formal inspection need distinct labels. A local draft is not a checked upload. Use text/icons with color and a 2D fallback.

See the [product specification](../docs/PRODUCT_SPEC.md), [backlog](../TODO.md) and [current inventory](../STATUS.md). Keep the isolated viewer reusable and the local demo's simulated behavior clearly identified.
