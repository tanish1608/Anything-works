# Building workspace — implementation handoff

Updated October 6, 2026. Current website behavior, with explicit testing boundaries.

## Design iteration 2

`codex/design-iteration-2` adds a wider responsive panel (roughly 38% of desktop width), larger evidence area, closer projected-bounds overview camera and 1.2 m exploded-floor gaps. Panel resizing refits the selected subject until the user manually orbits/zooms. Component close-up fitting is unchanged.

The project showroom is home at `/`; the explicit **Switch project** header button opens it at `/?screen=projects`, with a large rotating interior source model, property facts, four cards visible together and explicit Open project action. It includes the duplex, [Schependomlaan Apartments](../samples/ifc/schependomlaan/README.md), [Medical-Dental Clinic](../samples/ifc/clinic/README.md), [Esplan Building](../samples/ifc/esplan/README.md), and authenticated projects returned for the connected account. Browsing does not change the active project; Escape restores the previous panel and fragment when entering from a workspace; there is no Back to building button on home. Opening clears stale spatial/work/date selections and opens Work & issues. Empty private projects open model setup, and unavailable private models never fall back to a sample.

The workspace canvas unmounts while the showroom is open; only the selected property's GLB renders. Card silhouettes are reproducible approximations from actual component bounds (`scripts/build_project_previews.py`), not exact mesh previews or progress states. Preview-control buttons and the extra heading are removed. Four cards fit in a grid; larger catalogs use explicit pages. Rotation pauses on interaction/backgrounding, starts disabled for reduced motion and can be toggled with Space while the preview has focus. Orbit fitting keeps all building corners inside the frame throughout horizontal rotation, including narrow viewports. Each project retains separate local record/draft/history/availability keys; the duplex keeps its original key.

Opening a project opens Work & issues beside the building. Requested panel bookmarks take precedence; `panel=none` explicitly dismisses it and survives refresh. Model overview returns to issues. Empty public projects offer source-component work setup; empty Attention offers All work; empty private records explain the missing field-record integration instead of implying an issue-free site.

A new project begins with no inferred field progress. The spatial directory includes searchable component rows for keyboard access. Selecting an untracked component offers **Track work here**, requiring a title and owner; only planned work is created. Public sample capture requires a confirmed component location and evidence before review. Optional authenticated IFC upload/review/approval is connected inside this UI; private field-record persistence now uses the shared work API. See [the UI checklist](UI_TODO_ITERATION_2.md).

Home Add / import project opens a standalone setup form at `/?screen=projects&panel=import`, before any building model is required. Creating/importing a private model enters its authorized draft canvas for review. Account previews and guarded reset stay in the user menu; Project pulse and Project context screens are removed, and their old links normalize to issues. Sort/Team use themed keyboard-operable popups rendered outside the scrolling drawer. The loading overlay is centered in the model region without the inherited translated-toast position. Connected-list outages leave sample browsing usable with retry/disconnect recovery.

## Interface and user journey

The building is the main workspace. A compact header, floor rail and floating system/view controls surround one persistent model. There is no left navigation sidebar or separate Home/Logs/Building model page. Contextual workflows open to the right on desktop and below the canvas on smaller screens. Closing a panel restores the larger model area.

1. Open `/` to see the complete, exploded source building. Exterior walls/roof are initially hidden; use the exterior toggle to restore them. System toggles follow actual imported layers.
2. Select a floor, then a reviewed unit group and room, or search/select a work record. Source IDs drive the building → floor → unit → room hierarchy.
3. Selecting a pin or row frames source components in the room and opens the matching work panel. **Zoom to component** narrows the camera; isolation shows just that component. This reuses the original renderer and geometry.
4. Review the latest submission photo, earlier photos, model-derived reference, owner, evidence coverage, recorded checks and activity timeline. Generated images remain labeled and are not photographs of this source building.
5. Request evidence, confirm/assign an issue, accept reviewed work, return a correction, explicitly resolve a correction or reopen work. Required reasons enter local history. Existing completion/evidence guards apply; formal inspection stays separate.
6. **New update** opens confirmed location, photo capture, note and worker claim beside the same model. Changing the target moves the model and requires fresh location confirmation. Drafts save locally. Submission reopens prior completion and awaits review; actual uploads do not run the fixture AI simulator.
7. Offline submission retains one update/request identity. Reconnection moves it into local review and does not imply server receipt, AI checking or completion.
8. **Progress history** replays recorded statuses on the current design, compares dates and exports logs. Opening a record restores current status/evidence. Historical geometry and historical evidence reconstruction remain future work.
9. The project menu opens pulse, history, team, spatial directory and project context. Team availability and project name persist locally; reset is explicit and warns about loss of local records.

## Source hierarchy and truth boundaries

