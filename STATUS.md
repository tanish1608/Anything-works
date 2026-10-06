# Current status — Placeholder AI

Updated October 6, 2026 after the designer UI and detailed BIM implementation. This inventory describes source and verification; it does not certify live AI accuracy.

## Current direction

The current identity is **Placeholder AI**, using the supplied angular P recreated as a vector, white on the dark workspace/showroom, with matching browser/PWA/app icons. Current product and mobile-handoff documents use the new name. See [brand assets](docs/BRANDING.md). Saved project records and model geometry remain unchanged.

AI checks daily construction updates against approved project context, flags mistakes or incomplete work, and updates progress and issues in 3D. The product spans construction stages; pre-drywall electrical review is one example.

The original implementation was built as SiteMesh. The UI now uses Placeholder AI branding and the designer's visual system. Internal identifiers and existing backend behavior remain in place.

## Design iteration 2 — October 6

The project switcher now opens a showroom at `/?screen=projects`: one large rotating interior source model, property facts and four cards visible in a viewport-sized grid. Preview-control buttons are removed; larger catalogs use explicit pages. Opening a project clears stale work context; cancel restores the original panel/fragment. The workspace renderer unmounts while the preview is open. Connected projects load through authorized APIs, empty projects open setup, and public card silhouettes summarize source bounds rather than field progress. Rotation pauses on interaction/backgrounding, respects reduced motion by default, and uses full-orbit fitting verified on wide/portrait CPU cameras.

The [mobile build prompt](docs/SUBCONTRACTOR_MOBILE_BUILD_PROMPT.md) is a self-contained handoff for Claude to build a minimal subcontractor PWA with 3D location context, photos/notes, account-scoped drafts, idempotent uploads and own history. The mobile app itself is not built; private uploads still need integration into the chosen PM panels.

Originally on `codex/design-iteration-2` and now merged into `main`, contextual panels use wider responsive proportions and larger photos. Projected camera fitting and 1.2 m explosion gaps keep the overview closer. The project selector adds Schependomlaan Apartments (3,504 components, six source levels and **100 distinct source spaces**), with isolated local records/drafts/history. All 100 outlines are recovered, including 94 explicit IFC FootPrint polylines; duplicate room codes retain separate IFC GUID identities. Existing local decisions tied to the former merged room are archived and require review rather than silently moving green progress.

The chosen interface now connects optional account authentication, actual project creation, IFC upload/conversion with resumable job identity, draft preview in its shared canvas, authorized 2D/GLB retrieval and explicit reference approval. Public samples remain open without sign-in. Private field capture is disabled: its evidence/review/correction persistence and actual actor integration are not delivered. Private API responses use network-only service-worker handling; historical shared API/model caches are cleared on session changes.

Public customer/PM/subcontractor/field-worker presentation previews share the same model and local record stream. Customers are read-only; crew lists/capture are assignment-scoped; PMs record decisions. These previews are not server permissions or customer-sharing controls. Search spans all statuses; work can be filtered by team and sorted by due date. Reassignment updates owner/deadline with a reason and preserves open issues. Component/property lists are searchable, source lists are paged, failed photos remain explicit, contextual focus is restored and draft typing does not rebuild scene colors/pins.

The arsenal now also includes the Medical-Dental Clinic (16,071 components, four source levels, 798 distinct space GUID records across disciplines) and Esplan Building (1,958 components, seven source levels, 285 source spaces). Both are attributed public IFC derivatives with reproducible import audits and no invented field progress. Clinic engineering files are coordination examples, not installed evidence; its space GUIDs do not establish 798 physical rooms. Sample-specific clinic building/floor aliases are recorded explicitly. Esplan preserves centimeter detail at large survey coordinates using local mesh vertices and precise source-world node translations.

Work & issues opens by default on entry and project overview; explicit deep links and panel dismissal retain their intent. Empty public projects lead to planned-work setup, while empty private records state that field synchronization is not connected. [Three fictional customer walkthroughs](docs/USER_STORIES.md) identify the next priorities: two-person crew-to-PM persistence/correction, reusable assigned work and capture guidance, reviewed source federation and device acceptance.

Verification: **121 frontend tests** and **22 targeted backend tests** pass, including model/detail/project/seed regressions, explicit floor aliases and survey-coordinate precision. The two added samples were imported through the isolated CLI workflow with AI off. Real GLB node identity, world bounds and picking are tested on the CPU. Earlier apartment API upload and disposable SQLite migration checks remain recorded; they were not rerun in this pass. Production compilation passes; lint completes with 20 retained warnings and no warnings in the changed active UI files. PostgreSQL execution and browser-rendered/physical-device acceptance were not verified. See [the UI checklist](docs/UI_TODO_ITERATION_2.md) and [client demo walkthrough](docs/CLIENT_DEMO.md).

## Current building-centered interface

