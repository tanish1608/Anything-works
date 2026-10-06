# Implementation backlog — Placeholder AI

Updated October 6, 2026 after rebuilding the website around one central building and contextual workflow panels. Checked items identify completed work and explicitly state when it is limited to local samples or retained components. Unchecked items remain open; existing foundations and verification limits are in [STATUS.md](STATUS.md).

Product scope: AI checking daily updates across construction stages, identifying mistakes and incomplete work, and updating completion and issues in 3D. Before-drywall checking is one use case.

Owners are suggested contributor roles, not assignments. Each package needs a named owner when coding begins. Requirements R1–R10 are defined in the [product specification](docs/PRODUCT_SPEC.md).

The UI-only iteration backlog is [Design iteration 2](docs/UI_TODO_ITERATION_2.md). It tracks proportions/camera, four audited source projects, sample switching, component exploration and remaining visual acceptance.

## Building-centered workspace — current UI, October 6

- [x] Rebrand to Placeholder AI using the supplied angular P: workspace/showroom wordmarks, browser/PWA identity and app icons, current docs and mobile handoff. Keep saved project identities and workflows stable.

- [x] Fit the showroom to the viewport with four visible cards, default interior/rotation and no preview buttons. Open Work & issues by default; preserve explicit panel dismissal and deep links.
- [x] Import/audit clinic (16,071 components) and Esplan (1,958 components), with project isolation, explicit federation labels, preserved survey-coordinate precision and real GLB identity/bounds/picking tests.
- [x] Write [customer stories and workflow review](docs/USER_STORIES.md); improve empty-site and empty-attention guidance from the walkthroughs.

- [x] Add a rotating source-building project showroom with property facts, viewport selection grid, explicit open/cancel and authorized private previews; preserve project-local records and show only one WebGL scene at a time.
- [x] Write the standalone [subcontractor mobile build prompt](docs/SUBCONTRACTOR_MOBILE_BUILD_PROMPT.md) for a minimal daily-update PWA with 3D context and actual API contracts.
- [ ] Build/test that mobile companion on physical phones and integrate its authenticated evidence into the chosen PM panels; the handoff document does not complete this integration.

This supersedes the earlier tab-based Home/Logs/Building layout. The building is the website: one persistent model canvas with optional contextual panels on the right (below the canvas on small screens). The earlier implementation sections below describe retained foundations, not the current navigation.

- [x] Replace page tabs and permanent sidebars with a large central building, compact header, floating floor controls and source-system toggles.
- [x] Keep one ProjectScene/SiteViewer mounted across issue review, daily updates, history, teams and project context; preserve the renderer when switching to 2D.
- [x] Start with exploded source levels and interior visibility; retain exterior-wall, fit and selected-component isolation controls.
- [x] Navigate building → floor → unit → room → source component. Use the reviewed public duplex A/B room grouping; do not invent unit numbers or guess unit associations for uploaded models.
- [x] Link model pins and work rows to a room-context camera focus, then offer an explicit tighter component zoom.
- [x] Open issue photos, current evidence, model-derived reference, responsible team, review actions and recorded timeline in the same contextual panel.
- [x] Select the latest submission's photo by default while preserving earlier evidence and decisions.
- [x] Require location confirmation, photos and a note for side-panel updates; move the model when capture changes to another work item.
- [x] Preserve drafts/offline update identity and source revision; fresh evidence reopens review. Uploaded photos do not run the sample AI simulator or automatically complete work.
- [x] Support evidence requests, confirmed issue assignment, acceptance, correction rejection, explicit resolution and reopening with recorded reasons; model colors follow the same local records.
- [x] Replay dated progress on this same model, compare recorded statuses and export daily history; historical geometry/evidence reconstruction remains separate future work.
- [x] Provide team/contact/availability and project-name/source-context panels; retain local record keys and guarded reset.
- [x] Redirect old page bookmarks to root query-state panels, preserving work selections and fragments.
- [x] Add DOM workflow tests for the persistent viewer, source hierarchy, capture target changes, review/history and offline handoffs; verify pin body/centre picking with real three.js CPU ray tests. All 85 frontend tests and production compilation pass.
- [ ] Review the dark theme, real WebGL camera paths/pins and responsive layout on desktop and physical phones. Renderer-stub/CPU tests do not establish visual acceptance.
- [x] Connect model reference approval to source-location invalidation: a changed room/floor association reopens prior completion even when geometry is unchanged.
- [ ] Integrate precise surface-point pin placement into the chosen capture/record UI; current public work pins use component centers. Retained viewer/API point support is a foundation.
- [x] Add searchable/paged keyboard access to source components and contextual panel focus/restoration.
- [ ] Complete physical keyboard/screen-reader acceptance of the spatial explorer.
- [x] Connect optional authenticated project creation/IFC import, draft preview and explicit model approval in this interface.
- [ ] Bring reviewed unit metadata and persistent evidence/review/correction records with real actor/role scopes into this canvas/panel interface; keep customer and trade views on the same model rather than adding separate model pages.

