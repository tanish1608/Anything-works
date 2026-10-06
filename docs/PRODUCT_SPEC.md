# Product specification — Placeholder AI

Status: target product, not a list of shipped features. Updated October 6, 2026 with the planned user views.

## Current scope clarification

Daily crew photos and a short note are checked against the approved plan/model for that location. Both outcomes matter: mistakes or unfinished work become tracked 3D issues; supported correct work becomes 3D progress. Assign the responsible trade, retain fix photos and re-checks, and record PM sign-off with the full history. Design authoring, scheduling, budgets and replacing official inspection are out of scope. Existing calendar experiments do not expand this scope. Only released, validated check policies can authorize automatic completion; review-only presence checks still require human acceptance.

## 1. Product definition

**AI checks daily construction updates for potential mistakes and incomplete work, then updates progress and issues in a shared 3D model.**

The input is the ordinary daily update: photos, a short description and eventually voice or video. The output is a supported account of what was completed, what may be wrong, what remains unknown and who needs to act.

This applies throughout construction. Pre-drywall checks are one scenario alongside framing, MEP installation, finishes and closeout. We will ship supported checks incrementally instead of promising that one photo proves every condition on site.

The long-term dream is an agentic construction operating system. The current product is the daily evidence-to-quality-and-progress loop.

## 2. Users and desired outcomes

| Person | Needs | Product responsibility |
|---|---|---|
| Customer / client / homeowner | Understand shared project progress and decisions without managing crews | Simple customer summary, shared milestones/evidence and read-only model context; questions and explicitly requested customer decisions |
| Worker / foreman | Submit work once and understand follow-up requests | Fast mobile capture, clear location, minimal typing, visible sync state |
| Trade lead | Know what is incomplete or needs correction | Assigned findings with exact context, due dates and correction evidence |
| Superintendent / PM | Understand actual progress and concentrate review effort | Exception inbox, evidence comparison, visible coverage and accepted corrections |
| GC / developer-builder | Reduce avoidable coordination, delays and rework | Traceable project view and measured pilot outcomes |
| Inspector / specialist | Access relevant records without confusing AI with approval | Read-only evidence and separately recorded formal decisions |

Initial buyer hypothesis: US residential and multifamily GCs or developer-builders. Confirm the buyer, daily user and party bearing rework costs through interviews.

These users receive different views of the same project, model and recorded progress. Customer access does not imply administrative project ownership; trade/worker access follows assigned locations and work. The [role-view backlog](../TODO.md) defines the planned surfaces and permission work. The current website is the PM sample view with sign-in disabled for local testing; the separate user views are not shipped yet.

## 3. Product boundaries

**Included in the direction:** daily updates, guided photo capture, optional worker claims, comparison with approved project context, automatic evidence-supported progress updates, issues, correction tracking, 3D visualization and human review of exceptions.

**Later extensions:** voice transcription, short-video evidence, validated phone measurements, jurisdiction-specific checklists, integrations and follow-up agents.

**Outside the first release:** autonomous design changes, a guarantee of code compliance, hidden-work certification, structural or electrical performance certification from photos, accounting, payroll, procurement automation and a full ERP.

AI-checked completion is a product progress state. It is distinct from contractual acceptance, authorization to conceal work and official inspection approval.

## 4. Daily user journey

### A. Prepare the project

The PM imports a usable model or reviews a drawing-derived draft. A usable reviewed reference is required; flawless automatic conversion of every plan is not a dependency for the first demo.

Create building, floor, unit, room and trade context. Attach approved drawing revisions, specifications and relevant approved changes. Establish work packages and what evidence is needed to assess each one.

Requirements need a source, revision and applicability. A schematic symbol cannot establish an exact installation dimension. Missing context creates a setup or review task.

### B. Capture an update

The worker selects or confirms project, room and task, optionally using the existing QR workflow. Show a simple reference view and requested capture angles.

Accept photos and a short note first. Worker-entered percentage, hours or “done” are claims, stored separately from checked progress. Voice and video can follow once their processing and consent requirements are designed.

Save a local draft. Show queued, uploading, received, checking and action-needed states. A locally saved photo must not appear as server-checked evidence. Preserve submission identity across retries.

### C. Check the update

1. Confirm location and the reference revision.
2. Check image usability and whether the required area is visible.
3. Identify candidate work items; ask for confirmation if the mapping is ambiguous.
4. Retrieve applicable plan details, specifications and approved changes.
5. Run the available checks for those items.
6. Return structured results with supporting evidence, source references and limitations.
7. Apply the completion policy or open a review item.
8. Update the 3D projection and daily summary from persisted records.

Every received update gets a processing outcome. “Unsupported check,” “insufficient evidence,” and “analysis failed” are outcomes; none means the work passed.

