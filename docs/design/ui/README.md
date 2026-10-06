# UI mockups — Everything Works AI

Static HTML screens for the daily-update workflow described in the [product specification](../../PRODUCT_SPEC.md). This is a draft for the **P0.3 UX and demo script** work package in [TODO.md](../../../TODO.md). It is not application code. Nothing here is wired to the backend or to `web/`.

Open [`index.html`](index.html) in a browser. Pages load Inter and Material Symbols from Google Fonts. Offline, text falls back to the system font and icons show as their names. [`screenshots/`](screenshots/) has a 1440 px render of each page for viewing on GitHub.

## Where these came from

These screens rework a Google Stitch export (“3D construction observability platform”: *Today*, *Work & Blockers*, *Building*, *Evidence*, the Unit 404/405 detail flows and a component guide). That export was designed from this repository **before** the October 5 documentation reset. It still described an autonomous coordination product: auto-approvals, AI-negotiated trade agreements, LiDAR measurements and “verified / ready for drywall” badges.

The reset redefines the product as **daily update → check against approved context → AI-checked completion or a finding → correction → updated 3D**. These mockups keep the Stitch visual language, navigation and story (Hawthorne Tower, the Unit 405 duct problem, the Works Beaver mascot). The workflow and wording follow the new spec instead.

The original export is not committed. It is 12 MB, and its images point to expiring `googleusercontent.com` URLs. The sample photos in [`assets/`](assets/) were cropped from its screenshots. They are **generated images**, not field photos, and every page labels them that way.

## Screens

| File | Spec §8 screen | Replaces in the Stitch export |
|---|---|---|
| [`today.html`](today.html) | PM daily overview | Today (approvals, communication resolution, navigation flow) |
| [`work.html`](work.html) | Work-item list + issues | Work & Blockers |
| [`review.html`](review.html) | Comparison panel | Approval detail — Unit 405 MEP rough-in |
| [`issue.html`](issue.html) | Issue / correction detail | Unit 405 approval — subcontractor communication resolution |
| [`building.html`](building.html) | 3D / plan workspace | Building |
| [`report.html`](report.html) | Daily report / history | Evidence; Unit 404 spatial progression |
| [`capture.html`](capture.html) | Mobile daily update | *new* |
| [`result.html`](result.html) | Submission result | *new* |
| [`setup.html`](setup.html) | Project setup | *new* |
| [`components.html`](components.html) | — | Unified component reference guide |

Shared styles live in [`ew.css`](ew.css). The tokens and status semantics are in [DESIGN.md](DESIGN.md).

## What changed, and which requirement drove it