See [the building workspace handoff](docs/BUILDING_WORKSPACE.md) for UI behavior, source files and remaining integration boundaries.

See [the client demo walkthrough](docs/CLIENT_DEMO.md) for current capability boundaries and rehearsal checks.

### Next integration priorities from the stories

- [x] Test the [duct-blocks-panel story](docs/DUCT_BLOCKER_STORY_TEST.md): local PM/crew/correction/review on an actual clinic component, plus retained API assignment/evidence/notifications and cross-trade scope boundary. Keep backend warnings until explicit issue closure.
- [ ] Add scoped cross-trade obstruction reports and linked blocked work, preserving reporter, correcting crew and affected task owner separately. Acceptance: HVAC correction/review resumes the panel task with reporter confirmation/notification; it never completes panel installation.
- [ ] Enforce fresh correction evidence/review requirements on connected issue closure, including original-reporter permissions; do not rely solely on UI gates.

- [ ] Connect authenticated crew uploads to the chosen PM queue and return correction requests to the actual assignee. Acceptance: two accounts on separate devices complete one traceable issue journey with server IDs and real actors.
- [ ] Define reusable trade/location work packages and required capture views before crews begin. Avoid asking crews to recreate title/owner/context on each daily update.
- [ ] Support one update covering multiple work items, with outcomes/evidence scoped per item; a single photo cannot complete an entire room.
- [ ] Add reviewed client-facing federation, unit/room association and duplicate-space reconciliation. Expose aliases/units/source coverage during draft review; never silently merge room identities or retain affected old green.
- [ ] Attach actual approved sheets/details/spec revisions and requested evidence views; model-derived silhouettes are contextual references, not those authoritative documents.
- [ ] Add traceable safety/impact/dependency prioritization and actual correction notifications; evaluate them with qualified site users.
- [ ] Measure large-model loading/memory on target devices. The clinic has about 59 MB of detailed metadata and 52 MB of meshes; consider lazy properties/layers and LOD from measured results.


## Current testing setup and next priorities

The chosen website is `/`, with one building canvas and contextual project pulse, work/issues, history, team, project context and capture panels. Authentication is disabled for this browser-local testing experience: no account, token or sign-in is required. The public view uses a sample PM identity/model and offers user-experience previews. Optional private model onboarding connects an account inside the same UI. Backend APIs retain their existing authentication and project permissions; the website does not bypass them or load private projects anonymously.

- [x] Open the root website and its pages without an authentication provider or sign-in gate; redirect the retired `/login` URL to Home.
- [x] Preserve saved browser records when moving from `/demo` to root URLs.
- [ ] Build and review the customer, contractor/PM and subcontractor views described below; keep PM as the default testing view until then.
- [ ] Connect real project creation/selection, import/review and work records inside this chosen UI. Retained backend components are foundations, not active website screens.
- [ ] Replace the sample PM identity with the signed-in project member when connected; record the actual actor on decisions, uploads and history.
- [ ] Restore sign-in, invitations and server-enforced project/role scopes in this UI before enabling real multi-user project data; keep any sample-only preview explicitly separate from private records.
- [ ] Connect traceable assessment jobs after persisted evidence, reference revisions, review and correction workflows are working.

Suggested order: shared capture/review/correction persistence → approved drawing/detail context → scoped user access → assessment integration → field/device acceptance. Role screens are still planned; the existing website is the shared PM testing experience.

## Completed in the designer implementation

