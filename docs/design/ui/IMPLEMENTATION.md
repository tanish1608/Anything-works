# Design implementation

The designer's screens are implemented in React on `codex/daily-update-design`, based on design commit `a1b3ef2`. The original HTML, images and screenshots remain here as references.

## Open the interface

Run the frontend using the [developer guide](../../DEVELOPMENT.md), then open `/demo`. This interface works without signing in or starting the backend.

The authenticated app also uses the shared typography, colors, project navigation and branding. The `/p/:pid/home` page uses actual authorized API records and model files for a daily summary and linked model/work view; `/today` redirects there. Connected People and Logs use membership and paginated event APIs. Project cards open that overview; existing model, drawing, issue, history and field routes remain available.

## Implemented screens

| Route | Working interactions |
|---|---|
| `/demo` | Record-based daily summary, minimal model on left, grouped work pins on right, sorting, two-way selection and camera focus |
| `/demo/work` | Status, trade and level filters; search; record navigation |
| `/demo/review/:id` | Photo/reference views, check results, separate record dimensions, finding confirmation, evidence requests, dismissal reasons |
| `/demo/issue/:id` | Before/after evidence, assignment, correction requirements, explicit resolution, rejection and history |
| `/demo/building` | Full-width imported duplex viewer with floating Level/View/Layers, fixed interior defaults and a clickable corner preview to switch 3D/2D |
| `/demo/logs` | Calendar, daily activity, two-date comparison, recorded-status model projections, reopenings and text export |
| `/demo/people` | Contacts, search, teams, sample PM/trade-lead hierarchy and local availability |
| `/demo/report` | Redirect to Logs; existing signed snapshots are preserved in exports |
| `/demo/setup` | Source hierarchy, component-linked work packages, editable local name and daily update workflow |
| `/demo/capture` | Three-step mobile capture, photo/file input, resized local evidence, saved drafts, worker claim and offline simulation |
| `/demo/result/:id` | Completion scope, missing evidence, queued state, limitations and follow-up navigation |

Outside Home, Works Beaver summarizes local records and links to the next review or location. It does not run a language model or autonomously make a decision.

## Data and scope

The interactive demo uses newly defined fictional work records linked to real components in the public duplex. These are not observations or migrated locations from Hawthorne. Images are generated samples from the design branch. Its fixture AI results and notification delivery are labeled.

New uploaded images are saved on the device and routed to manual review. An explicit **Run the labeled sample check** option demonstrates fixture outcomes only when the submission contains sample images. Claiming “Done” does not complete work.

Every work item has separate processing, coverage, progress, review and inspection information. Confirmed issues require correction evidence and an explicit resolution decision. Later submissions retain earlier assessment snapshots. Actions are recorded with their actor, reason and time.

State is stored under `everything-works-project-v2` (legacy Hawthorne records are preserved under `everything-works-designer-v1`), separately from the earlier Studio demo and authenticated project data. Reset clears only this local demo and its availability settings (`ew-demo-people-v1`). Export Logs before resetting if a record is needed.

Home, Logs and Building now share the same imported duplex, revision, component IDs and ProjectScene/SiteViewer renderer. The old illustrated model is removed from these workspace routes. Fourteen new sample work packages link to real source components; their generated images remain illustrative. Model-centre pins are not measured defects or photo registration. `?work=ID` links select the corresponding component. Legacy `?unit=` links open the overview without guessing a location. See [the model workflow](../../MODEL_WORKFLOW.md) and [the BIM audit](../../BIM_AUDIT.md).

Offline simulation and reconnect move a submission into **local demo review**, not a server receipt or an AI pass. The connected field app retains its existing backend upload queue. Full new-workflow server persistence remains future work.

## Home and progress behavior

Home has no KPI cards, status badges or model control panels. A selected work row expands its context and links to the existing evidence/decision screen. Its model pin focuses the camera and selects that exact record, even when several work items share a room. Home starts with all building levels visible. Selecting a pin separates the levels and then focuses its actual component; Entire building reverses the offsets and restores the overview. Source mesh coordinates remain unchanged.

Logs reconstructs status using timestamped local events; absent records remain unassessed. It does not recreate historical photographs, reference revisions or geometry from today's fields. Comparisons show separate dated projections, changed items and reopenings. Connected Logs uses authorized paginated history and explicitly identifies partial loading; recorded status and completion provenance replay onto current geometry. Historical geometry and complete issue reopening replay remain pending.

People contacts and reporting lines in the demo are fictional. The connected directory shows authorized members and recorded emails; unknown availability and reporting lines are not inferred from roles or activity. Membership editing retains the existing permission checks.

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

The initial designer release passed 32 frontend tests. After the Home/People/Logs redesign, 63 frontend tests and production compilation pass; targeted import/progress and final workflow/history/vision regression suites pass 16 and 20 backend tests respectively. The 3D engine and inspection routes load separately, removing the oversized main-bundle warning. Frontend lint completes with existing warnings. Tests cover two-way Home selection, repeated camera focus, older issue revisions and unlocated records, date comparisons and reopenings, review/capture/Logs/People workflows, model projection, simple Building navigation, preview switching with retained filters and no geometry reload, plan pinch zoom, 2D fallback and connected shell controls with mocked API records.

The 3D interface tests use a renderer stub. They verify the adapter and controls, not WebGL output or camera gestures. Browser visual review was blocked by the user's saved local-URL browser-access preference. Desktop/mobile screenshots and real-device checks remain outstanding.

Reliable live plan checking, released automatic completion policies, exact measurements, code checks and new backend assessment records are outside this design implementation. Continue with the [product backlog](../../../TODO.md) to connect and validate the full workflow.

Connected project creation opens `/p/:pid/setup` for draft upload, hierarchy/model review and explicit approval. Field checklists and offline requests retain the active baseline; stale evidence is rejected for review. The planned agent handoff is version-bound; no new agent is connected.

The workspace header separates brand/project/profile controls from navigation, keeping the same header on Home, Logs and Building. Mobile keeps a truncated project selector and menu. The global demo banner and project badge are removed; source credit and generated-evidence labels remain at the relevant records.

## Canonical website routing — October 6

The user selected this workspace as the final website UI. `App.tsx` now mounts it at `/`; its navigation, capture/results, review/issues and model links use root paths. `/demo/...` redirects preserve query/fragment values. The previous login/project/field/embed UI is not mounted; retained backend and connected components are foundations for integration into this interface. Local storage keys and sample provenance labels stay unchanged. The PWA starts at Home. DOM routing tests and production compilation pass; revised browser smoke tests remain unrun.
