# Design iteration 2 — UI backlog

Updated October 6, 2026. Branch: `codex/design-iteration-2`.

The building is the main workspace. Use one renderer per selected project, with contextual workflows beside it. This list concerns the interface; live AI, server persistence and role enforcement remain in the main [TODO](../TODO.md).

## Layout and camera

- [x] Preserve the complete first building-centered implementation on the iteration branch.
- [x] Widen the evidence/workflow panel and give photos, decision forms and timeline more breathing room.
- [x] Keep the model large when a panel opens; use responsive proportions rather than a narrow fixed drawer.
- [x] Replace the distant default camera with a closer, deliberate building overview that still fits visible geometry.
- [x] Improve the default angle and exploded-floor spacing for residential buildings of different shapes.
- [x] Keep component close-up fitting accurate and preserve source coordinates when changing presentation.
- [ ] Review real WebGL framing, occlusion and pin interaction on desktop and physical phones.

## Multiple building projects

- [x] Add a larger public apartment BIM project with pinned source, attribution and reproducible import.
- [x] Add a compact project switcher without bringing back page tabs or a permanent left sidebar.
- [x] Isolate each project's updates, drafts, decisions, history and selection; preserve existing duplex records.
- [x] Show source floors/rooms and only reviewed unit associations; unknown units stay unassigned.
- [x] Let untracked source components become planned work through an explicit local action, with no inferred completion.
- [x] Test the larger IFC through authenticated upload, draft review, approval, element/plan extraction and mesh retrieval in a disposable database.
- [x] Test evidence upload/review/progress against the second project without modifying geometry or mixing project records.
- [x] Add optional authenticated project creation/IFC upload, resumable import jobs, draft preview and explicit model approval inside this interface. Public samples remain sign-in free; private model files use authorized API loading. Private field records remain pending.

- [x] Preserve duplicate source room-code identities by IFC space GUID, with a nullable schema migration and safe legacy matching. Export 100 distinct spaces; archive/reopen local completion whose old merged room identity needs review.
- [ ] Review loading/memory/frame time on physical devices: the larger sample includes roughly 17 MB of detailed JSON and 4.7 MB of meshes.

## Workflow polish and acceptance

- [x] Improve empty states for new projects and updates without a selected work package.
- [x] Make component exploration accessible through a searchable list as well as pointer picking.
- [x] Implement/test contextual-panel focus and restoration; keep header search focus, native dialog Escape behavior and landscape layout safeguards.
- [ ] Complete physical keyboard/screen-reader, mobile camera and narrow/landscape visual acceptance.
- [x] Add long-name wrapping, complete source-property search, paged component/work lists, all-status header search, team filtering, due-date sorting and explicit photo loading/failure states.
- [x] Make reassignment update the real local owner/due date while retaining issue state and reason/history.
- [x] Keep draft typing from rebuilding model colors/pins; new work with generated evidence but no defined fixture checks remains in manual review.
- [x] Design public customer, PM, subcontractor and field-worker previews on the same model/record stream. Customer is read-only; crew capture is assignment-scoped and acceptance remains with PM. Real private role scopes/sharing are separate integration work.
- [x] Keep generated evidence, local-only saving, human acceptance and formal inspection distinct.

## Client-demo preparation

- [x] Write a concrete walkthrough, capability boundaries, rehearsal checklist and pilot priorities in [CLIENT_DEMO.md](CLIENT_DEMO.md).
- [x] Keep private API responses out of shared URL-keyed service-worker caches; clear historical API/model caches on session changes.
- [ ] Rehearse a browser-rendered IFC upload and correction journey with a teammate on the intended backend/devices.

## Verification record

Verified October 6, 2026:

- Frontend DOM/CPU checks: **99 passing tests**; production compilation succeeds.
- Real IFC upload acceptance plus backend model/detail/project/seed regression checks: **21 passing tests**.
- Disposable SQLite migration upgrade/downgrade/upgrade passes. The local development database was backed up and upgraded to `0008`; no project reset was performed. PostgreSQL migration execution was not tested in this session.
- Ruff passes on modified backend code/tests. Active iteration files have no frontend lint warnings; retained legacy warnings remain.

DOM and CPU geometry checks do not replace browser/device visual acceptance. Browser inspection remains unavailable under the saved local-URL access restriction. Physical acceptance tasks are deliberately left open.