- [x] Implement Home, Work & Issues, review, correction, Building, Logs, People, Setup, capture and result screens in React; now the main website at `/`.
- [x] Apply the designer's typography, colors and navigation; bundle fonts and supplied sample images locally.
- [x] Implement retained connected Home components using authorized API records; their former `/p/:pid/home` route is retired from the public website.
- [x] Verify the redesigned frontend with 85 passing tests, production compilation and lint completion with warnings. Tests use mocked APIs and a stubbed 3D renderer; browser/device verification remains open.
- [x] Document routes, interactions, fixture boundaries and implementation files in [the implementation guide](docs/design/ui/IMPLEMENTATION.md).

The detailed completed demo interactions are checked in the packages below. No production backend package or live AI capability is complete merely because its demo works.

## Home, People and Logs redesign — October 6

- [x] Rename Today to Home; remove Daily Report from navigation and redirect old report bookmarks to Logs.
- [x] Replace Home KPI cards, status badges, legends and extra panels with a daily summary above a model on the left and grouped work pins on the right.
- [x] Link list selections to camera focus and model pins back to the matching record, using version-bound component locations; retain evidence/decision detail pages.
- [x] Keep only fit/open controls on the Home model; detailed controls remain in Building.
- [x] Add People search, contacts, team grouping and an explicit sample PM → trade-lead hierarchy. Persist availability settings locally in the demo.
- [x] Show authorized project members and contact emails in connected People; keep membership administration under Manage project access.
- [x] Add a Logs calendar, daily event history, date comparisons and export in the demo. Reconstruct only recorded statuses; show completion in green and preserve reopenings.
- [x] Add connected Logs with paginated authorized events, date comparison and links to evidence/model locations; label partial history.
- [x] Use actual authorized model geometry and version-bound issue pins in connected Home, with interior defaults and explicit unlocated-record handling.
- [ ] Connect a traceable live AI daily-summary service. Current summaries are generated from records and labeled accordingly.
- [ ] Persist real contact phone numbers, team reporting lines and availability through project APIs; connected unknown fields remain not recorded.
- [x] Replay recorded component status and completion provenance in connected Logs on current geometry.
- [ ] Reconstruct historical design revisions, per-assessment evidence and complete issue reopening intervals in connected Logs.
- [ ] Review Home, People and Logs on desktop/mobile and with real WebGL; renderer-stub tests do not establish visual acceptance.

## Single website and canonical routing — October 6

- [x] Make the chosen workspace the root website; remove the older auth/project/field/embed screens from public routing.
- [x] Move every workspace link to root URLs, including capture, results, reviews, corrections, model focus and reset.
- [x] Redirect old `/demo/...` bookmarks while preserving queries/fragments; do not reinterpret private project IDs as sample records.
- [x] Preserve existing local records and availability keys; set PWA launch/scope to `/`.
- [x] Verify canonical navigation, deep links, saved records and retired-route behavior in DOM tests; update the production build and route documentation.
- [x] Archive obsolete connected-app browser tests and replace the active E2E suite with website smoke tests.
- [ ] Run the updated browser smoke suite and review real desktop/mobile rendering when browser access is available.

## Header cleanup — October 6

- [x] Separate project identity/actions from navigation so header items stay aligned; keep the same controls on Building, Home and Logs.
- [x] Remove the global demo banner, project badge and redundant demo-summary labels; preserve source credit and generated-evidence labels.
- [x] Keep project names visible on mobile with truncation, and retain the mobile navigation menu.

## Unified model and correct project workflow — October 6

- [x] Use one imported dataset and shared ProjectScene/SiteViewer on demo Home, Logs and Building; remove the procedural-unit model from these routes.
- [x] Start Home with the whole building; separate levels before focusing a pin and collapse/fit on request.
- [x] Define source building/level/space/component bindings for every sample work item; use stable IDs and preserve model-frame coordinates.
- [x] Replace the demo's schematic references with linked model-derived plans. Retain generated-photo labels and keep approved drawing files distinct.
- [x] Share component progress and pin projections; open issues and incomplete scope prevent green.
- [x] Add connected project onboarding: create → IFC draft import → hierarchy/3D/2D review → explicit PM/owner baseline approval → field capture.
- [x] Retain revision IDs in field checklists and offline uploads; record immutable version/element/photo handoffs. Reject stale submissions and stale approval requests while retaining received retry identity.
- [x] Reopen completed work on fresh worker claims. Prepare local structured requests, supersede older pending updates and keep offline synchronization idempotent.
- [x] Preserve old illustrated-project storage instead of reinterpreting its photos and locations as duplex evidence.
- [ ] Connect the new AI assessment agent and released check policies to the prepared handoff; actual uploaded photos currently await review.
- [ ] Complete real WebGL and mobile-device visual/capture acceptance.