### D. Act on results

The worker sees completed items and specific follow-ups. The PM sees exceptions ranked by impact and urgency, with evidence alongside the reference.

A potential mistake enters review. The reviewer can confirm a correction, dismiss the finding with a reason, request evidence, or link an approved design change. A confirmed issue has an owner, due date, location and resolution requirements.

New correction evidence creates a new check run. Preserve the previous finding. Depending on the supported check and policy, the result may restore AI-checked completion; a confirmed issue closes only through its explicit resolution workflow. Required human acceptance stays separate.

## 5. State model

These dimensions must be stored separately rather than compressed into one “done” flag.

| Dimension | Proposed values / meaning |
|---|---|
| Processing | Draft, queued, uploading, received, checking, completed, failed |
| Evidence coverage | Missing, insufficient, adequate for specified checks |
| Observed progress | Not assessed, not started, partial, AI-checked complete |
| Check result | No discrepancy detected, potential discrepancy, insufficient evidence, unsupported |
| Human review | Not requested, pending, accepted, rejected, superseded |
| Issue | Potential finding, confirmed/open, correction submitted, resolved, dismissed |
| Formal inspection | Not recorded, requested, passed, failed; linked authoritative record |

**Completion rules:**

- Automatically mark a work item AI-checked complete only when all required checks for that item are supported, have adequate evidence, and pass the released completion policy.
- Scope that label to the named work item and checks. Seeing a box cannot complete an entire electrical installation.
- Require validated check-specific decision rules; a model's self-reported confidence alone is insufficient.
- Missing evidence, ambiguous references, unresolved relevant issues and unsupported required checks prevent automatic completion.
- Keep a route for a qualified reviewer to accept evidence with a reason. Record that it was human accepted rather than AI checked.
- Newly contradictory evidence or an applicable plan revision reopens review without erasing the earlier decision.
- Human acceptance and formal inspection must never be manufactured by the AI completion path.
- Initially run new checks in shadow/review mode. Enable automatic progress completion per released check only after evaluation and project configuration.

An open issue overrides the visual “complete” state. A dismissed false alert need not erase a supported completion result; retain both decisions in history.

## 6. What AI can check

The following is a candidate catalog, not a current capability claim. Select the first checks with real sample evidence and a qualified field reviewer.

| Stage / trade | Candidate observable check | Evidence or limitation |
|---|---|---|
| Structure / framing | Presence, count and apparent placement of specified visible members or openings | Reviewed reference and sufficient viewpoints; no claim of load-bearing adequacy |
| Electrical | Expected visible components, counts, wall association and apparent placement | Correct room and approved details; images cannot prove hidden connections or electrical performance |
| Plumbing / mechanical | Presence and apparent routing of visible specified components | Occluded work and function need other evidence or testing |
| Interiors / finishes | Visible installation coverage, specified fixture presence and apparent unfinished areas | Surface appearance depends on lighting; a photo cannot establish every finish specification |
| Closeout | Completion evidence for a defined punch-list item | Original issue, resolution criteria and matched location |
| Cross-trade | An observable prerequisite remains incomplete | Explicit dependency, supported evidence and responsible reviewer |

For every released check, define: input requirements, applicable stages, source type, permitted result, failure cases, evaluation set, model/prompt version and completion eligibility.

Absence is only a supported finding when the relevant area is visible. An obscured item is unknown. Exact measurement needs a dimensioned reference, registration and demonstrated measurement accuracy. Do not invent universal code heights or tolerances.

## 7. 3D as the shared project view

The approved model remains the design reference. Daily updates change attached observations, completion, coverage and issues; they do not silently move planned geometry to match field work.

Navigate building → floor → unit → room → element. Provide trade isolation, cutaways, reset view, search and a 2D plan fallback. A selected marker opens the evidence and reference comparison.

| Visual treatment | Meaning |
|---|---|
| Neutral / trade color | Planned work with no supported completion decision |
| Amber | Review, missing evidence or a pending assessment |
| Green with “AI-checked complete” label | Completion established for the specified checks under the released policy |
| Green with distinct “Human accepted” badge | A reviewer accepted the work; show person, time and scope |
| Red issue marker / override | An unresolved relevant issue, even when earlier progress was complete |
| Separate inspection badge | A recorded formal inspection result, never inferred from green |

Use labels and icons alongside color. Surface counts such as “8 of 12 required items checked; 2 need evidence; 2 have issues.” Show denominator and coverage. Do not equate element counts with labor, budget or physical percentage unless the weighting method is explicitly defined.

When exact element association is uncertain, retain a confirmed room-level pin. Record later remapping. Plan revisions invalidate only the affected checks after dependency review; stale evidence must be visible.

