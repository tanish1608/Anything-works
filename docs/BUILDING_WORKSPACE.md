# Building workspace — implementation handoff

Updated October 6, 2026. Current website behavior, with explicit testing boundaries.

## Design iteration 2

`codex/design-iteration-2` adds a wider responsive panel (roughly 38% of desktop width), larger evidence area, closer projected-bounds overview camera and 1.2 m exploded-floor gaps. Panel resizing refits the selected subject until the user manually orbits/zooms. Component close-up fitting is unchanged.

The header/project menu switches between the duplex and [Schependomlaan Apartments](../samples/ifc/schependomlaan/README.md). The latter has 3,504 source components and six levels. Each project uses one renderer and separate local record/draft/history/availability keys. The duplex keeps its original key. Changing projects clears spatial/work/date selections; Escape and overview retain the selected project.

A new project begins with no inferred field progress. The spatial directory includes searchable component rows for keyboard access. Selecting an untracked component offers **Track work here**, requiring a title and owner; only planned work is created. Capture requires a confirmed component location and evidence before review. Real IFC upload has been tested through the retained authenticated API in disposable storage, but arbitrary model upload is not connected to this public UI. See [the UI checklist](UI_TODO_ITERATION_2.md).

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
- The website remains browser-local, using the original storage keys and sample PM identity. Sign-in is disabled for testing; backend authentication/project permissions are unchanged. The live assessment agent, custom model upload and multi-user synchronization are not connected to this interface yet.
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

All 85 frontend tests and production compilation pass. Tests cover one scene across panels, source hierarchy, room/tight focus, current evidence, capture target changes, correction history, offline identity, historical replay and immutable model references. Pin body/centre ray hits use real three.js geometry on the CPU. Frontend lint completes with warnings in retained components; new interface files have no reported warnings. Three updated browser smoke tests are discoverable; they have not been run under the saved browser restriction.

DOM/stub/CPU checks do not establish visual acceptance. Review actual WebGL framing, occlusion, palette/contrast, exploded floor spacing, drag/zoom/pin picking, 2D fallback, photo capture and drawer behavior on desktop and physical phones. Complete keyboard access to untracked components and assistive-technology acceptance. Bring approved-model onboarding, reviewed unit metadata, persistent evidence/review/correction records and scoped identity into this interface before claiming a connected multi-user product.