## Next work after the UI implementation

- [ ] Review the screens with the designer and teammates; record usability feedback before marking the UX package accepted.
- [ ] Visually verify desktop/mobile layouts, real WebGL rendering, keyboard navigation and dialogs. Browser review was blocked by the saved local-URL access preference during implementation.
- [ ] Test camera capture, photo resizing, storage limits, reconnect and PWA caching on actual iPhone and Android devices.
- [ ] Connect the new workspace to authorized project APIs instead of its local fixture store, following P0.2 and P1 inside the chosen UI; keep sample records and simulated results explicitly identified.
- [ ] Replace illustrated reference comparisons with authorized plan/detail files and per-assessment source revisions.
- [ ] Connect real assessment jobs and correction rechecks; keep real uploads unassessed until a traceable result or explicit human review exists.
- [ ] Connect issue assignments and follow-ups to real delivery/notification records instead of simulated demo delivery.
- [x] Split the frontend inspection routes and 3D engine into separate bundles; the production build no longer reports an oversized main bundle.
- [ ] Resolve the remaining route-menu reset and WebGL-fallback lint warnings.

## Role-specific user views — public previews implemented; production scopes pending

Use one project, one model revision and the same work/evidence records, with different summaries, navigation and permitted actions. A role view filters the shared model and pins; it must not create a different building or a second progress history.

| User | Home and main views | Intended actions and scope |
|---|---|---|
| Customer / client / homeowner | Simple project summary, shared milestones, approved photos, shared issues and a read-only building/progress view | Read project information explicitly shared with the customer; ask questions and make customer decisions only when requested. No internal review queue, team administration, private contractor notes or installation approval. |
| General contractor / project manager / superintendent | Current building canvas with project pulse, work pins, exception/evidence/history and team panels; project/model setup where permitted | Plan and assign work, review evidence, request corrections, accept or reject proposals, explicitly resolve issues and approve design baselines where authorized. Contractor business administration is separate from day-to-day PM review. |
| Subcontractor / trade lead | Assigned trade work, affected rooms/floors, due corrections, relevant plans, own-team updates and progress | Submit evidence, coordinate the assigned crew and respond to findings within assigned trade/location scope. No cross-trade approval, unrelated commercial data, membership administration or baseline release. |
| Field worker / crew member | Mobile-first assigned tasks, reference/location confirmation, capture, drafts, queue status and follow-up requests | Upload photos/notes and correction evidence for assigned work; see whether an update is queued, received or awaiting review. No project administration or approval actions. |
| Invited architect / engineer / inspector — later | Relevant drawings, assigned technical questions, inspection/evidence context and a scoped model | Comment or record a technical/formal decision only within the granted scope. AI results remain distinct from an authoritative inspection record. |
| Company / project administrator — later | Projects, invitations, teams, role/location scope and settings | Manage access and configuration explicitly granted to the administrator; do not implicitly grant construction acceptance authority. |

- [ ] Agree on the initial role/action matrix and customer-visible fields with the team; ship customer, contractor/PM and subcontractor experiences first.
- [x] Implement public PM/customer/subcontractor/field-worker presentation previews: customer read-only, crew-assigned work/capture, PM decisions and one persistent model.
- [ ] Review customer sharing/release fields and field capture on real phones; public previews are not private permission enforcement.
- [x] Reuse the persistent building canvas and shared local records with role-aware projections and consistent evidence/progress provenance in public previews.
- [ ] Define customer sharing/release controls, customer questions and requested decisions; identify which milestones and evidence are visible before sharing them.
- [ ] Scope subcontractor and worker work lists, model components, plans, evidence and contacts by project membership, trade and assigned locations.
- [ ] Distinguish client/customer access from the existing backend `owner` role. Existing roles are `owner`, `pm`, `trade` and `viewer`; design any new role/permission migrations explicitly rather than giving clients administrative owner permissions.
- [ ] Add a sample-only role preview for teammate testing; changing the preview must not grant backend access, change geometry or fabricate a signed-in reviewer.
- [ ] Connect role and identity selection to authorized project membership once authentication returns; preserve the chosen interface and root routes.
- [ ] Enforce scopes in APIs and model/evidence/source-file access as well as in UI actions. Hiding a menu alone is not permission enforcement.
- [ ] Verify allowed and denied actions, direct/deep links and shared-device behavior for every role; ensure no cross-project or cross-trade data leaks.

