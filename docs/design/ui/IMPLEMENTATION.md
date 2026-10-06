# Design implementation

The designer's screens are implemented in React on `codex/daily-update-design`, based on design commit `a1b3ef2`. The original HTML, images and screenshots remain here as references.

## Open the interface

Run the frontend using the [developer guide](../../DEVELOPMENT.md), then open `/demo`. This interface works without signing in or starting the backend.

The authenticated app also uses the shared typography, colors, project navigation and branding. A new `/p/:pid/today` page uses actual authorized API records for progress, issues and field updates. Project cards open that overview; existing model, drawing, issue, history and field routes remain available.

## Implemented screens

| Route | Working interactions |
|---|---|
| `/demo` | Daily overview, exception sorting, previous-day reference activity, source-linked records |
| `/demo/work` | Status, trade and level filters; search; record navigation |
| `/demo/review/:id` | Photo/reference views, check results, separate record dimensions, finding confirmation, evidence requests, dismissal reasons |
| `/demo/issue/:id` | Before/after evidence, assignment, correction requirements, explicit resolution, rejection and history |
| `/demo/building` | Full-width imported duplex viewer with floating Level/View/Layers, fixed interior defaults and a clickable corner preview to switch 3D/2D |
| `/demo/report` | Evidence-backed summary, notes, download, history and immutable signed text snapshots |
| `/demo/setup` | References and check catalog, editable local project name and links to real project tools |
| `/demo/capture` | Three-step mobile capture, photo/file input, resized local evidence, saved drafts, worker claim and offline simulation |
| `/demo/result/:id` | Completion scope, missing evidence, queued state, limitations and follow-up navigation |

Works Beaver summarizes local records and links to the next review or location. It does not run a language model or autonomously make a decision.

## Data and scope

The interactive demo uses the designer's fictional Hawthorne records. Images are generated samples from the design branch. Its fixture AI results and notification delivery are labeled.

New uploaded images are saved on the device and routed to manual review. An explicit **Run the labeled sample check** option demonstrates fixture outcomes only when the submission contains sample images. Claiming “Done” does not complete work.

Every work item has separate processing, coverage, progress, review and inspection information. Confirmed issues require correction evidence and an explicit resolution decision. Later submissions retain earlier assessment snapshots. Actions are recorded with their actor, reason and time.

State is stored under `everything-works-designer-v1`, separately from the earlier Studio demo and authenticated project data. Reset clears only this local demo. Export the daily report before resetting if a record is needed.

The illustrated building remains available through `?view=workflow` and existing `?unit=` links, with six modeled levels and 48 units. Level 14 and Level 3 are the active fixture locations. Room colors and pins come from work records; no field update changes planned geometry. Core-level records retain their location rather than being assigned to an apartment. Those pins are approximate room context, not surveyed positions. The default Building page now shows the separate imported duplex in a simple viewer; detailed properties/pin/review authoring remain at `/bim-lab`. See [the BIM audit](../../BIM_AUDIT.md). Fictional apartment work records are not mapped onto that unrelated project.

Offline simulation and reconnect move a submission into **local demo review**, not a server receipt or an AI pass. The connected field app retains its existing backend upload queue. Full new-workflow server persistence remains future work.

## Implementation map

- [Workspace screens and components](../../../web/src/workspace/)
- [Typed records and transitions](../../../web/src/workspace/state.ts)
- [Scoped designer styles](../../../web/src/workspace/design.css)
- [Interactive 3D adapter](../../../web/src/workspace/Spatial.tsx)
- [Connected project overview](../../../web/src/pages/TodayPage.tsx)
- [State tests](../../../web/src/test/workspace-state.test.ts)
- [Interface tests](../../../web/src/test/workspace.test.tsx)

Inter and JetBrains Mono are bundled locally. Icons use the existing SVG component, so the interface does not need external font requests. The PWA build includes sample images and local WOFF2 assets.

## Verification and limits

The initial designer release passed 32 frontend tests. After Building simplification, 46 frontend tests and production compilation pass; the unchanged backend last passed 128 tests. The 3D engine and inspection routes load separately, removing the oversized main-bundle warning. Frontend lint completes with existing warnings. Tests cover review/capture/report workflows, model projection, simple Building navigation, preview switching with retained filters and no geometry reload, plan pinch zoom, 2D fallback and connected shell controls with mocked API records.

The 3D interface tests use a renderer stub. They verify the adapter and controls, not WebGL output or camera gestures. Browser visual review was blocked by the user's saved local-URL browser-access preference. Desktop/mobile screenshots and real-device checks remain outstanding.

Reliable live plan checking, released automatic completion policies, exact measurements, code checks and new backend assessment records are outside this design implementation. Continue with the [product backlog](../../../TODO.md) to connect and validate the full workflow.
