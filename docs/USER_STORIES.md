# Customer stories and workflow review

October 6, 2026. These are **fictional product walkthroughs and test scenarios**, not customer testimonials or validated time/cost savings. They describe how a PM and a crew should use Placeholder AI, then compare that journey with the current implementation.

The promise to demonstrate is **daily evidence → review/check → a located issue or supported progress → correction**. The building explains where the work is; it is not the task itself. AI checking remains future integration. Public samples save records on one browser. The subsequent [shared integration](SHARED_DAILY_WORKFLOW.md) now connects actual private crew/PM accounts, work/evidence, manual review/corrections, notifications and 3D progress. Live AI, cross-trade blockers and physical-device acceptance remain open. The friction notes below record the original review; the shared-loop gaps are addressed by this integration.

## Story 1 — the PM's morning starts with decisions

**Alex, a project manager:** “When I open the project, show me what I need to act on. I don't want to search a building before I know what the problem is.”

Alex opens the duplex. After choosing Open project on home, **Work & issues** is already beside the building, initially filtered to Attention and sorted with issues first. Alex can change the team filter or due-date order, or search across all statuses. An open issue stays prominent even when older evidence was accepted.

Alex selects the bedroom pipe-connection record, such as the existing `ISS-031` sample bookmark. The model expands the relevant floors and focuses the linked room/component. The evidence panel shows the latest submission, responsible crew, source reference and recorded timeline. An optional tighter zoom explains the fitting; Alex does not need to identify a mesh ID or hunt across page tabs.

Alex sees a potential mismatch. They confirm an issue with a reason, assign the responsible crew/deadline, and explain the correction/evidence needed. A partial or unclear photo leads to a request for more evidence, not a pass. A supported visual observation also does not prove pressure testing, hidden conditions or formal inspection.

After the crew submits fresh correction photos, Alex reviews those new photos against the reference, accepts the reviewed scope when justified, and explicitly resolves the issue. The open-issue color remains until resolution; the history retains the earlier evidence and decisions. An accepted correction is not silently copied back onto earlier dates.

**What works in today's sample:** issues-first entry, filters/search, row-to-model focus, latest photo selection, local assignment/deadline changes, evidence requests, human acceptance, explicit correction resolution and historical status replay. Generated evidence is labeled. Real uploaded photos await manual review.

**Friction uncovered:** Alex currently has to write capture instructions as free text; there is no released check-specific evidence guide. Priority sorting also has no validated safety/impact model. More critically, Alex cannot receive a different person's authenticated phone upload in the chosen PM panel yet. Local review is a demo of the workflow, not a working team handoff.

**Acceptance for a connected pilot:** an actual crew upload appears once in Alex's authorized queue, opens its exact evidence/revision/location, records Alex's real identity and decision, and returns an actionable correction request to that crew. A confirmed unresolved issue blocks green regardless of an older completion record.

## Story 2 — the foreman reports work with poor reception

**Maya, a subcontractor foreman:** “I'm on site. Let me pick the work, take a photo and explain what changed. Don't make me recreate the project manager's paperwork.”

Maya sees only their assigned project, trade and work locations. They open the relevant task, confirm building → floor → room (and a unit only if reviewed source metadata identifies one), and use the model as a brief location check. The camera form is the main interaction; capture should remain usable through a searchable location list when 3D fails.

Maya takes an overview and a close-up, then writes: “Connection installed; test result still pending.” The location and source revision remain attached to the update. Their claim is a report of what they did, not a completion or inspection decision.

Reception fails. The app saves the draft and photos on this device and says **Queued on this device**. Maya can leave and reopen it without losing the update. When reception returns, retry uses the original client UUID. If the server already received the update before the connection failed, retry reconciles that same upload instead of duplicating it.

Maya's history changes to **Submitted — awaiting review** only after the server confirms receipt. A correction request identifies the task, what to fix, which views are needed and who is reviewing it. Maya submits fresh evidence; the PM receives it beside the earlier issue. If the approved model changed meanwhile, the app preserves the photos and asks Maya to reconfirm context before submission.

**What works today:** browser-local public crew presentation previews, assignment-limited capture, location confirmation, photo/note capture, saved draft/queue identity and sample manual-review transitions. Retained backend APIs support authorized, idempotent uploads and own-upload history. The standalone phone companion is specified in [the mobile build prompt](SUBCONTRACTOR_MOBILE_BUILD_PROMPT.md), not built.

**Friction uncovered:** real phone-to-PM synchronization and real actor/role scopes are missing from the chosen UI. Public capture handles one work record at a time, while a real daily update may cover several components. Workers should not repeatedly type a title/owner or search the same room. Account-scoped offline queues, camera failure recovery and correction notifications need actual device/backend acceptance; a local “synced” status is insufficient.

**Acceptance for a connected pilot:** one permitted crew member can capture offline, reconnect, submit once and see that update in both their own history and the real PM queue. Another account cannot read or submit their draft. A changed reference, denied scope or invalid photo keeps the evidence and gives a specific recovery action.

## Story 3 — a new building becomes a work site

**Jordan, a superintendent onboarding a project:** “The model is uploaded. What does my team do next, and which information can we trust?”

Jordan opens the showroom. Four public projects fit in the selection grid, with an interior view rotating by default. Selecting a card previews that source model; **Open project** enters Work & issues. Browsing does not overwrite the project or draft Jordan left. Larger connected catalogs use explicit page controls rather than a horizontally scrolling strip.

For a new private project, Jordan connects an account, creates the project and uploads the IFC files. The model remains a draft until someone reviews its spatial structure and geometry and explicitly approves it. A model with no field evidence begins with no inferred installed progress. A project without geometry goes to setup, not a fabricated house.

