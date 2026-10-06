# Everything Works AI

**Turn every daily construction update into checked progress and actionable issues.**

## The cost of doing work twice

**At 5% rework, a $20 million construction project spends $1 million doing work again. Across ten projects of that size, that is $10 million.**

This is an illustrative scenario using a historical research benchmark, not a verified current US residential average. Hwang and colleagues' 2009 paper cites earlier CII research at that level. [Research paper, introduction](https://www.pdhexpress.com/wp-content/themes/pdhexpress/pdf-courses/impact-of-rework-in-construction-cost.pdf).

A misplaced component, incomplete installation or missed detail can become more expensive to correct as other work proceeds. The opportunity is to turn daily field updates into earlier checks and a clearer record of actual progress.

## One-line description

**Everything Works AI checks construction photos and daily updates against approved project information, flags potential mistakes, and updates completion and issues in a shared 3D model.**

## The pitch

Construction teams already send photos, messages and daily reports. Project managers still have to connect those updates to the correct location and latest plan, decide whether the work is correct and complete, and coordinate any fixes.

We are building Everything Works AI to do that first layer of checking after each daily update.

A crew submits photos and a short description of its work. AI identifies the relevant work items, compares visible conditions with the approved project reference, and separates supported completion, potential mistakes and missing evidence.

When the required evidence and supported checks are satisfied, the system updates the item to **AI-checked complete**. When it finds a possible mistake, it pins the finding to the room or element in 3D. When the update is insufficient, it asks for the missing view or information.

The PM gets a shared view of progress and an exception queue. The responsible trade sees where the issue is, why it was flagged and what needs correction. New evidence carries the issue through rechecking and resolution.

The direction covers daily work across structure, MEP, interiors and closeout. We will validate and release individual checks in stages. Catching an electrical mistake before drywall is one example of the value, not the full product.

## Customer pain points

Initial customer hypothesis: US residential and multifamily general contractors and developer-builders. Superintendents and PMs review work; foremen and subcontractors submit evidence and resolve findings.

| Pain point | Consequence | Intended product response |
|---|---|---|
| Daily updates describe activity without proving correct completion | PMs repeat checks and follow-up conversations | Compare the evidence with explicit work requirements |
| Photos, drawings and messages are disconnected | Teams struggle to identify the right room, reference and responsible person | Link each update to location, work item and approved revision |
| Mistakes are discovered after other work proceeds | Repeat visits, disruption, failed inspections and rework | Surface supported discrepancies during daily review |
| “Done” means different things to different people | Claimed progress is confused with verified work or inspection approval | Separate claims, AI-checked progress, human acceptance and inspection |
| Random photos leave gaps | Hidden or unseen work may be assumed complete | Show coverage and request missing evidence |
| Issues lack ownership and a visible resolution trail | Problems persist across trades and shifts | Pin, assign, recheck and track corrections |
| Progress must be entered again into another dashboard | Duplicate administration and stale status | Derive model and daily summary updates from the same evidence records |

## The product loop

**1. Establish the reference.** Review the project model or plans, confirm locations, attach approved details and changes, and define work items and their required checks.

**2. Submit daily work.** A worker captures photos and a short note. The app guides capture where needed and queues uploads offline. Voice and video are planned extensions.

**3. Check the update.** AI processes every received submission. For each supported check, it reports no discrepancy detected, a potential discrepancy or insufficient evidence. Unsupported requirements remain explicit.

**4. Update completion.** Adequately evidenced work can become AI-checked complete under a validated check-specific policy. Partial, uncertain or conflicting evidence cannot automatically complete it. New checks begin in review mode until validated.

**5. Locate and resolve mistakes.** The PM reviews findings with the evidence and approved reference. Confirmed issues get an owner and correction requirements. The trade submits new evidence, and the issue follows an explicit resolution workflow.

**6. Keep everyone looking at the same project.** The 3D view, work list and daily report reflect the same persisted assessments and decisions.

AI-checked complete describes the scope of checks performed. It does not replace human acceptance, required testing or formal inspection.

## What AI checks

The product can expand across stages, while the released check catalog remains explicit.

| Candidate check | Example | What must be established |
|---|---|---|
| Visible presence and count | Required visible components appear in a room | Correct location, adequate views and an explicit expected set |
| Placement and arrangement | A component appears on a different wall from the approved detail | Reliable reference and correspondence; schematic drawings cannot establish exact dimensions |
| Incomplete work | A defined finish or punch-list item still has visible unfinished areas | Clear task boundaries and sufficient coverage |
| Correction evidence | A previously flagged visible condition has changed | Matched issue, location and resolution criteria |
| Selected measurements, later | A measurable position differs from a specified dimension | Validated method, registration, tolerance and uncertainty |
| Code/checklist assistance, later | An observable condition needs review against an applicable rule | Jurisdiction, adopted edition, amendments and an expert-reviewed cited rule |

