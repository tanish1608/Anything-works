# Implementation backlog — Everything Works AI

Updated October 6, 2026 for the designer UI release. Checked items identify completed work and explicitly state when it is limited to a test/demo. Unchecked items remain open; existing foundations and verification limits are in [STATUS.md](STATUS.md).

Product scope: AI checking daily updates across construction stages, identifying mistakes and incomplete work, and updating completion and issues in 3D. Before-drywall checking is one use case.

Owners are suggested contributor roles, not assignments. Each package needs a named owner when coding begins. Requirements R1–R10 are defined in the [product specification](docs/PRODUCT_SPEC.md).

## Completed in the designer implementation

- [x] Implement Today, Work & Issues, review, correction, Building, Daily Report, Setup, capture and result screens in React at `/demo`.
- [x] Apply the designer's typography, colors and navigation; bundle fonts and supplied sample images locally.
- [x] Add an authenticated Today overview at `/p/:pid/today` using existing authorized API records.
- [x] Verify the frontend with 32 passing tests, production compilation and lint completion with warnings. Tests use mocked APIs and a stubbed 3D renderer; browser/device verification remains open.
- [x] Document routes, interactions, fixture boundaries and implementation files in [the implementation guide](docs/design/ui/IMPLEMENTATION.md).

The detailed completed demo interactions are checked in the packages below. No production backend package or live AI capability is complete merely because its demo works.

## Next work after the UI implementation

- [ ] Review the screens with the designer and teammates; record usability feedback before marking the UX package accepted.
- [ ] Visually verify desktop/mobile layouts, real WebGL rendering, keyboard navigation and dialogs. Browser review was blocked by the saved local-URL access preference during implementation.
- [ ] Test camera capture, photo resizing, storage limits, reconnect and PWA caching on actual iPhone and Android devices.
- [ ] Connect the new workspace to authorized project APIs instead of its local fixture store, following P0.2 and P1; retain a clearly labeled standalone demo.
- [ ] Replace illustrated reference comparisons with authorized plan/detail files and per-assessment source revisions.
- [ ] Connect real assessment jobs and correction rechecks; keep real uploads unassessed until a traceable result or explicit human review exists.
- [ ] Connect issue assignments and follow-ups to real delivery/notification records instead of simulated demo delivery.
- [ ] Split the large frontend/3D bundle and resolve the new route-menu reset and WebGL-fallback lint warnings.

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

The designer screens now have an interactive React implementation at `/demo`; see [implementation notes](docs/design/ui/IMPLEMENTATION.md). Local review/correction/capture behavior and a real-data connected overview are available. Backend persistence, live checking, field validation and teammate review remain separate acceptance work.

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

### P3.1 Shared model status — frontend + backend (R4, R7)

- [ ] Project persisted assessments and issues into viewer colors and badges.
- [x] Add demo floor/unit selection, discipline layers, selected-unit evidence and approximate room-context pins; keep core records separate from apartments.
- [ ] Connect viewer locations and pins to actual work-package/model associations, including uncertain matches.
- [x] Show fixture AI-checked versus human-accepted completion, issue color precedence and inspection separately.
- [x] Show demo work-item coverage with its denominator; distinguish work counts from labor, cost and schedule percentages.
- [x] Update the demo daily summary, lists, model colors and report from the same local records.
- [ ] Project the same persisted backend records into every connected view and verify consistency after refresh.
- [ ] Ensure captures never silently modify approved geometry.

**Done when:** model, list and daily report agree after refresh, and every completion/issue is traceable.

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
- [x] Link demo summaries to records without inventing hours, costs or weather; add downloadable reports with immutable locally signed text snapshots.
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
