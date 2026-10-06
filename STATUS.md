# Current status — Placeholder AI

Updated October 6, 2026 after the shared daily workflow integration. This inventory describes source and verification; it does not certify live AI accuracy.

## Current direction

The root website/PWA now opens the project showroom. The workspace uses an explicit Switch project button, a non-interactive building name and a single wordmark. Project pulse/context are retired; user previews stay in the account menu and import starts from project home. Themed Sort/Team menus support keyboard selection and escape the scrolling panel; the preview-loading overlay stays inside the model area. A local 502 was reproduced with the API stopped; restarting port 8000 restored proxied health to 200 and protected project listing to the expected 401 without authentication. Connected-list failures also have sample-browsing/retry/disconnect recovery. Private APIs remain authorized.

## Shared daily workflow — October 6

The main gap identified in the review is now connected for **manual review**: actual PM/crew accounts share assigned source work, daily photos, evidence requests, issue assignment, fresh corrections, explicit human acceptance, progress history and 3D status. The chosen UI loads authorized server projections, refreshes on foreground/reconnect and polls every ten seconds. Public samples remain browser-local; they are not silently migrated into a private project.

`WorkPackage` and immutable intake/reference receipts reuse Upload/Photo, Issue, central RBAC and append-only Event history. Decisions use the actual actor and revision/update the PM opened; stale decisions fail. New approved references invalidate completion and require reconfirmation/fresh evidence. Legacy confidence-based AI approval and issue PATCH cannot bypass tracked-work decisions. Private evidence is fetched with authorization and no-store responses. The project team panel adds registered members, assignments use eligible actual accounts, and stored in-app notifications link into work records.

An account/project-scoped IndexedDB outbox preserves photos and stable UUIDs through retry; server receipt is required before review or model changes. Invalid/scope/reference submissions retain evidence for recovery. Private model loading still needs connectivity; full offline model viewing, physical camera/PWA acceptance and the standalone companion remain open.

See [shared workflow contracts and two-account rehearsal](docs/SHARED_DAILY_WORKFLOW.md). The full backend suite passes **139 tests** and the frontend suite passes **133 tests**. Production compilation and Ruff pass; frontend lint has retained warnings. These checks use disposable SQLite, API fixtures, DOM and CPU geometry; actual PostgreSQL, browser-rendered/phone acceptance and live AI accuracy are not verified. Cross-trade blockers, multi-item submissions, registered original sheets/specifications, released AI completion and formal inspection remain separate work.

The current identity is **Placeholder AI**, using the supplied angular P recreated as a vector, white on the dark workspace/showroom, with matching browser/PWA/app icons. Current product and mobile-handoff documents use the new name. See [brand assets](docs/BRANDING.md). Saved project records and model geometry remain unchanged.

AI checks daily construction updates against approved project context, flags mistakes or incomplete work, and updates progress and issues in 3D. The product spans construction stages; pre-drywall electrical review is one example.

The original implementation was built as SiteMesh. The UI now uses Placeholder AI branding and the designer's visual system. Internal identifiers and existing backend behavior remain in place.

## Design iteration 2 — October 6

The project switcher now opens a showroom at `/?screen=projects`: one large rotating interior source model, property facts and four cards visible in a viewport-sized grid. Preview-control buttons are removed; larger catalogs use explicit pages. Opening a project clears stale work context; cancel restores the original panel/fragment. The workspace renderer unmounts while the preview is open. Connected projects load through authorized APIs, empty projects open setup, and public card silhouettes summarize source bounds rather than field progress. Rotation pauses on interaction/backgrounding, respects reduced motion by default, and uses full-orbit fitting verified on wide/portrait CPU cameras.

The [mobile build prompt](docs/SUBCONTRACTOR_MOBILE_BUILD_PROMPT.md) is a self-contained handoff for Claude to build a minimal subcontractor PWA with 3D location context, photos/notes, account-scoped drafts, idempotent uploads and own history. The mobile app itself is not built; private work uploads now integrate into the chosen PM panels through the shared work contract; the standalone companion still needs building/device acceptance.

Originally on `codex/design-iteration-2` and now merged into `main`, contextual panels use wider responsive proportions and larger photos. Projected camera fitting and 1.2 m explosion gaps keep the overview closer. The project selector adds Schependomlaan Apartments (3,504 components, six source levels and **100 distinct source spaces**), with isolated local records/drafts/history. All 100 outlines are recovered, including 94 explicit IFC FootPrint polylines; duplicate room codes retain separate IFC GUID identities. Existing local decisions tied to the former merged room are archived and require review rather than silently moving green progress.