- Geometry is the public buildingSMART duplex: 1,282 components, four source levels, 22 spaces and six discipline layers. Original geometry and stable IDs remain unchanged.
- The known source uses A/B space codes. Display grouping into Units A and B is explicitly restricted to the reviewed sample repository/revision. Unknown spaces remain shared/unassigned. Imported models will need reviewed unit metadata; this is not a general automatic apartment parser.
- Work pins use version-bound component-centre anchors. They identify model context, not a point registered from a photo. Component inspection shows original source properties, without fabricating dimensions/materials.
- Component progress follows the existing shared projection: open issues and incomplete/unsupported scope block green. An untracked source component is not assumed installed or complete. Whole-floor tinting is not used to infer floor completion.
- Public sample field records remain browser-local, using the original storage keys and sample PM identity. Samples are sign-in free; optional account connection enables real private model onboarding. The live assessment agent is pending; private records now synchronize through the shared manual workflow.
- Customer and trade-specific surfaces remain planned in TODO. They must filter this same model/record stream rather than creating alternate geometry or histories.

## Source map

| File | Responsibility |
|---|---|
| `web/src/workspace/Workspace.tsx` | Shared state/provider, root panel navigation, header, offline synchronization and guarded reset |
| `web/src/workspace/BuildingCanvas.tsx` | One model/plan surface, source hierarchy, room/component focus, controls and pin projection |
| `web/src/workspace/WorldPanels.tsx` | Evidence, review/correction, capture, history, teams and project context |
| `web/src/workspace/spatialNavigation.ts` | Reviewed unit grouping, breadcrumbs and legacy URL normalization |
| `web/src/workspace/WorldDialog.tsx` | Native evidence/reset modal focus and cancellation |
| `web/src/workspace/photoInput.ts` | Device photo decoding/resizing; reused by retained capture tests |
| `web/src/workspace/world.css` | Dark canvas/panel layout and responsive dock behavior |
| `web/src/viewer/ProjectScene.tsx` | Shared GLB lifecycle and camera/explosion sequencing |
| `web/src/viewer/markers.ts` | Camera-facing pin geometry with clickable centres and stable identities |

The previous tabbed `LegacyWorkspace` is imported only by retained regression tests. It is not part of the active route tree. Connected backend/page components remain integration foundations.

## Verification and remaining acceptance

All 127 frontend tests and production compilation pass. Tests cover one scene across panels, source hierarchy, room/tight focus, current evidence, capture target changes, correction history, offline identity, historical replay, immutable model references, showroom switching/cancel/auth scopes and rotation lifecycle. Full-orbit framing is checked by projecting every corner at 36 camera angles on wide/portrait viewports. Pin body/centre ray hits use real three.js geometry on the CPU. Added clinic/Esplan tests verify source identity and real GLB node bounds/picking; backend checks preserve small geometry at large survey coordinates. Frontend lint completes with warnings in retained components; new interface files have no reported warnings. Three updated browser smoke tests are discoverable; they have not been run under the saved browser restriction.

DOM/stub/CPU checks do not establish visual acceptance. Review actual WebGL framing, occlusion, palette/contrast, exploded floor spacing, drag/zoom/pin picking, 2D fallback, photo capture and drawer behavior on desktop and physical phones. Searchable/paged keyboard component access is implemented. Complete physical assistive-technology acceptance and reviewed unit metadata, production reliability before a pilot claim. Shared manual evidence/review/correction and scoped identity are connected; live checks are not.


## Client-demo completion pass — October 6

Project/model setup starts from home Add / import at `/?screen=projects&panel=import`. Connect/register an account, create a project, upload IFC, inspect the draft using the same 3D/2D canvas, and explicitly approve it. `/?project=api%3APROJECT_ID&version=VERSION_ID&panel=import` previews an authorized revision. Public samples remain open; private model requests never fall back to a sample. Private field records now use the [shared authenticated daily workflow](SHARED_DAILY_WORKFLOW.md), with actual actor decisions, private photos, assigned crew capture and server progress/history.

The account menu offers public role previews. Customer is read-only; subcontractor/field lists and capture target assigned work; PM keeps decision/assignment actions. The renderer remains mounted when changing a preview. These are public presentation views, not private sharing/RBAC enforcement.

Source lists paginate; source properties can be searched in full. Header search includes completed and planned work. Work filters/sorting and reassignment update real local owner/deadline/history. Failed images retain evidence identity and do not substitute another photo. Panel focus returns to its invoker and search retains typing focus. Draft edits preserve scene color/pin references. New work without defined fixture checks cannot produce a simulated completion from a generated image.

The apartment now exports 100 rooms, preserving both source `1.02 · toilet` GUIDs. A nullable IFC GUID migration preserves legacy IDs only when the source footprint also matches. Previously saved local completion on a split room is archived and reopened for review.

Use [CLIENT_DEMO.md](CLIENT_DEMO.md) to rehearse. Buildable iteration UI items are implemented; physical WebGL/camera/PWA/assistive acceptance is still open. Live checks, original approved sheet/detail integration, more complete member administration and chosen-interface surface-point placement remain pilot work.