**Done when:** each initial user can complete their own daily journey in the same project, all views agree on recorded progress, and the server enforces the documented scope when connected. A sample role preview alone does not complete this package.

## P0 — Define and prepare

### P0.1 Product and field examples — product + construction reviewer

- [ ] Interview prospective GCs, superintendents and trade leads about their actual daily-update/review process.
- [ ] Confirm buyer, field user, cost bearer, current tools and the most costly recurring mistakes.
- [ ] Collect permissioned examples from more than one construction stage; include correct, partial, defective and uncheckable work.
- [ ] Select a small initial check catalog based on evidence quality and repeatability, without defining the product as one trade or one milestone.
- [ ] Record what each photo can and cannot establish and what needs testing or in-person review.
- [ ] Agree on pilot access and evidence retention; do not put private jobsite data into public samples.

**Done when:** each candidate check has an explicit requirement, capture instructions and expert-labeled examples, and unresolved assumptions are recorded.

### P0.2 State and completion contract — backend + AI + product

- [ ] Map current Upload/Verification/Element/Issue data to proposed update, assessment and review records.
- [ ] Define processing, coverage, observed progress, check results, human acceptance and inspection as separate states.
- [ ] Define automatic completion eligibility per check and required-item aggregation.
- [ ] Specify how issues override completion visually and how contradictory evidence reopens review.
- [ ] Plan migration of legacy `done` and confidence-based auto-approval records without inventing human acceptance.
- [ ] Design versioned result schemas and sample API payloads for frontend work.

**Done when:** R1–R8 can be traced through example state transitions, including incomplete evidence, stale plans and an already-complete item.

### P0.3 UX and demo script — design + frontend

- [x] Implement designer screens for mobile submission, update result, exception inbox, comparison panel and issue correction in the local demo.
- [x] Define shared labels, icons, demo 3D color precedence and a 2D unit-selection fallback.
- [ ] Verify the fallback and controls for accessibility with keyboard and assistive technology.
- [ ] Script a daily update with a supported completion, a mistake and an evidence request across at least two stages.
- [x] Reuse Studio geometry/icons and document local demo behavior separately from connected features.
- [x] Label sample evidence, fixture AI and simulated notifications in the demo.

**Done when:** a teammate can explain the full workflow and the difference between AI completion and inspection approval from the prototype screens.

Design references and screens awaiting team review: [docs/design/ui](docs/design/ui/README.md). Completed implementation tasks above do not close the package's usability acceptance.

The designer screens now form the website at `/`; see [implementation notes](docs/design/ui/IMPLEMENTATION.md). Local review/correction/capture behavior is available. Retained connected components are available for integration into this UI. Backend persistence, live checking, role-specific views, field validation and teammate review remain separate acceptance work.

## P1 — Daily workflow

### P1.1 References and work context — backend + frontend (R1, R8)

- [ ] Store applicable approved plan/detail revisions, specifications and approved changes for each check.
- [ ] Add explicit work-package and room/element associations.
- [ ] Expose a source comparison view; show missing dimensions or ambiguous references.
- [ ] Require location confirmation when automatic mapping is uncertain.
- [ ] Define affected-check invalidation for approved drawing changes.

**Done when:** every assessable work item has a retrievable source snapshot; ambiguous or stale references cannot complete work.

### P1.2 Capture and synchronization — frontend + backend (R2, R9)

- [x] Build a single-work-item photo/text submission with a separate worker claim in the local demo.
- [ ] Support multiple work items per submission and persist submissions through the backend.
- [ ] Add check-specific capture guidance and retake requests.
- [x] Persist local demo drafts and preserve the same update ID when moving a queued submission to local review.
- [ ] Persist stable client IDs across real upload retries and reconcile them with server receipts.
- [ ] Reconcile queued, uploading, received, checking and failed states.
- [ ] Make upload/job retries idempotent and preserve partial upload recovery.
- [ ] Test mobile camera/file selection, reconnect, duplicate submission and interrupted upload.
- [ ] Verify access control for every attachment, location and derived result.

**Done when:** a submission survives network loss, appears once on the server, and never appears checked while only stored locally.

### P1.3 Review foundation — frontend + backend (R3, R5)

