# Everything Works AI — frontend

React, TypeScript, Vite PWA, TanStack Query and three.js.

The target experience checks daily construction updates for mistakes and incomplete work, updates supported completion, and locates findings in 3D. It applies across construction stages. The designer's UI is implemented as a local interactive demo, alongside the connected project app.

## Current surfaces

- `/demo`: designer daily-update workspace in `src/workspace/`, using the same imported duplex and shared ProjectScene/SiteViewer as Building and Logs. Includes Home with a linked model/work list, People, calendar Logs, capture, results, review and corrections; AI results are labeled fixtures.
- `/p/:pid/home`: connected summary and model/work view using authorized records; `/today` redirects.
- `/p/:pid/people` and `/p/:pid/logs`: connected member directory and daily event comparison. Historical model replay and editable availability currently live in the demo.
- `/bim-lab`: real imported duplex geometry with precise surface pins, small-component focus, searchable properties and linked 2D silhouettes; review/progress here are local tests. See [the BIM audit](../docs/BIM_AUDIT.md).
- `/demo/building`: simple full-width BIM viewer with Level/View/Layers inside the canvas and a corner preview switch for 3D/2D; interior defaults stay fixed. Component-linked work pins use `?work=ID`. Legacy illustrated-unit links open the model overview without guessing a duplex room.
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

See [the shared model workflow](../docs/MODEL_WORKFLOW.md) for hierarchy, first-upload setup, queued daily evidence and agent integration boundaries.