The chosen interface now connects optional account authentication, actual project creation, IFC upload/conversion with resumable job identity, draft preview in its shared canvas, authorized 2D/GLB retrieval and explicit reference approval. Public samples remain open without sign-in. Private field capture/review/corrections now use the authenticated shared workflow described above; live checks remain disabled. Private API responses use network-only service-worker handling; historical shared API/model caches are cleared on session changes.

Public customer/PM/subcontractor/field-worker presentation previews share the same model and local record stream. Customers are read-only; crew lists/capture are assignment-scoped; PMs record decisions. These previews are not server permissions or customer-sharing controls. Search spans all statuses; work can be filtered by team and sorted by due date. Reassignment updates owner/deadline with a reason and preserves open issues. Component/property lists are searchable, source lists are paged, failed photos remain explicit, contextual focus is restored and draft typing does not rebuild scene colors/pins.

The arsenal now also includes the Medical-Dental Clinic (16,071 components, four source levels, 798 distinct space GUID records across disciplines) and Esplan Building (1,958 components, seven source levels, 285 source spaces). Both are attributed public IFC derivatives with reproducible import audits and no invented field progress. Clinic engineering files are coordination examples, not installed evidence; its space GUIDs do not establish 798 physical rooms. Sample-specific clinic building/floor aliases are recorded explicitly. Esplan preserves centimeter detail at large survey coordinates using local mesh vertices and precise source-world node translations.

Work & issues opens by default on entry and project overview; explicit deep links and panel dismissal retain their intent. Empty public projects lead to planned-work setup, while empty private records direct managers to assigned-work setup without inventing installed progress. [Three fictional customer walkthroughs](docs/USER_STORIES.md) identify the next priorities: two-person crew-to-PM persistence/correction, reusable assigned work and capture guidance, reviewed source federation and device acceptance.

Verification: **133 frontend tests** pass after shared daily integration. The full **139-test backend suite** includes issue/progress/model-workflow, model/detail/project/seed and disposable migration checks. Those earlier checks cover explicit floor aliases and survey-coordinate precision. The two added samples were imported through the isolated CLI workflow with AI off. Real GLB node identity, world bounds and picking are tested on the CPU. The shared workflow tests import and approve a real IFC through the API; the migration suite ran against disposable SQLite. Production compilation passes; lint completes with 20 retained warnings and no warnings in the changed active UI files. PostgreSQL execution and browser-rendered/physical-device acceptance were not verified. See [the UI checklist](docs/UI_TODO_ITERATION_2.md) and [client demo walkthrough](docs/CLIENT_DEMO.md).

## Duct-blocker scenario assessment

The [tested customer story](docs/DUCT_BLOCKER_STORY_TEST.md) exercises local reporting/manual triage, HVAC correction and explicit PM review on a real clinic source component, with backend account/assignment/attachment/notification checks tested separately. The subsequent shared-workflow pass also connects and tests authenticated field capture/review/correction in the chosen UI. A reproduced backend bug cleared model warnings on `resolved` before closure; resolved issues now remain counted until `closed`. The original warning projection fix is now followed by connected manual crew-to-PM field UI; live AI is still pending. Cross-trade reporting, linked downstream blockers, broader correction/check policies, contracts/budget and owner communication remain gaps. Original story verification used 14 targeted backend tests; the subsequent full run passes 139 backend and 133 frontend tests, production build and Ruff; frontend lint completes with retained warnings.

## Current building-centered interface

The website now uses one large building canvas with optional contextual panels, replacing the previous tab-based layout. The current entry point is `web/src/workspace/Workspace.tsx`; `BuildingCanvas.tsx` keeps the same ProjectScene/SiteViewer mounted across selection, review, capture, history and team workflows. It starts with exploded source levels and an interior view. Floor controls, system toggles, source breadcrumbs, exterior visibility, fit, component isolation and 3D/2D controls sit inside the model surface.

Issue pins and work rows open photos, responsible team, source context, review/correction actions and recorded timelines in a right panel. Camera focus first includes the room's source components; explicit zoom narrows to the component. Source floor/space IDs and reviewed sample Unit A/B grouping drive the breadcrumbs; unknown unit associations are not invented. The latest submission photo opens first, retaining older evidence.

Daily update capture confirms the selected work location and follows target changes in the same model. Uploaded evidence creates a version-bound handoff and awaits review. Public samples project from local records; private work projects from the shared server. Private history includes immutable work/evidence snapshots; public history replays recorded status. Both use current design geometry. Public team availability and guarded local reset remain local; private team identity/contacts use actual membership.