- [x] Build daily update detail and exception inbox against deterministic assessment fixtures.
- [x] Show sample evidence beside illustrated references with fixture revision labels and check scope.
- [ ] Show real approved plan/details and persist their assessment-specific source snapshots.
- [x] Add local request-evidence, confirm-finding, dismiss-with-reason and human-accept actions.
- [x] Persist demo decision actors, reasons and timestamps locally; preserve prior assessment snapshots after new submissions.
- [ ] Persist authenticated decisions and superseded results on the server with authorization and append-only history.

**Done when:** a reviewer can reach a decision with context and the history explains how it was made.

## P2 — AI assessment and progress

### P2.1 Analysis pipeline — AI + backend (R1, R3, R9)

- [ ] Reuse the current model adapter behind a new check-oriented structured result contract.
- [ ] Add capture-quality and visibility outcomes.
- [ ] Validate returned item IDs, evidence references, source references and result enums server-side.
- [ ] Distinguish absence from occlusion and unsupported checks from no discrepancy detected.
- [ ] Include approved changes in comparison context.
- [ ] Treat instructions found in uploaded documents or images as data, not system instructions.
- [ ] Store model, prompt, check and policy versions with each run.
- [ ] Add retry, timeout and failed-analysis states; prohibit failure-to-complete fallbacks.
- [ ] Detect stale jobs and allow relevant reassessment of previously completed elements.

**Done when:** all configured checks yield traceable outcomes and malformed, stale or failed analysis cannot change completion.

### P2.2 Completion policy — backend + AI (R4, R5, R8)

- [ ] Replace/isolate legacy project-wide confidence auto-approval in the new workflow.
- [ ] Add AI-checked completion separately from human acceptance and formal inspection.
- [ ] Require adequate evidence and passing supported checks for all required parts of a work item.
- [ ] Keep new checks in shadow/review mode until their evaluation gate is met.
- [ ] Implement per-check/project enablement with a recorded policy version.
- [ ] Block completion on relevant unresolved issues, missing evidence and ambiguous references.
- [ ] Reopen affected work on contradictory evidence or changed requirements.
- [ ] Add tests for false completion pathways, mixed supported/unsupported checks and unauthorized overrides.

**Done when:** automatic progress is scoped, reproducible and auditable; no AI action fabricates a human or official approval.

### P2.3 Evaluation — AI + construction reviewer (R10)

- [ ] Extend the existing presence/absence harness to assess plan discrepancy and completion decisions.
- [ ] Add expert-reviewed real captures with permission and separate project/site evaluation splits.
- [ ] Cover correct work, visible defects, partial work, occlusion, poor lighting, wrong rooms, revisions and approved changes.
- [ ] Measure false completions, missed defects, false alerts, abstention and evidence coverage per check.
- [ ] Record sample sizes, limitations, model/prompt versions and total review burden.
- [ ] Agree on release thresholds; keep checks failing the gate advisory-only.

**Done when:** results support the specific capability claims made in the UI, with no synthetic score presented as field accuracy.

## P3 — 3D and corrections

Detailed import results, viewer choice, reproduction steps and verification limits: [BIM audit](docs/BIM_AUDIT.md). The website at `/building` uses the real imported duplex with local work/progress records. The retained detailed workbench and connected components are implementation foundations; `/bim-lab` now redirects to Building, and older connected routes are retired. Visual/device acceptance and live automatic AI completion remain open.

- [x] Integrate the real BIM viewer as the default `/building` view with shared navigation and a project identity; use the same model in Home and Logs; old illustrated-unit bookmarks open an unselected overview.
- [x] Simplify the default Building page to a full-width canvas with floating Level, View and Layers controls; remove both inspection sidebars and switch 3D/2D through a corner preview. Preserve filters and the mounted renderer, support touch plan zoom and retain detailed authoring code for future integration.
- [x] Default both imported and connected views to solid architecture with exterior walls/roof hidden; preserve shared/untagged walls, reveal selected shell components and offer restoration/transparency controls. Verify real source tags and API hints, including the roof slab's IFC predefined type.

### P3.0 Real-project import and viewer audit — backend + frontend