Checking every update does not mean checking every hidden or functional condition. A photo cannot establish unseen connections, electrical performance or structural adequacy. “Not visible” must remain unknown.

Plan discrepancies and potential code concerns are different findings. Approved design changes must be considered before flagging an installation as wrong. Code applicability depends on local adoption and amendments. [ICC adoption guidance](https://www.iccsafe.org/advocacy/code-adoption-resources/).

## How daily updates change the 3D model

The model is a shared view of planned work, observed progress and unresolved issues. Select a floor, unit, room or trade to see the relevant work, evidence and reference.

| Visual state | Meaning |
|---|---|
| Neutral / trade color | Planned work without supported completion |
| Amber | Review or additional evidence is needed |
| Green — AI-checked complete | Evidence satisfies the released checks for the named work item |
| Green — human accepted badge | A reviewer accepted the specified work; actor and evidence are recorded |
| Red issue marker / override | A relevant unresolved issue remains |
| Separate inspection badge | A formal result has been recorded from the appropriate source |

The UI shows what was checked and what was not. New evidence can reopen an earlier completion decision. A room with several completed items can still contain unresolved work.

Daily updates change **observations, completion, evidence and issues**. They do not quietly change approved geometry to match an incorrect installation. Geometry changes require an approved design revision.

## Example: one update, three useful outcomes

A foreman submits daily photos from several rooms:

- A framing item has a possible mismatch against an approved detail. AI locates the finding for review.
- An electrical photo does not show the relevant wall clearly. The app requests another angle instead of marking the task complete.
- A defined finish item has adequate evidence for all its supported checks. Its status becomes AI-checked complete in 3D.

The superintendent confirms the framing issue, assigns it and reviews the correction evidence later. The model and daily report update from those decisions.

A misplaced electrical box discovered before drywall is another example: earlier detection may avoid opening and refinishing a wall. Required inspections remain separate; for example, Englewood requires rough-inspection approval before covering work with insulation or drywall. [City inspection guidance](https://www.englewoodco.gov/government/city-departments/building-division/inspections/rough-inspections).

These are intended demonstration scenarios, not claims that the present prototype reliably detects these conditions. Simulated AI results must be labeled.

## Phone photos and LiDAR

Photos are the first input. Supported-device LiDAR may later add spatial context and selected measurements. Apple's RoomPlan demonstrates camera-and-LiDAR room capture; it is not a complete construction quality-checking system. [Apple RoomPlan](https://developer.apple.com/documentation/roomplan).

We must validate each measurement method against the required tolerance and realistic site conditions. When uncertainty is too large, request an appropriate physical measurement. Apple's Measure guidance describes its measurements as approximate; that does not establish the accuracy of our future implementation. [Apple measurement guidance](https://support.apple.com/guide/iphone/measure-dimensions-iphd8ac2cfea/ios).

The core workflow should work without every worker owning a LiDAR-equipped phone.

## Competition and positioning

US-headquartered businesses retained from our research are below. This describes public positioning and the comparison we need to test. It does not claim that features omitted from marketing materials do not exist.

| Alternative | Public product emphasis | Comparison still to establish | Our intended focus |
|---|---|---|---|
| OpenSpace Field | Visual capture, photo/voice issue creation and location-linked field records | Its autolocation uses prior 360° capture; compare the full daily-check and completion workflow in practice | Phone evidence connected to supported quality checks, progress and corrections in 3D |
| Fieldwire | Plans, mobile tasks, photos, checklists and BIM viewing | BIM is in a higher paid tier; compare setup and review effort for this sequence | Reduce repeated manual interpretation of daily updates |
| Trunk Tools | AI-assisted construction document search, drawing review, RFIs and submittals | Equivalent physical-installation assessment and completion workflow was not verified | Compare captured work with approved context and update observed progress |
| Site walks, messages and spreadsheets | Experienced judgment and familiar communication | Evidence, references, decisions and status must be reconciled manually | Support that judgment with located findings and an evidence-backed progress record |

Sources reviewed October 5, 2026: [OpenSpace Field](https://www.openspace.ai/products/field/), [Fieldwire](https://www.fieldwire.com/pricing/), [Trunk Tools](https://trunktools.com/).

Our differentiation thesis is **daily evidence → supported quality assessment → completion or issue → correction → shared 3D status**. It must earn its place through useful detections and lower total effort. A 3D viewer or an AI label alone is not a defensible advantage.

Procore is a complementary project platform and potential integration destination, outside this direct chart. It has overlapping observations and AI capabilities. No integration is currently promised as shipped. [Procore capabilities](https://www.procore.com/ai/agents).

This is a focused comparison, not an exhaustive review of every construction AI or inspection-automation competitor.

## Illustrative project economics

These are arithmetic scenarios, not measured customer results. The base is construction expenditure, excluding land value and home sale price. The 1% case tests sensitivity; it is not presented as another researched industry average.

| Construction expenditure | Rework at an assumed 1% | Rework at an assumed 5% |
|---|---:|---:|
| $5 million project | $50,000 | $250,000 |
| $20 million project | $200,000 | $1 million |
| $100 million portfolio | $1 million | $5 million |

**A small share of a large cost can still matter.** In the $20 million / 5% scenario, suppose 20% of the $1 million rework cost involves problems our supported checks could address, and earlier detection prevents 25% of that portion. The illustrative avoided cost is **$50,000**:

**$20,000,000 × 5% rework × 20% addressable share × 25% prevented = $50,000.**

The 20% and 25% inputs are hypothetical and need pilot evidence. At a 1% rework rate, the same assumptions yield $10,000 instead. These are gross avoided costs before software, capture, review and implementation expenses—not profit or demonstrated savings. Benefits may accrue to different parties depending on who bears the correction cost.

For a purely illustrative $10,000 project subscription, $50,000 of avoided cost would be **5× the subscription fee**, not 5× net ROI. After that fee, $40,000 would remain before other implementation and operating costs. This fee is an arithmetic assumption, not our price commitment. The lower $10,000-benefit scenario would only cover the fee before those other costs.

The product targets a subset of rework. Owner changes, redesigns, material failures and defects invisible in the capture cannot all be prevented by our initial workflow.

## Starting customer and business model

Start customer discovery with US residential and multifamily builders managing repeated work across rooms and trades. Choose the first released checks based on real evidence, customer pain and reliable evaluation. The initial customer hypothesis does not restrict the product to electrical rough-in.

A proposed business model is a subscription per active project with field participation included. Validate price against the full costs of onboarding, capture, review, support and AI processing.

We aim to reduce administrative effort, identify useful mistakes earlier and keep project progress current. Reduced rework and inspection delays are outcomes to measure, not guarantees.

## Current stage and next milestone

The repository includes a browser-local 3D demo and connected foundations for model import, drawing review, issues, offline photos, progress proposals, PM approval, Gemini analysis and event history.

Reliable plan comparison, a check-specific automatic-completion policy, separate acceptance records and the integrated multi-stage daily loop need development and validation. The legacy confidence-based auto-approval option is not evidence that the new behavior is already delivered.

The next milestone is a complete daily-update demonstration with a supported completion, a potential mistake, an evidence request and a correction reflected in 3D. Use clearly labeled fixtures where live checks are not validated.

Then evaluate permissioned real-site examples with qualified reviewers. Measure false completions, missed defects, false alerts, coverage, abstention and combined capture/review time. Seek design partners and repeat use before making broad accuracy or savings claims.

Detailed scope and implementation work are in the [product specification](PRODUCT_SPEC.md), [build plan](../PLAN.md) and [backlog](../TODO.md).

## Long-term vision

Build a trusted record of what was reported, what was checked, what was completed and what needed correction. Expand check coverage across construction stages as evidence supports it.

That context can eventually support agents coordinating follow-ups and project operations. The operating-system vision grows from a useful, trusted daily workflow.

## 30-second spoken pitch

At an illustrative 5% rework rate, a $20 million project spends $1 million doing work again. Everything Works AI turns daily construction photos and updates into checks against approved plans. It flags potential mistakes, marks supported work AI-checked complete and updates a shared 3D model. Project managers see where attention is needed, and trades can track fixes through resolution. We are building the daily quality-and-progress loop across construction stages, starting with a validated set of observable checks.

## References and assumptions behind the opening

**Historical support, not a universal rate.** Hwang, Thomas, Haas and Caldas (2009), *Measuring the Impact of Rework on Construction Cost Performance*, analyzed 359 CII projects. Its introduction cites a 5% direct-rework benchmark from earlier CII research. Its own industry-group tables report different owner and contractor averages, approximately 5.4% and 2.2%; the sample was predominantly industrial. Do not describe 5% as the measured average across all 359 projects or a current US housing statistic. [Full paper](https://www.pdhexpress.com/wp-content/themes/pdhexpress/pdf-courses/impact-of-rework-in-construction-cost.pdf), [bibliographic record and abstract](https://trid.trb.org/view/884832).

**Newer counterevidence.** A January 2026 ASCE summary reports 0.38% measured precompletion field rework in one contractor study. Assuming an equal amount of postcompletion corrections yields an estimated 0.76%. This illustrates the importance of definitions and the customer sample; it is not a universal residential benchmark either. [ASCE research summary](https://www.asce.org/publications-and-news/civil-engineering-source/article/2026/01/22/how-much-does-field-rework-in-construction-actually-cost).

**Use in a presentation.** Keep “illustrative scenario; historical 5% benchmark” next to the dollar figure and keep the citation visible. No source verified here establishes a general 5–6% rate for current US home construction. The project sizes, portfolio count, addressable share, prevention rate and fee are scenario inputs. Replace them with customer records and pilot results as evidence becomes available.

Product statements describe the intended experience; the current-stage section governs what is available or validated today.
