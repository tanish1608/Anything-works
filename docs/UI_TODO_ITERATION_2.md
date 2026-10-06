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
- [ ] Add the real project creation/model-import workflow to this interface; the bundled sample selector is not arbitrary file upload.

- [ ] Resolve duplicate source room-code identities (Schependomlaan contains two `1.02 · toilet` records); preserve distinct IFC space GUIDs without guessing new room numbers.
- [ ] Review loading/memory/frame time on physical devices: the larger sample includes roughly 17 MB of detailed JSON and 4.7 MB of meshes.

## Workflow polish and acceptance

- [x] Improve empty states for new projects and updates without a selected work package.
- [x] Make component exploration accessible through a searchable list as well as pointer picking.
- [ ] Verify keyboard focus, panel open/close, dialogs, mobile capture and narrow/landscape layouts.
- [ ] Review long source room/component names, dense models, large issue lists and image loading/failure states.
- [ ] Design customer, PM, subcontractor and field-worker views on the same project model and record stream.
- [x] Keep generated evidence, local-only saving, human acceptance and formal inspection distinct.

## Verification record

Verified October 6, 2026:

- `cd web && npm run test`: **90 passing tests**, including project isolation, daily evidence/review, explicit work creation, source mesh identity and projected-camera corner checks.
- `cd web && npm run build`: production compilation succeeds.
- Frontend lint completes with warnings in retained legacy components; the active iteration files have no reported warnings.
- `cd backend && .venv/bin/pytest -q tests/test_models.py tests/test_bim_detail.py tests/test_project_model_workflow.py tests/test_seed.py`: **18 passing regression tests**.
- `cd backend && .venv/bin/pytest -q tests/test_apartment_upload.py`: **one passing real-file upload acceptance test**; its recorded source/flow results are in [UPLOAD_TEST.json](../samples/ifc/schependomlaan/UPLOAD_TEST.json).
- Ruff passes on the modified importer/audit/tests; `git diff --check` passes.

DOM and CPU geometry checks do not replace browser/device visual acceptance. Browser inspection remains unavailable under the saved local-URL access restriction.