- [x] Select and attribute the public duplex architecture/plumbing/electrical/mechanical IFC files; pin source revision and hashes.
- [x] Import through the real pipeline and measure 1,282 elements, 22 spaces, four levels, types/properties and skipped source products. Record absent geometry and raw-value limitations.
- [x] Fix IFC2x3 type-based discipline classification, property truncation and duplicate bedroom names; retain GUIDs and shared metre coordinates. Apply only the sample's reviewed building-label alias.
- [x] Verify actual GLB element IDs, small-component bounds, coordinate round trips and surface ray hits in CPU tests.
- [x] Review documented That Open capabilities/licensing versus the current viewer and document retaining three.js. No third-party runtime/performance benchmark was run.
- [x] Provide `python -m app.bim.audit --download`, `/bim-lab`, and optional connected-project seeding with `python -m app.seed --duplex`.
- [ ] Validate visual geometry fidelity against an independent BIM viewer and profile larger federations.
- [ ] Extend extraction to full topology/ports, compound material layers, property-unit interpretation and additional source formats where needed.

**Done when:** the project can be reproduced from attributed source files and import losses are measured rather than hidden.

### P3.4 Detailed inspection and exact locations — frontend + backend

- [x] Add component search, full property inspection, isolate/hide/reset and selected-element focus in the connected viewer and workbench.
- [x] Fit the actual roughly 35mm bedroom elbow at close range with viewport-aware framing and a smaller near plane; remove the one-metre minimum radius.
- [x] Add top/front/side/isometric camera presets, zoom controls and sections.
- [x] Persist connected pins with element identity, clicked surface point, model version and viewpoint; preserve unknown provenance on legacy pins.
- [x] Test coordinate round trips and saved pin/old-version retention; reopen versioned issues on their recorded model and hide their pins on other versions.
- [x] Provide an A203 Bedroom 2 elbow shortcut and verify an actual exported mesh surface hit. Room association is derived from overlap and needs field confirmation.
- [ ] Visually verify close zoom, picking and section cuts in real WebGL on desktop and mobile.

**Done when:** a teammate can find a component, inspect it closely and reopen the same issue at its recorded model location.

### P3.5 Accessible 2D plans and 3D linking — frontend + backend

- [x] Add original authorized PDF/CAD file viewing/download beside 3D and retain the converted-sheet view. Upload alone does not imply approval or registered alignment.
- [x] Generate labeled IFC-derived level silhouettes; keep them distinct from approved construction drawings.
- [x] Add level/room selection, zoom/pan, room labels and component highlighting in 2D.
- [x] Link selected elements and model-derived plan coordinates to the same 3D geometry.
- [x] Keep model-plan coordinates explicit; require confirmed units/level and reviewed alignment before linking an external converted drawing to IFC locations.
- [ ] Persist reviewed original-sheet alignment and approved revision registration; support and validate raster/image references and non-convex section-quality plans.

**Done when:** users can open a relevant plan, identify its provenance and move between matching 2D/3D locations.

### P3.6 Evidence-to-element progress — frontend + backend + AI

- [x] Link existing photo-backed review decisions to stable imported element IDs and preserve evidence/history; test the saved API round trip.
- [x] Project separate human/fixture-AI/review/issue states on real imported workbench geometry. Actual connected human acceptance is distinguished from legacy AI auto-approval and unknown legacy records.
- [ ] Connect the full released scoped-assessment/coverage/inspection contract to real geometry; fixture AI is not live completion.
- [x] Refresh connected element details, model colors and progress queries after a saved decision; verify GLB bytes remain unchanged.
- [ ] Keep pending/failed/unsupported or merely uploaded photos from turning components green; preserve issue precedence and changed-reference reopening.
- [x] Verify photo/proposal → human review → saved element completion/provenance through authorized APIs and test viewer color projection. Live automatic completion still depends on P2's released checks.

**Done when:** a saved scoped decision changes the correct component, the evidence explains why and a later revision cannot silently retain an invalid completion.

### P3.7 Performance and acceptance — frontend + backend

- [x] Record source size, import time, 1,282 elements, 549,338 triangles and 6.17 MB of GLBs in the reproducible audit.
- [x] Guard asynchronous viewer replacement, dispose geometry/materials/markers and surface load/import failures.
- [x] Test actual exported GLB identity and surface ray hits; separately test scoped state/color projection and document renderer-stub limits.
- [x] Load inspection routes and the 3D engine separately from the base app; production build no longer reports an oversized main bundle.
- [x] Update audit report, STATUS and P3 checkboxes with completed capabilities and remaining limits.
- [ ] Profile actual GPU frame time, memory, gestures and mobile load performance; evaluate a model-local origin for large georeferenced projects.

