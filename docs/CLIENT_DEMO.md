> The manual shared workflow is now connected. Start with the [two-account rehearsal](SHARED_DAILY_WORKFLOW.md) for actual crew upload → PM review → correction → model progress. Public walkthroughs below remain local samples; live AI and device acceptance remain open.

# Client demo — Placeholder AI

Updated October 6, 2026 · design iteration 2.

## What the demo should establish

A PM can find a piece of work in its building context, inspect the evidence and reference, assign a correction, review a fresh update and see the recorded decision in progress/history. The building stays on screen throughout.

This is a guided prototype demo for customer discovery. Public work records are local to one browser. Private project/model onboarding and the shared manual field loop use real authenticated APIs. Live AI checking remains planned. Do not present fixture results as checks performed on a client's photos.

## Five-minute walkthrough

1. **Orient:** open the project home and choose Open project on the duplex with Work & issues already beside the model. Show its whole building, exploded floors and hidden outer shell. Navigate floor → Unit A/B → room. Briefly switch to the model-derived 2D silhouette and return to 3D. Explain that this is source geometry, not proof that anything was installed.
2. **Find the problem:** select “Bedroom door — placement review.” The same canvas focuses its linked component. Show evidence, source identity, missing checks, owner and history. The generated illustration is explicitly labeled; it is not evidence from this building.
3. **Make a decision:** confirm an issue with an owner, due date, resolution requirement and reason. The issue stays open. Change the owner/due date if needed; this updates the actual local record without resolving it.
4. **Submit evidence:** use Add daily update, confirm the displayed location, attach a test photo and describe the work. Submission goes to review; it does not run AI or make the component green. For a phone-role preview, choose the user menu → View as → Field worker and select the relevant crew. Return to PM to review.
5. **Close the loop:** inspect correction evidence and record explicit acceptance/resolution with a reason. Show the component's progress and dated history on the same model. A later update can reopen review. Human acceptance does not establish formal inspection approval.
6. **Show scale/onboarding briefly:** switch to Schependomlaan Apartments, explore a real room-assigned door and create planned work. The showroom also includes Esplan for a larger architectural source and the Medical-Dental Clinic for complex discipline exploration (roughly 59 MB metadata plus 52 MB meshes; rehearse loading first). Or use Add / import project to connect an account, create a project, upload IFC, view the draft in the same canvas, inspect 2D/3D and explicitly approve it. Private crews now capture assigned work through the shared server workflow.

Use a test photo or permission-cleared customer evidence. Keep actual customer records out of the public sample browser. Public sample notifications are simulated. Private work creates actual in-app follow-ups; external messaging remains unconnected.

## Current capability boundaries

| Capability | Demo behavior | Remaining acceptance/integration |
|---|---|---|
| Building context | One renderer; floors, reviewed sample units, rooms, systems, component zoom, pins | Real WebGL/phone acceptance; exact surface-point placement in the chosen UI |
| Project/model setup | Optional account connection; actual project creation, IFC upload/job resume, draft preview and explicit approval | Reviewed unit metadata; additional drawing formats; source-space reconciliation across revisions |
| Evidence and review | Local photo capture, location confirmation, claims, review, assignment, correction, reasons and timeline | Server persistence, actual actors and consistent handoff across devices |
| Progress | Recorded component status with open issues prominent; dated status replay | Real released AI checks; historical source/evidence snapshots beyond current local replay |
| User experiences | Public customer read-only view; PM decisions; crew-scoped subcontractor/field previews | Customer sharing controls, real memberships/invitations and server field-record permissions |
| 2D reference | Actual model-derived geometry/room outlines | Original approved plan sheets/detail revisions and assessment-specific source links |
| Offline | Local sample draft and update identity survive reopening/reconnection | Production evidence queue, shared-device isolation and physical PWA acceptance; private API data uses the network |
| AI/inspection | Uploaded evidence awaits review; generated fixture results remain labeled | Live checks, calibrated measurement/defect validation; inspection records remain separate |

## Rehearsal checklist

- [ ] Open the production build on a laptop and a physical phone; verify camera framing, exterior visibility, pin selection and no clipped controls.
- [ ] Finish the above correction journey with a teammate using keyboard and touch, including a photo from the phone camera.
- [ ] Check portrait and narrow landscape, slow loading, an unavailable photo and a lost connection. No failed load may silently become completed work.
- [ ] Verify all four showroom cards fit together on the intended laptop viewport, the interior preview rotates by default and project entry opens Work & issues.
- [ ] Record apartment and clinic load time, memory and frame behavior on the intended devices. The source manifest is approximately 17 MB, plus 4.7 MB of meshes; no phone performance claim is established yet.
- [ ] Rehearse IFC upload against the intended demo backend with migrations applied. DOM API-contract tests and real-file backend tests have passed separately; a browser-rendered end-to-end upload rehearsal is still required.
- [ ] Confirm who will present the PM, crew and customer journeys; explain which actions are local, server-backed or planned.

Automated tests cover the record/scene linkage, project isolation, approval gates, role previews, search, assignment, photo failures, focus and real backend import. They do not establish visual or physical-device acceptance.

For longer role-based rehearsals and the gaps uncovered, use [the customer stories](USER_STORIES.md). They are fictional test scenarios, not validated customer outcomes.

## Before a customer pilot

Prioritize one usable vertical slice:

1. Persist daily evidence, owners, deadlines and decisions on the server; use the actual member identity. Show the same update on a crew phone and the PM's computer.
2. Connect approved drawing/detail revisions and reviewed location/unit metadata. Add explicit surface-point placement where component-center pins are insufficient. Define how removed/moved IFC spaces reconcile across revisions.
3. Implement and evaluate one narrow, supported AI check with a construction reviewer. Record insufficient/unsupported evidence and require human review until a completion policy is validated.
4. Enforce field/customer sharing scopes and verify phone/offline behavior on site. Define notifications and overdue follow-up from real persisted events.

Do not add a broad RFI/procurement/budget/scheduling suite just to fill a feature chart. The first demo needs a convincing evidence → location → decision → correction loop. Existing construction-management tools can remain the source for adjacent workflows.

## Questions to ask during the demo

- Which daily update currently makes you visit the site or call someone for missing context?
- Who should own the correction, what counts as enough evidence, and who can accept it?
- Would you have a usable IFC model, approved PDF sheets, or both on a typical project?
- What should the client be allowed to see versus the internal contractor team?
- Can we replay a recent real mistake with permission-cleared evidence and compare the coordination effort?

Success is a PM recognizing a specific job they would use this for and agreeing to test that workflow with their own evidence. Feature count and attractive 3D alone do not establish customer value.