All 133 frontend tests pass, including single-viewer persistence, source hierarchy, current-photo selection, capture target movement, correction resolution, historical replay, offline identity and three.js pin ray hits. Production compilation passes. Lint has existing warnings in retained components; new workspace files have no reported warnings. Browser smoke tests are updated and discoverable but not run; real WebGL/mobile visual acceptance remains open under the saved browser-access restriction. Public testing samples remain sign-in free. Private daily records use actual accounts and server persistence; a live agent and production operations acceptance remain pending.

See [the current handoff](docs/BUILDING_WORKSPACE.md). The earlier implementation notes below describe retained foundations and the route migration history; their page layouts are no longer the current website.

## Designer UI implementation

The main website at `/` implements Home, Work & Issues, comparison/review, corrections, Building, Logs, People, Setup and mobile capture/results. Home has a record-based daily summary above a model on the left and grouped work pins on the right. Selecting either side focuses/selects the corresponding record. KPI cards, status badges, legends and the floating mascot are removed from Home. Home, Logs and Building use the same imported public duplex through the shared ProjectScene/SiteViewer controller. Fourteen newly defined sample work packages reference its actual component, room and level IDs. Home starts with the entire building, separates floors before focusing a selected component and restores the whole building on request. Component-centre pins are model context, not photo registration.

People includes search, contacts, teams, an explicit sample reporting hierarchy and locally persisted availability. Logs provides a calendar, daily activity, date comparison, side-by-side status projections and export. Earlier dates show only recorded statuses; later completion is never backdated. Existing signed report snapshots are retained in exports. Daily Report is removed; old bookmarks redirect to Logs.

Retained connected Home code (no longer a public route) loads authorized GLBs and elements, uses saved issue locations, switches to an issue's model revision when needed and identifies unlocated records. Connected People uses actual membership/email records; phone, availability and reporting lines are not recorded yet. Connected Logs compares paginated events and replays recorded status/provenance on current project geometry; it does not recreate historical design geometry or all issue reopening intervals. Those older connected screens are removed from the public route tree. Both summaries are clearly labeled as record-based; no live daily-summary AI agent is connected.

See [design implementation notes](docs/design/ui/IMPLEMENTATION.md). Browser visual checks were blocked by a saved local-URL browser-access preference; responsive rendering and real WebGL interaction need review.

The workspace header uses separate identity/action and navigation rows, with consistent controls across routes and a compact mobile layout. The global demo banner and Public BIM project badge are removed; source attribution and generated-evidence labels remain.

## Single public website

The former `/demo` UI is now the main website at `/`. All workspace links use root URLs. Old `/demo/...` bookmarks redirect with their query and fragment intact; old login/private-project/QR/embed screens are retired. The public app no longer mounts an authentication provider or imports the older page tree. Existing local storage keys are unchanged, so records survive the move. The PWA starts at Home; production Nginx already supports SPA deep links.

Canonical routing, navigation, bookmark preservation, saved-record persistence and retired-screen behavior are covered by DOM tests. Browser smoke tests now target the chosen website; previous connected-app tests are archived and excluded. The smoke suite has not been run under the saved browser restriction. The URL change does not make browser-local records a connected production service.

Public website samples remain open without an account or token and use a sample PM identity. Optional account connection/private model onboarding and public role presentation previews are now implemented inside the chosen UI. Private APIs retain server authentication and project permissions. Private field records and actual role/actor scopes now use the shared workflow. Production customer sharing and operations acceptance remain pending; public previews do not establish those permissions.

## Implemented foundations

P3 now has a detailed public duplex import: 1,282 rendered elements, 22 spaces, four levels and six discipline layers. The default `/building` page uses a full-width canvas with only Level, View and Layers controls and a corner preview for switching 3D/2D. Both sidebars and the project tabs are removed from this everyday view. The retained BIM workbench source contains detailed properties, inspection authoring and local review controls; its old `/bim-lab` URL now redirects to Building. All public workspace views now use this duplex; old illustrated-unit links open the building overview without inventing a room association. Legacy Hawthorne data remains under its original storage key. An optional seed adds the detailed project to the authorized connected app. See [the BIM audit](docs/BIM_AUDIT.md) for extraction results and source attribution.

Imported and connected model views default to an interior view: tagged exterior walls and roof are hidden, shared/untagged walls remain visible, and architecture renders solid. Visibility and transparency controls restore the shell or ghost context. The duplex roof slab's IFC predefined type is preserved; no source geometry changes.

IFC2x3 type classification, property truncation and duplicate room-name merging are fixed. Connected pins now retain their model version; progress projections distinguish actual human acceptance from legacy automatic approvals. Original PDF/CAD references and generated plans are separate; an unaligned sheet cannot silently locate work in 3D. Live automatic completion and exact photo localization are still pending.