Jordan checks floor/room/component structure and model-derived plans. Different engineering files may describe the same level under different names, use different units, or contain overlapping room records. Jordan should review federation/association before the model becomes a crew reference. The bundled clinic has explicit recorded mappings for its source building/floor labels; these are sample-specific mappings, not a general automatic merger. Distinct source-space GUIDs remain distinct until a reviewed physical-room mapping exists.

For a public walkthrough, Jordan sees **No field updates yet**, follows **Explore building work**, selects a real source component, and chooses **Track work here**. They add a title and owner once. This creates planned work; it does not report installation. The crew's later daily photos begin the review loop. When Attention is empty but planned/reviewed work exists, **Show all work** avoids a false dead end.

For a private project, the current issues panel states that field records are not connected. Jordan cannot mistake an empty local list for “the site has no issues.” Geometry review is usable today; real crew assignment/capture in this selected interface is the next integration.

**What works today:** actual authenticated model upload/draft approval, source geometry and plan retrieval, four attributed public projects, isolated local records, planned component-linked work and clearer empty-list guidance. Esplan's large survey coordinates are exported with nearby mesh vertices plus precise node translations so small detail survives without changing source world coordinates.

**Friction uncovered:** work setup is component-by-component. Jordan needs reusable trade/location packages and capture requirements before bringing crews on. Federation review is not a complete client-facing setup step; arbitrary imports may retain separate building/floor labels. Model-derived silhouettes also cannot replace approved sheet details, specifications, tests or change instructions.

**Acceptance for a connected pilot:** Jordan can review the import, establish permitted work/evidence requirements, assign a crew and have that crew submit against the approved reference. A later approved revision reconciles location identities, reopens affected prior decisions, and never silently moves old green progress onto a different room.

## Changes made after walking these stories

- The workspace opens Work & issues by default; explicit bookmarks still open their requested workflow. Closing the panel is an explicit `panel=none` state, so refresh does not force it back open. Returning to the normal project overview brings back issues.
- The showroom defaults to interior visibility and idle rotation. Preview buttons and the extra heading row are removed. Its layout is bounded by the viewport, and its public cards fit in a grid instead of requiring horizontal scrolling. Keyboard Space and pointer interaction can stop rotation; reduced motion and backgrounding still suppress it.
- Empty source projects explain how to create planned work. Empty Attention offers All work rather than suggesting there are no tracked records. Empty private records expose the integration boundary rather than declaring the site clear.
- The clinic's explicit building/floor aliases and Esplan's survey-coordinate precision fix preserve source identity/geometry. Both additions have reproducible source manifests and import audits; neither ships invented field progress or unit numbers.

## Story 4 — a duct blocks the panel installer

The user-supplied slide is now assessed in [the tested duct-blocker story](DUCT_BLOCKER_STORY_TEST.md). The manual PM → HVAC correction → PM review loop is exercised on an actual clinic source component in DOM tests, and retained backend assignment/evidence/status handoff is tested separately. Cross-trade reporting and a linked panel-task blocker are not delivered. The assessment records a fixed backend warning-count bug, capability boundaries and the next two-crew acceptance.

## Original review priorities and current completion

| Priority | Missing connection / inefficiency | Concrete acceptance |
|---|---|---|
| Completed manual integration | Real crew update → chosen PM evidence queue → crew correction response | Two authenticated users on separate devices complete the same issue/correction journey, with server IDs and real actor history |
| P0 | Reliable account-scoped phone capture/offline recovery | Camera/gallery failures, reload, network timeout, duplicate retry, logout/account change and revision conflicts preserve evidence without leaking or duplicating it |
| P0 | Cross-trade blocker with separate reporter/fixer and downstream task | Panel crew reports against its task/location; PM links a duct issue to HVAC; correction review resumes panel work without marking it complete |
| P0 | Work and evidence setup before crews start | PM defines a trade/location package and required views once; crew sees that assigned work without re-entering project/owner data |
| P1 | One daily update can cover several supported work items | Each selected item gets its own supported/unsupported/insufficient outcome; one visible component cannot complete an entire room |
| P1 | Reviewed import federation and room reconciliation | Show source units, file origins, building/floor aliases and duplicate-space candidates; mappings require review and affected old progress reopens |
| P1 | Original approved reference and capture guidance | Reviewer can open the actual sheet/detail/spec revision and crew sees requested evidence; source silhouettes are clearly separate |
| P1 | Safety/impact/dependency prioritization | PM can see and record why a risk is urgent or blocks another trade; priority is not invented from an unvalidated AI score |
| Completed in-app integration | Durable correction ownership/notifications | Assignee receives a real in-app task linked to the issue/evidence, overdue status is traceable, and reassignment/resolution keeps history |
| P1 | Complex-model loading on field devices | Measure the clinic's roughly 59 MB metadata and 52 MB meshes on target devices; add lazy metadata/layer loading or LOD as measurements warrant |

These are integration and usability priorities, not a reason to add accounting, payroll, procurement or a broad agentic operating system. The strongest next demo proves that **two people can coordinate real evidence through one traceable construction issue**.

## Rehearsal notes

Use the duplex for the seeded decision/correction story. Use Esplan or Schependomlaan for empty-site → planned-work → real-photo/manual-review walkthroughs. Use the clinic for detailed multi-discipline exploration, source-space/federation limitations and large-model loading tests. Its engineering files are coordination examples and its 798 source-space records are not 798 independently verified physical rooms.

Rehearse once with a PM and once with a trade lead. Record the actual clicks, typing, missing context, retakes, time to find a location and time to understand a correction. Those observations should drive simplification. Automated state/geometry tests do not establish site value, live AI accuracy, visual acceptance or real-phone reliability.