| Stitch export | Now | Source |
|---|---|---|
| “Auto-approve (1)”, “Approve & Dispatch Dual-Trade Orders”, “AI Pre-Negotiated Resolution” | Explicit reviewer decisions: confirm issue, dismiss with reason, request evidence, link approved change, accept, reopen. Automatic completion happens only for checks released per project. | Spec §5 completion rules; invariant 3; PLAN “legacy behavior to migrate” |
| “Verified”, “Cleared”, “Code compliant”, “Ready now for drywall”, “AI Verified” | Separate chips for **AI-checked complete** (scoped to named checks), **Human accepted** (person, time, reason) and **Inspection** (violet, linked record only). No “ready to cover” or “compliant” indicator. | Spec §5, §7; PLAN frontend plan |
| One “Approve” per item | Seven stored dimensions on the review page: processing, coverage, observed progress, check result, human review, issue, inspection | Spec §5 state model |
| LiDAR ±0.15″, “Spatial match 99.4%”, “3.2″ clearance deficit”, code clearance numbers | Apparent placement vs a named revision; measurement and clearance marked **unsupported**; schematic symbols are not treated as dimensions | Spec §6, §10; invariant 4 |
| WhatsApp agreements, lockbox PINs, “$0 delay cost preserved”, telemetry, sensor PSI | An assigned issue with owner, due date and resolution requirements; trade messages labelled as claims; simulated notification delivery labelled; reports state what wasn't reported | Spec §3 boundaries, §9; invariant 10 |
| Progress percentages per trade | Work-item coverage with its denominator (“4 of 13 complete … 2 not yet assessed”), plus a note that it isn't labor, cost or schedule | Spec §7; PLAN legacy migration |
| No field-worker screens | Mobile capture with location/QR, task, plan reference, capture guidance, worker claim, offline drafts and sync states; a plain-language result screen | Spec §4B, §8; invariant 8 |
| No insufficient/unsupported/failed outcomes | Every update has an outcome. *Needs evidence*, *Unsupported check* and *Analysis failed* are explicit and never count as passes. | Spec §4C; invariant 4 |
| Issue resolved by agreement | Lifecycle: potential finding → confirmed → correction submitted → **explicit resolution decision**. The recheck alone doesn't close it. | Spec §4D; TODO P3.2 |
| No revision handling | Approved A-402 Rev C reopens Unit 407 framing, and the earlier decision stays in history. Unapproved drafts aren't used. | Spec §5, R8; invariant 5 |
| Green model tiles | Precedence legend: open issue > needs review > needs evidence > human accepted > AI-checked > unsupported > planned. Issue pins and room-level pins. Geometry never changes from captures. | Spec §7; invariants 6–7 |
| Floating “Jobsite Sentry” that auto-approves | **Works Beaver** assistant that points to the next decision and drafts requests, and states that it can't accept, close or inspect | Invariant 3 |
| Voice notes in the main flow | Photos and a short note first; voice is a later extension | Spec §3, §4B |
| BeaverOps AI / mixed branding | Everything Works AI. Code identifiers stay SiteMesh, as CLAUDE.md requires. | README |

## The fixture story

Every page uses one consistent fictional day (Tue, Oct 6, 2026) so the screens can be walked through as a demo (spec §9):

| Update | Location | Stage | Outcome |
|---|---|---|---|
| UPD-2291 | Unit 403 partition | Framing | Potential discrepancy F-118: opening at the wrong end vs A-402 Rev C → PM review |
| UPD-2292 | Unit 406 bedroom 2 | Electrical rough-in | Needs evidence: 2 of 4 boxes visible; north-wall photo requested (shadow-mode check) |
| UPD-2293 | Unit 405 Chase B | HVAC correction | ISS-031 recheck: no discrepancy detected for routing; issue still open pending decision |
| UPD-2294 | Unit 402 bath | Plumbing rough-in | AI-checked complete for visible components and routing; pressure test and inspection not covered |
| UPD-2295 | Unit 302 hall closet | Finishes / punch | AI-checked complete for punch item P-118 |
| UPD-2296 | Unit 408 sub-panel | Electrical | Analysis failed; retry queued |
| UPD-2297 | Level 14 core | Firestop | Unsupported check; routed to a qualified reviewer |

Level 14 has 13 current-stage work items: 3 AI-checked, 1 human accepted, 2 open issues, 3 needing review (403, 407 reopened by Rev C, 408 failed analysis), 1 needing evidence, 1 unsupported and 2 not yet assessed.

## Limits

- **Design only.** STATUS.md is unchanged because no behavior shipped. The P0.3 boxes in TODO.md stay open until the team reviews these screens and a teammate can explain the workflow from them.
- Check names, policy versions, IDs, people and companies are invented placeholders, not proposed API names.
- No evaluation numbers appear anywhere. Auto-completion is shown as enabled for some checks to illustrate the UI, not as a claim that any check meets a release gate.
- Interactions are static: tabs, filters and buttons don't change state.
- Checked here: each page renders without console errors and without horizontal scroll at 1440 px and 390 px (headless Chromium). Not checked: real devices, accessibility tooling, or usability testing.

## Suggested next steps

1. Review the status vocabulary in [`components.html`](components.html) with a construction reviewer as part of P0.2/P0.3.
2. Replace the fixture checks with the initial check catalog once P0.1 picks it.
3. Port the screens into the connected workspace (`web/src/pages/`) and the Studio demo (`web/src/studio/`) under P1.3 and P3, against the typed contracts from P0.2.