## 8. Required screens

| Screen | Primary action | Essential information |
|---|---|---|
| Project setup | Approve references and configure work items | Revision, model quality, rooms, trades, required checks |
| Mobile daily update | Capture and submit | Location, task, capture guidance, draft/sync state |
| Submission result | Understand what changed | Completed items, issues, evidence requests, limits |
| Home | Read the daily summary and act on work pins | Summary above a minimal model on the left and grouped work records on the right; two-way selection and camera focus |
| 3D / plan workspace | Locate work | Status legend, selected item, coverage, related evidence |
| Comparison panel | Decide on a finding | Photo, approved reference, highlighted observation, uncertainty |
| Issue / correction detail | Assign and resolve | Owner, due date, before/after evidence, decision history |
| Logs | Inspect daily activity and compare dates | Calendar, recorded progress changes, date comparison, completion/reopening in 3D and traceable evidence |
| People | Find the responsible person | Contacts, teams, reporting hierarchy and explicitly recorded availability |

The first mobile experience should work without navigating a complex 3D scene. Capture first; richer spatial review is mainly for the office workflow.

## 9. Demonstration specification

Keep a detailed building for navigation, but demonstrate one complete daily update containing multiple outcomes:

- A framing work item with an observable discrepancy against an explicit reference.
- An electrical work item with insufficient visibility and a precise request for another photo.
- A finish or punch-list item with adequate evidence that becomes AI-checked complete.
- A confirmed issue assigned to a trade, corrected, rechecked and resolved.
- A later update that changes the relevant 3D status and appears in history.

These are proposed scenarios; replace them if experts cannot label the examples reliably. Include at least two construction stages so the story does not imply a drywall-only product.

Show a fictional project clearly. Label fixture-driven AI results, local persistence and simulated notifications. The existing local demo is separate from the connected app; do not imply it already runs backend AI.

**Demo acceptance:** another person can submit an update, explain all three outcomes, locate the work, follow a correction and refresh without losing state. No static metric should imply real customer savings or detection accuracy.

## 10. Measurement, code and future capture

Phone photos are the first capture mechanism. LiDAR is optional future support for spatial context and selected measurements, not a prerequisite for every worker.

Plan a supported-device capture module, likely native iOS integration, before promising access to Apple LiDAR APIs from the PWA. Store device/method, calibration or reference points, registration, units and uncertainty. Compare against physical measurements across realistic conditions. Abstain when uncertainty is too large for the required tolerance.

Code assistance needs the project's jurisdiction, adopted edition, amendments, applicable condition and a cited, expert-reviewed rule. Distinguish a plan mismatch from a possible code concern. Hidden, functional or safety-critical conditions require appropriate professional judgment and tests.

## 11. Pilot and validation

Recruit design partners; none is assumed secured. Agree on allowed capture, retention, worker access, field reviewers and the existing comparison workflow.

Create independently reviewed examples: correct work, visible defects, partial work, occlusion, wrong room, old drawing, approved change, poor image, contradictory updates and corrected work. Keep evaluation splits separate by project/site where possible to avoid testing on near-duplicate training examples.

Measure per check and stage:

- False completion: incomplete or nonconforming work marked AI-checked complete.
- Missed supported defects and false alerts.
- Evidence coverage, unsupported rate and abstention quality.
- Capture time, retake burden and PM review time together.
- Correction turnaround and verified early detections.
- Onboarding time, AI cost per update and repeat use.
- Customer-recorded avoided costs with assumptions separated from observed expenditure.

Set release thresholds with the field reviewer after establishing a baseline. Publish sample size, conditions and uncertainty. An attractive demo or a synthetic perfect score does not qualify a check for automatic completion.

## 12. Acceptance requirements

- **R1 — Context:** every completed assessment references a confirmed location and immutable source revisions.
- **R2 — Evidence:** processing and coverage are visible; retries preserve the original submission identity.
- **R3 — Checkability:** every required check returns a supported result, insufficiency or explicit unsupported status.
- **R4 — Completion:** automatic progress decisions follow the released check policy and preserve provenance.
- **R5 — Review:** users can confirm, reject or request evidence without overwriting AI history.
- **R6 — Corrections:** an issue retains assignment, before/after evidence and resolution decisions.
- **R7 — Model:** 3D and 2D statuses derive from the same records, with clear precedence and no silent geometry edits.
- **R8 — Revisions:** relevant changes reopen affected assessments and prevent stale completion decisions.
- **R9 — Access:** project/trade/zone permissions apply to evidence, model files and derived AI output.
- **R10 — Validation:** mock and live results are distinguishable; per-check performance and workflow burden are measured.

See the [build plan](../PLAN.md) and [task backlog](../TODO.md) for implementation work.
