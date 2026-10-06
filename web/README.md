# Everything Works AI — frontend

React, TypeScript, Vite PWA, TanStack Query and three.js.

The target experience checks daily construction updates for mistakes and incomplete work, updates supported completion, and locates findings in 3D. It applies across construction stages. The designer's UI is implemented as a local interactive demo, alongside the connected project app.

## Current surfaces

- `/demo`: designer daily-update workspace in `src/workspace/`, using the existing procedural building scene. Includes capture, results, review, correction and reports; AI results are labeled fixtures.
- `/p/:pid/today`: connected overview using real project progress, issues and upload records.
- `/bim-lab`: real imported duplex geometry with precise surface pins, small-component focus, searchable properties and linked 2D silhouettes; review/progress here are local tests. See [the BIM audit](../docs/BIM_AUDIT.md).
- `/demo/building`: the same detailed BIM viewer integrated with app navigation; defaults to an interior view. The Daily workflow tab and `?unit=` links keep fictional evidence in the illustrated building.
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

Connect the local daily capture/results, exception inbox, reference comparison and correction flows to new backend assessment records. Validate completion checks and policy gates. The existing connected overview, auth, viewer and field routes continue using their current APIs.

See [implementation notes](../docs/design/ui/IMPLEMENTATION.md) for working interactions, verification and browser-review limitations.

Automatic progress completion, human acceptance and formal inspection need distinct labels. A local draft is not a checked upload. Use text/icons with color and a 2D fallback.

See the [product specification](../docs/PRODUCT_SPEC.md), [backlog](../TODO.md) and [current inventory](../STATUS.md). Keep the isolated viewer reusable and the local demo's simulated behavior clearly identified.
