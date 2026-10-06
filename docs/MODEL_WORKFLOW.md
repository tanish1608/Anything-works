# One project model and the daily-update workflow

UI update, October 6: the chosen website now has one persistent building canvas at `/` and contextual right-side workflows. Old `/demo/...`, Building, Logs, People, Setup and capture bookmarks normalize to root panel state. See [the current building workspace](BUILDING_WORKSPACE.md). Connected onboarding/field components below remain implementation foundations; the website still uses local records and public sample geometry.


Implemented October 6, 2026. Live agent orchestration is deferred.

## One model across the workspace

Home, Logs and Building in `/demo` load the same pinned public duplex dataset: 1,282 components, four levels and 22 spaces. They use `ProjectScene` and `SiteViewer`; compact pages supply selection and status data, rather than constructing another building. The connected pages load private project manifests through the authenticated client and use the same renderer. The advanced connected Model page retains its inspection controls.

Home starts with the entire building. Exterior walls and roof stay hidden for an interior view. Selecting a work pin separates the levels with reversible display offsets, then frames its actual component. Pins move with their linked components; coordinates stored in records remain in the original model frame. Entire building collapses and fits the model again. Logs compares recorded statuses on this same geometry. Building retains Level, View, Layers and the 3D/2D corner preview.

The spatial contract is project → building → level → space → component. Each work location stores model version, level/space IDs, component IDs and a canonical model anchor. IFC bounding boxes use X/Y/Z; the GLB viewer uses X/Z/−Y. Names alone are not identifiers. Unassigned components stay unassigned.

The public project has newly defined fictional work packages linked to actual source components. These are not migrated observations of the designer's old Hawthorne project. Generated photos remain illustrative, and component-centre work pins do not prove photo registration or the exact location of a defect.

## A new connected project

1. Create a project. The app opens `/p/:pid/setup`.
2. Upload IFC files. The backend import job creates a draft and extracts hierarchy, components, properties, meshes and model-derived plans. An existing approved baseline stays active.
3. Review the extracted structure. Inspect the draft in 3D/2D and identify missing room associations. Approved drawing sheets are uploaded/reviewed separately; model silhouettes are not approved construction drawings.
4. Explicitly confirm the review and approve the baseline. Owner/PM permissions are checked by the API. Draft geometry is unavailable to field users until approved.
5. Set up people and open field capture. The room/trade checklist is scoped to the approved revision and authorized components.

Rejected/failed imports do not replace the active model. Approving a changed design revision uses the existing reconciliation rules to invalidate affected progress.

## Daily update to model progress

1. Select work and confirm the linked location. In the connected field app, select a room/trade and the components worked on.
2. Attach photos and notes. Record a worker claim separately from verified progress.
3. Submit or queue offline. The queue preserves submission identity, the checklist's model revision and selected component IDs. A stale revision is rejected with a review message and the photo remains on the device. An already-received retry returns its original upload.
4. Prepare the assessment handoff. The local demo records a version-bound request with update ID, evidence IDs, scope, reference, claim and note; offline requests become pending without duplication, and newer requests supersede older pending ones. Connected `upload.created` audit events retain the received model version, capture revision when supplied, component IDs and evidence IDs. Older clients without the new revision field are bound on receipt; their capture revision cannot be established. No new agent is invoked by this implementation.
5. Await manual review while agent work is deferred. New worker evidence for a previously completed component reopens review. “Done” claims do not create completion, and evidence captured against a superseded baseline cannot approve progress on the new one.
6. Record acceptance or a correction decision. Open issues remain above completion; insufficient, unsupported or failed checks remain explicit. Accepted scope updates colours through shared projections on Home, Building and Logs. Daily updates never edit design geometry.

An explicit sample-check option demonstrates fixture outcomes only for generated sample images. It is not live AI and is never applied to uploaded real photos. The older connected vision subsystem still exists; use `VISION_MODE=off` to exercise the manual workflow. Its opt-in confidence-based automatic approvals are not the planned agent or completion policy.

## Persistence and history

The unified public demo uses `everything-works-project-v2`. Earlier Hawthorne records remain under `everything-works-designer-v1` and are never assigned to duplex locations. Incompatible saved project revisions are archived before creating a new sample state. Connected projects continue to use their database and authorized APIs.

Demo Logs reconstructs statuses from dated local events; current photos and references are not historical snapshots. Connected Logs replays the API timeline onto current geometry and retains recorded completion provenance where available. It does not reconstruct historical design geometry, historical photo registration, or every issue reopening interval. Paginated daily activity clearly identifies partial loading.

## Verification

Renderer/controller tests check common revision IDs across surfaces, full-building framing, pin selection, expansion before focus, no geometry reload for colour changes, and preservation of canonical geometry under rotated/scaled parents. Workflow tests check all 14 source bindings, missing/stale baseline gates, offline identity, evidence-triggered reopening and issue precedence. The backend integration test exercises real IFC import → draft → approval → photo claim → human review → reopening → stale revision rejection. No live AI or browser visual acceptance is asserted.
