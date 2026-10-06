# Implementation backlog — Everything Works AI

Reset October 5, 2026. This is the new backlog, replacing the old TODO. All boxes below represent future work; existing foundations are in [STATUS.md](STATUS.md).

Product scope: AI checking daily updates across construction stages, identifying mistakes and incomplete work, and updating completion and issues in 3D. Before-drywall checking is one use case.

Owners are suggested contributor roles, not assignments. Each package needs a named owner when coding begins. Requirements R1–R10 are defined in the [product specification](docs/PRODUCT_SPEC.md).

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

- [ ] Design mobile submission, update result, exception inbox, comparison panel and issue correction views.
- [ ] Define shared labels, icons, 3D color precedence and accessible 2D fallback.
- [ ] Script a daily update with a supported completion, a mistake and an evidence request across at least two stages.
- [ ] Inventory reusable Studio components and distinguish local demo behavior from connected features.
- [ ] Label sample evidence, fixture AI and simulated notifications in the demo.

**Done when:** a teammate can explain the full workflow and the difference between AI completion and inspection approval from the prototype screens.

## P1 — Daily workflow

### P1.1 References and work context — backend + frontend (R1, R8)

- [ ] Store applicable approved plan/detail revisions, specifications and approved changes for each check.
- [ ] Add explicit work-package and room/element associations.
- [ ] Expose a source comparison view; show missing dimensions or ambiguous references.
- [ ] Require location confirmation when automatic mapping is uncertain.
- [ ] Define affected-check invalidation for approved drawing changes.

**Done when:** every assessable work item has a retrievable source snapshot; ambiguous or stale references cannot complete work.

### P1.2 Capture and synchronization — frontend + backend (R2, R9)

- [ ] Build photo-and-text daily submissions with multiple work items and worker claims.
- [ ] Add check-specific capture guidance and retake requests.
- [ ] Persist local drafts and stable client submission IDs.
- [ ] Reconcile queued, uploading, received, checking and failed states.
- [ ] Make upload/job retries idempotent and preserve partial upload recovery.
- [ ] Test mobile camera/file selection, reconnect, duplicate submission and interrupted upload.
- [ ] Verify access control for every attachment, location and derived result.

**Done when:** a submission survives network loss, appears once on the server, and never appears checked while only stored locally.

### P1.3 Review foundation — frontend + backend (R3, R5)

- [ ] Build daily update detail and exception inbox against deterministic assessment fixtures.
- [ ] Show evidence alongside the plan/detail with source revision and check scope.
- [ ] Add request-evidence, confirm-finding, dismiss-with-reason and human-accept actions.
- [ ] Persist decision actors and timestamps; preserve superseded results.

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
- [ ] Add floor/room/trade filtering, selected-item evidence and room-level pins for uncertain element matches.
- [ ] Show AI-checked versus human-accepted completion, issue overrides and inspection separately.
- [ ] Show required-item coverage and explain completion denominators.
- [ ] Update daily summary and model from the same source of truth.
- [ ] Ensure captures never silently modify approved geometry.

**Done when:** model, list and daily report agree after refresh, and every completion/issue is traceable.

### P3.2 Correction loop — frontend + backend (R5, R6)

- [ ] Convert a confirmed finding into an assigned issue with due date and clear resolution requirements.
- [ ] Link before/after evidence and recheck the affected items.
- [ ] Support accepted correction, more evidence needed and rejected correction.
- [ ] Require an explicit issue-resolution decision; do not close issues merely because a new photo arrived.
- [ ] Preserve prior evidence, AI results, assignment changes and review reasons.
- [ ] Add in-app follow-ups using existing notification infrastructure; label any simulated delivery.

**Done when:** another teammate can follow an issue from discovery to resolution and understand every decision.

### P3.3 Daily report and integrated demo — frontend + product (R7, R10)

- [ ] Summarize new completions, partial work, open issues, evidence gaps and required actions.
- [ ] Link each summary statement to records; do not infer unreported hours, costs or weather.
- [ ] Adapt the detailed Studio building to the multi-stage daily-check narrative.
- [ ] Provide repeatable reset/seed behavior and explicitly identified fixtures.
- [ ] Run the full capture → check → completion/issue → correction → 3D update demonstration.
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