### P3.1 Shared model status — frontend + backend (R4, R7)

- [ ] Project persisted assessments and issues into viewer colors and badges.
- [x] Add demo floor/unit selection, discipline layers, selected-unit evidence and approximate room-context pins; keep core records separate from apartments.
- [ ] Persist viewer locations and pins against real work-package/model associations, including uncertain matches; current sample work items already bind to source component IDs.
- [x] Show fixture AI-checked versus human-accepted completion, issue color precedence and inspection separately.
- [x] Show demo work-item coverage with its denominator; distinguish work counts from labor, cost and schedule percentages.
- [x] Update the demo daily summary, lists, model colors and report from the same local records.
- [ ] Project the same persisted backend records into every connected view and verify consistency after refresh.
- [ ] Ensure captures never silently modify approved geometry.

**Done when:** model, list and Logs agree after refresh, and every completion/issue is traceable.

### P3.2 Correction loop — frontend + backend (R5, R6)

- [x] Convert a local finding into an assigned demo issue with due date and explicit resolution requirements.
- [x] Show sample before/after evidence and explicitly requested fixture rechecks; route real uploaded photos to manual review.
- [x] Support local accepted correction, more evidence needed and rejected correction.
- [x] Require explicit local issue resolution; new photos and queue sync retain the open issue.
- [x] Preserve prior demo evidence, assessment snapshots, assignment changes and review reasons.
- [ ] Persist the complete correction loop through authorized backend APIs and run traceable live rechecks.
- [ ] Add in-app follow-ups using existing notification infrastructure; label any simulated delivery.

**Done when:** another teammate can follow an issue from discovery to resolution and understand every decision.

### P3.3 Daily report and integrated demo — frontend + product (R7, R10)

- [x] Summarize fixture completions, partial work, open issues, evidence gaps and required actions.
- [x] Link demo summaries to records without inventing hours, costs or weather; retain existing locally signed snapshots in log exports; replace the standalone Daily Report screen with Logs.
- [x] Adapt the detailed Studio building to the multi-stage daily-check narrative with status projection and a plan fallback.
- [x] Provide repeatable reset/seed behavior and explicitly identified fixtures.
- [ ] Run the full capture → check → completion/issue → correction → 3D update demonstration.
- [x] Add state/component tests for capture, queuing, review, correction, model projection and report snapshots.
- [ ] Verify mobile layout, keyboard navigation, readable legends and key empty/error states.

**Done when:** a new person can test the full story without guidance and identify what is simulated.

## P4 — Pilot and hardening

- [ ] Recruit design partners and establish baseline capture/review effort.
- [ ] Run shadow-mode assessments alongside qualified site review before enabling automatic completion.
- [ ] Measure combined capture, retake, review and correction time.
- [ ] Document actionable early detections and evidence-backed avoided-cost estimates separately.
- [ ] Test production offline behavior on actual field devices.
- [ ] Review storage access, backup/restore, retention, rate limits, job reliability and monitoring.
- [ ] Measure AI cost per update, support/onboarding burden and willingness to keep using the product.
- [ ] Set pricing from customer value and operating costs rather than illustrative pitch arithmetic.
- [ ] Update pitch and status only with observed results.

**Done when:** the team has evidence of repeatable customer value and knows which checks can safely remain automatic versus advisory.

## P5 — Expansion backlog

- [ ] Expand supported check coverage across trades and stages using the same evaluation gate.
- [ ] Add voice transcription and editable structured notes.
- [ ] Evaluate short-video capture and extraction of useful evidence frames.
- [ ] Prototype native supported-device LiDAR capture and alignment to project coordinates.
- [ ] Validate measurements against instruments; store units, tolerances and uncertainty.
- [ ] Add expert-reviewed jurisdiction-specific code/checklist assistance.
- [ ] Investigate requested project-system integrations; Procore is a potential integration, not shipped synchronization.
- [ ] Explore agent follow-ups and broader coordination after the daily loop proves useful.

These are future options, not dependencies for showing the core product.

## Contributor handoff

For each selected package, record an owner, dependencies, interface contract, acceptance evidence and limitations. Coordinate shared schema changes before parallel implementation. Keep [STATUS.md](STATUS.md) current as work ships. Do not mark a package done solely because its screen exists.