The website now uses one large building canvas with optional contextual panels, replacing the previous tab-based layout. The current entry point is `web/src/workspace/Workspace.tsx`; `BuildingCanvas.tsx` keeps the same ProjectScene/SiteViewer mounted across selection, review, capture, history and team workflows. It starts with exploded source levels and an interior view. Floor controls, system toggles, source breadcrumbs, exterior visibility, fit, component isolation and 3D/2D controls sit inside the model surface.

Issue pins and work rows open photos, responsible team, source context, review/correction actions and recorded timelines in a right panel. Camera focus first includes the room's source components; explicit zoom narrows to the component. Source floor/space IDs and reviewed sample Unit A/B grouping drive the breadcrumbs; unknown unit associations are not invented. The latest submission photo opens first, retaining older evidence.

Daily update capture confirms the selected work location and follows target changes in the same model. Uploaded evidence creates the existing version-bound handoff and awaits review. Completion, open issues, evidence gaps and explicit review actions project from shared local records. Date replay and comparison use this same current design; they do not reconstruct historical design geometry or historical photo snapshots. Team availability, project naming and guarded local reset remain available in panels.

All 121 frontend tests pass, including single-viewer persistence, source hierarchy, current-photo selection, capture target movement, correction resolution, historical replay, offline identity and three.js pin ray hits. Production compilation passes. Lint has existing warnings in retained components; new workspace files have no reported warnings. Browser smoke tests are updated and discoverable but not run; real WebGL/mobile visual acceptance remains open under the saved browser-access restriction. Authentication remains disabled for testing. These UI changes do not connect a live agent or production multi-user persistence.

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

Public website samples remain open without an account or token and use a sample PM identity. Optional account connection/private model onboarding and public role presentation previews are now implemented inside the chosen UI. Private APIs retain server authentication and project permissions. Production customer sharing, persisted field records and their real actor/role scopes remain pending; public previews do not establish those permissions.

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
| Issues, notifications and history | `backend/app/api/`, `backend/app/services/` | New assessment-to-correction flow and consistent projections remain work |
| Authentication and scoped access | `backend/app/auth/`, `backend/app/rbac.py` | Extend the same controls to new records and derived AI outputs |
| Tests and evaluation harnesses | `backend/tests/`, `web/src/test/`, `web/e2e/`, `samples/` | 121 frontend tests and 22 targeted backend tests pass; browser E2E, physical acceptance and live AI evaluations were not run |

## Known migration gaps

1. **Completion versus acceptance.** Existing AI can propose installation status and can auto-approve using an opt-in project confidence threshold. The new product needs scoped AI-checked completion, separate human acceptance and formal inspection records. The legacy path is not the new completion policy.
2. **Repeated daily checking.** Fresh worker claims now reopen completed components for review. The legacy AI subsystem still skips already-done elements; full agent-driven daily assessment remains pending.
3. **Quality beyond presence.** Recognizing a visible component does not prove that its installation matches the plan, required measurements or code.
4. **Reference provenance.** The new flow requires per-assessment source snapshots, applicable approved changes and stale-result handling.
5. **Progress denominators.** Existing summaries count elements; this is not automatically physical, labor or schedule completion.
6. **Demo versus connected product.** The new daily workflow persists locally. Retained connected components use the existing API; full assessment and correction synchronization still requires integration.
7. **Field validation.** Real-site detection performance, user effort, customer savings and willingness to pay are not established.

## Remaining production work

- Guided daily assessment across multiple work items.
- Check-specific evidence requirements and supported completion policies.
- Reliable installation-to-plan comparison and coverage reporting.
- An integrated exception → correction → recheck → model update loop.
- Validated LiDAR measurements and jurisdiction-specific code assistance.
- Voice/video processing and external project-system integrations.
- A measured pilot with real customer outcomes.

## Verification and next work

The frontend passes 85 tests and production compilation. Frontend lint completes with existing warnings. Initial targeted import/progress verification passed 16 backend tests; final workflow/progress/history/legacy-vision regression verification passed 20 tests, with AI mocked/off. Ruff passes for the changed backend files. Tests include source hierarchy bindings, shared model projections, reversible floor expansion, camera sequencing, first-upload onboarding, offline revision identity, fresh-evidence reopening and stale submission/approval rejection. Browser visual acceptance remains unverified under the saved local-URL preference. No live AI evaluations were run.

Retained connected onboarding components implement a guided upload → review → approve flow, but are no longer exposed as website routes. Field queues retain their checklist revision; immutable upload audit events record revision, element and photo IDs. Old received retries stay idempotent. Evidence against a superseded baseline cannot approve work on the new model. The local demo prepares structured assessment requests; new agent execution is deferred. See [the model workflow](docs/MODEL_WORKFLOW.md).

Begin with **P0** in [TODO.md](TODO.md): examples, state contract, completion policy and screen flow. Follow [PLAN.md](PLAN.md) for dependencies. Update this file with actual checks and known limitations as implementation progresses.
