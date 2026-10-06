# Tested story — duct installation blocks another trade

October 6, 2026 · Placeholder AI. Scenario from the user's slide: a panel installer reports, “Duct is not well installed; I cannot install the panel.” This is an automated workflow assessment, not a real-site defect evaluation or proof of reduced cost/delay.

## Verdict

**The manual review/correction loop works in the public single-browser demo. The complete two-trade, two-device customer story is not connected yet.** Its most important missing concept is a linked blocker: the panel crew reports the obstruction, the HVAC crew owns the correction, and the panel task stays separately blocked until someone verifies it can resume.

## What was exercised

The frontend scenario uses a real room-associated clinic source component: `35e450d9-72b7-5280-9247-b941e0d03b1e`, `IfcFlowSegment`, “Rectangular Duct:Mitered Elbows / Taps:637188.” It is a source design element, not the duct in the slide's photo.

1. A PM records a typed report and photo on the tracked duct **on behalf of the panel installer**. Submission goes to manual review and retains model/location identity. This workaround does not test an independent panel worker's upload.
2. The PM confirms the issue, assigns HVAC crew, sets a deadline and records the requested correction/evidence. The same component turns red; closure is unavailable without a correction submission.
3. The public subcontractor preview submits a different correction photo. The issue stays red and the crew cannot accept/resolve it.
4. The PM reviews the latest correction photo and explicitly accepts/resolves with a reason. The linked duct becomes human accepted; formal inspection stays “Not recorded.” Both photos and the history remain, and the source bounds/geometry and mounted model stay unchanged.
5. No network request is made by that public workflow. Switching a role in one browser is not an authenticated crew-to-PM handoff.

The DOM test stubs WebGL and photo decoding; it verifies UI/state/location/color linkage, not visual framing, image quality or phone camera behavior. It does not run AI or prove the pictured installation is defective. See `web/src/test/app.test.tsx`, test “duct-blocking-panel.”

The retained backend scenario uses disposable SQLite/storage, authenticated PM/HVAC/panel accounts, an imported generated IFC fixture and a synthetic valid JPEG. It tests:

- A framing/panel-trade member attempting to pin directly to the HVAC duct receives `422 Unknown element` under existing layer scopes. This documents a cross-trade reporting boundary; it is not bypassed.
- PM manual triage creates the version-linked issue and assigns HVAC. An actual in-app notification is recorded on the backend, but the chosen website does not consume that private field workflow yet.
- HVAC adds a comment and correction attachment, progresses to `resolved`, and cannot close a PM-created issue.
- The model warning remains until final closure; PM closure clears it. Actor/event history retains creation, comment, evidence and status changes.

See `backend/tests/test_issues.py`, test `test_panel_blocked_by_duct_needs_pm_routing_and_keeps_issue_until_review`. Backend issue closure alone does not enforce the chosen public UI's evidence/review policy; a connected pilot must enforce that policy on the server too. Existing backend permissions may also let an original reporter close their own issue; this test specifically covers a PM-created issue.

## Bug found and fixed

Previously, a subcontractor marking an issue `resolved` removed it from the element's warning count before explicit closure. The regression reproduced a count of zero while the issue still awaited final closure. `OPEN_ISSUE_STATUSES` now includes `resolved` for warning projections, so unclosed corrections stay prominent. This changes the retained backend count; the public local workflow already kept open correction issues red. It does not automatically accept any work or add a new status/storage migration.

## Coverage against the slide

| Step | Current coverage | Gap |
|---|---|---|
| Installer reports an obstruction | Typed photo/note on assigned public work; PM workaround tested | Independent crew-to-PM persistence; cross-trade reporting; voice transcription |
| Find the duct and room | Source-linked 3D pin, room/component focus, model-derived 2D context | Actual approved sheet/detail context; precise surface-point placement in chosen UI |
| Route to HVAC | Local owner/deadline/reason; retained API membership/assignment/notifications tested | Real assignee task/acknowledgment in chosen interface; separate reporter identity |
| HVAC corrects; PM rechecks | Local fresh-photo review and explicit resolution tested | Connected evidence/review enforcement and actual device handoff |
| Panel crew resumes | Can record a follow-up note | Structured `blocked_by` link, reporter confirmation and resume notification; duct acceptance must not complete panel work |
| PM checks contract/budget/schedule | Narrative can be recorded in notes | Approved contract/change references, proposed impact/decision and downstream schedule linkage |
| Owner understands consequences | Public customer read-only presentation exists | Authenticated sharing, actual cost/delay decision history and owner communication |
| AI checks installation or code | No live check in this test | Supported released checks, adequate evidence/measurements and reviewer validation; human acceptance remains separate from inspection |

## Verification record

- Full frontend suite: **122 passed**, including the new clinic-source DOM walkthrough.
- Backend issue/progress/model-workflow suite: **14 passed** after the warning-count fix; the new regression first reproduced premature clearing.
- Production build and changed-backend Ruff checks pass. Frontend lint completes with its 20 retained warnings.
- No live AI, browser-rendered walkthrough, independent phone synchronization or physical/site acceptance was exercised.

## Next acceptance to build

**Two linked work items, two crews, one PM:** the panel installer reports a blocker against their assigned task and authorized location, with photos/note and the obstruction described. PM confirms the relevant duct/source revision and routes a linked corrective issue to HVAC. Reporter and fixer remain different people; assignment does not rewrite the panel task's owner or classify the panel as HVAC work.

HVAC submits correction evidence. PM requests more evidence or accepts the scoped correction. The panel task remains blocked until the required clearance/resume confirmation is recorded. Its status then returns to planned/in progress, not completed. The panel crew receives a real notification and submits its own installation evidence afterward. A model revision, rejection or reopened defect preserves evidence and prevents stale green/resume state.

A proposed cost/delay/change decision can be attached later with references and human approval. An issue alone should not invent liability, a contract interpretation, an added charge or savings.

Run this acceptance with separate authenticated devices before presenting the full slide as an implemented workflow. Browser/phone/WebGL and site acceptance remain open under the existing verification limits.