| Foundation | Source location | Important limit |
|---|---|---|
| Designer daily-update demo | `web/src/workspace/`, root website `/`; geometry in `web/src/viewer/ProjectScene.tsx` | Fictional records and generated images; browser-local state; sample checking and notifications are simulated |
| Retained connected project components | `web/src/pages/` | Not mounted in public routing; available for integration into the chosen interface |
| IFC import and GLB generation | `backend/app/bim/` | A model is context, not evidence of actual installed quality |
| DXF and vector-PDF conversion/review | `backend/app/conversion/` | Generated sample results do not establish general real-plan accuracy; DWG is unsupported |
| 3D viewer and model controls | `web/src/viewer/`, `/building` | Detailed import, component inspection/pins/plans and saved progress projection implemented; live scoped AI completion and WebGL/device visual acceptance remain open |
| Photo uploads and offline queue | `web/src/field/`, `backend/app/services/photos.py` | Device and production offline behavior need validation for the new flow |
| Evidence-backed progress and review | `backend/app/services/progress.py` | Existing `done` semantics need separation into observed completion and acceptance |
| AI photo-analysis integration | `backend/app/vision/`, `backend/app/services/vision_jobs.py` | Installed/missing/not-visible/uncertain results; not validated broad plan compliance |
| Issues, notifications and history | `backend/app/api/`, `backend/app/services/workflow.py` | Manual evidence-to-correction flow is connected; live AI checks and cross-trade dependencies remain open |
| Authentication and scoped access | `backend/app/auth/`, `backend/app/rbac.py` | Extend the same controls to new records and derived AI outputs |
| Tests and evaluation harnesses | `backend/tests/`, `web/src/test/`, `web/e2e/`, `samples/` | 133 frontend tests and 139 backend tests pass; browser E2E, physical acceptance and live AI evaluations were not run |

## Known migration gaps

1. **Completion versus acceptance.** Existing AI can propose installation status and can auto-approve using an opt-in project confidence threshold. The new product needs scoped AI-checked completion, separate human acceptance and formal inspection records. The legacy path is not the new completion policy.
2. **Repeated daily checking.** Fresh worker claims now reopen completed components for review. The legacy AI subsystem still skips already-done elements; full agent-driven daily assessment remains pending.
3. **Quality beyond presence.** Recognizing a visible component does not prove that its installation matches the plan, required measurements or code.
4. **Reference provenance.** Manual submissions retain source snapshots and reject stale approval/reference use. Applicable specification/check context for AI still needs implementation.
5. **Progress denominators.** Existing summaries count elements; this is not automatically physical, labor or schedule completion.
6. **Demo versus connected product.** Public samples persist locally; authenticated manual work uses shared server records. Live AI assessment and physical two-device acceptance remain open.
7. **Field validation.** Real-site detection performance, user effort, customer savings and willingness to pay are not established.

## Remaining production work

- Guided daily assessment across multiple work items.
- Check-specific evidence requirements and supported completion policies.
- Reliable installation-to-plan comparison and coverage reporting.
- Released AI rechecking within the connected manual exception → correction → review → model update loop.
- Validated LiDAR measurements and jurisdiction-specific code assistance.
- Voice/video processing and external project-system integrations.
- A measured pilot with real customer outcomes.

## Earlier verification and next work

The following records the earlier UI/model pass; the current full-suite verification is listed above.

The frontend passes 85 tests and production compilation. Frontend lint completes with existing warnings. Initial targeted import/progress verification passed 16 backend tests; final workflow/progress/history/legacy-vision regression verification passed 20 tests, with AI mocked/off. Ruff passes for the changed backend files. Tests include source hierarchy bindings, shared model projections, reversible floor expansion, camera sequencing, first-upload onboarding, offline revision identity, fresh-evidence reopening and stale submission/approval rejection. Browser visual acceptance remains unverified under the saved local-URL preference. No live AI evaluations were run.

Retained connected onboarding components implement a guided upload → review → approve flow, but are no longer exposed as website routes. Field queues retain their checklist revision; immutable upload audit events record revision, element and photo IDs. Old received retries stay idempotent. Evidence against a superseded baseline cannot approve work on the new model. The local demo prepares structured assessment requests; new agent execution is deferred. See [the model workflow](docs/MODEL_WORKFLOW.md).

Begin with **P0** in [TODO.md](TODO.md): examples, state contract, completion policy and screen flow. Follow [PLAN.md](PLAN.md) for dependencies. Update this file with actual checks and known limitations as implementation progresses.
