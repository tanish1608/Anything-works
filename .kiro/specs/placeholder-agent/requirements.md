# Placeholder AI Agent requirements

Status: requirements, October 6, 2026. The first review-only photo/runtime slice is implemented; broader acceptance remains in [docs/TASKS.md](../../../docs/TASKS.md).
Baseline: `origin/main` at `aa3692b`; branch `codex/placeholder-agent-design`.

Product name: **Placeholder AI**, as directed by the user. Inherited product docs/UI may still use earlier branding; persisted SiteMesh identifiers are unchanged. Existing BEAV task/requirement IDs remain stable tracking IDs.

## Current work and definition of done

Apply the user's selected [production-agent practices](https://blog.bytebytego.com/p/best-practices-for-building-ai-agents) to a reviewable design in the latest codebase. Done for this design means the architecture explains context, control flow, memory, narrow scope and human handoff; requirements have observable acceptance; the API draft matches the planned workflow; tasks distinguish implemented behavior from future work; document links and contract structure are checked. Runtime implementation, model accuracy and connector access are separate acceptance gates.

Placeholder AI extends the daily evidence-to-progress workflow in [PRODUCT_SPEC](../../../docs/PRODUCT_SPEC.md) and [MODEL_WORKFLOW](../../../docs/MODEL_WORKFLOW.md). It consumes the same project/model identities as Home, Logs, Building and field capture. It does not create a second building or reinterpret illustrated demo records as real evidence.

## Requested capabilities and acceptance

| ID | Requirement | Observable acceptance |
|---|---|---|
| BEAV-R1 | Receive image, text and recorded voice daily updates. | Preserve original assets, transcript, author, capture/receipt times, project, submission identity and location; offline retries produce one received submission. Voice can suggest scope but cannot itself prove installed work. Transcription errors can be corrected without erasing the original. |
| BEAV-R2 | Inspect updates against approved architectural drawings and project context; update progress and linked 3D components. | Pin the approved model revision, component IDs and applicable drawing/specification revisions. Store per-check observations, evidence references, limitations and outcomes. Unsupported, stale, occluded, unregistered or failed assessments never pass. Only a released check-specific policy may authorize scoped AI completion. Human acceptance and formal inspection remain separate. Model geometry never changes during a daily check. |
| BEAV-R3 | Offer autocomplete suggestions. | Suggest note wording, work roles, project locations and follow-up evidence from the authorized project. Suggestions are editable, contain stable IDs where relevant, never silently apply a mutation, and stop showing when the input or revision changes. Return an explained empty state when unavailable. |
| BEAV-R4 | Help assign work. | Return eligible project members by explicit work role, reporting hierarchy, authorized calendar availability and existing workload, with reasons and unknown/no-match states. Do not confuse owner/PM/trade access permissions with work qualifications. Assignment requires current membership and schedule checks at write time; manager-selected automatic routing is a separate persisted policy. |
| BEAV-R5 | Follow up through messages and phone. | Persist a due follow-up linked to work, recipient and purpose. Recheck unresolved work, membership, channel permission and quiet hours before dispatch; retries and provider callbacks do not duplicate actions. Support pause, cancellation, recipient opt-out and escalation to a manager. Channel delivery states are explicit; provider acceptance does not mean a person read it. External delivery is disabled until a configured channel policy authorizes it. |
| BEAV-R6 | Use iPhone LiDAR exports as evidence. | Identify supported export formats explicitly; preserve original files, units, coordinate frame, source app, capture time and registration method/error against the pinned model. Only registered, adequately covered geometry can support released geometric checks. A surface scan cannot prove concealed work or measured performance. Unsupported exports remain unsupported. |
| BEAV-R7 | Analyze project data. | Answer progress/change/workload questions from authorized persisted records using bounded deterministic aggregations and source links; distinguish capture time from receipt time, partial history from full history, and unknown from zero. AI prose cannot invent counts or equate component counts to physical/labor completion. |
| BEAV-R8 | Use open-source integrations through MCP. | Connect approved MCP servers through a native client with credentials bound to the correct user/project. Discover only allowlisted tools; enable minimum account scopes. Calendar/communication connectors must pass a real authentication and read/write-boundary test before being called ready. Connector downtime cannot bypass business policy or lose updates. |
| BEAV-R9 | Support concurrent crews and multiple projects. | Isolate organization/project/actor memory, checkpoints, assets and connector identity; accept updates while assessment workers are busy; enforce configured fair-share processing and limits. Concurrent submissions/reviews cannot overwrite newer evidence, duplicate actions or double-book an enforced assignment. Measure the agreed pilot workload, queue age, response/result latency, failures and cost before claiming capacity. |

## Business use cases

These are target workflows in Kiro-style user stories and acceptance scenarios. They do not claim existing backend integration. The [architecture](../../../docs/architecture.md) explains mechanisms; [TASKS](../../../docs/TASKS.md) records delivery state. Priority `First` is the initial evidence-to-review release; `Next` and `Later` depend on that release. Automatic completion has its own evaluation gate.

The first implemented check is `visible_component_presence`, with manager review required. It uses approved converted drawing primitives; raw sheet visual comparison and released automatic completion are later validation work. Implementation evidence does not change the acceptance criteria below.

### Current demo boundary — at least two people

User decision: build the first demonstration for **at least two people**, using one worker and one PM in the same project. Two distinct browser sessions/devices use separate authorized identities; the worker's update is persisted on the server and becomes visible to the PM. This proves shared business state, not a production scale claim. A browser-local role preview does not satisfy this scenario.

The required demonstration is PA-UC-01 → PA-UC-02 → PA-UC-03, with the saved decision visible in Home/Logs to both users according to their permissions. Use the chosen interface and existing model. Live assessment needs configured provider access and a defined supported check/reference; fixture-driven results may illustrate the flow only when clearly identified as such. Recorded voice and editable text helpers are now prioritized in the teammate extension below. Calendar ranking, automatic routing, external follow-ups, LiDAR and organization-scale capacity remain later scenarios.

**Demo acceptance:**

1. GIVEN the PM and worker have distinct identities and membership in one project, WHEN they open separate sessions, THEN both SHALL access the same authorized project records through the chosen interface.
2. WHEN the worker submits a photo/note for a confirmed task/location, the server SHALL persist its identity and original evidence; the PM SHALL see received/checking/result states and evidence without copying records manually.
3. WHEN the assessment finishes, the PM SHALL see structured observations, applicable source links and limitations. Fixture and live results SHALL be distinguishable. Unsupported/failed checks SHALL not become completions.
4. WHEN the PM accepts or rejects the exact current proposal, the system SHALL retain that decision and provenance; Home/Logs and the linked model SHALL reflect the same stored outcome. The worker SHALL NOT have PM approval permission.
5. WHEN either user refreshes or the worker retries a submission, the same records SHALL remain and no duplicate action SHALL occur. Concurrent updates SHALL not erase each other.
6. A provider double/fixture may verify workflow behavior; only an actual successful provider assessment SHALL be described as a live AI check. Neither demonstrates validated field accuracy or released automatic completion.

### Teammate demonstration extension — voice and text helpers

User prioritized recorded transcription, autocomplete and routine summaries after the initial photo slice. BEAV-005 implements recorded audio now; LiDAR remains deferred. BEAV-006 implements note/location/evidence wording and summaries now; assignment/calendar ranking remains deferred.

1. An authorized worker SHALL upload or record WAV, MP3, M4A, Ogg or WebM audio (at most 8 MiB), confirming project, zone and trade. Intake SHALL retain original bytes/checksum, author, receipt time, optional capture time and scoped retry identity independently of provider success.
2. Transcription SHALL run as a bounded persisted job. Failure SHALL remain visible; execution SHALL allow at most two total attempts (initial plus one expired-lease recovery) and reject late results. Reading original audio/transcripts SHALL recheck project/trade/zone permissions.
3. The author SHALL correct a completed transcript using its current revision. Original provider text and audio SHALL remain intact; stale or non-author edits SHALL fail. Applying text to a photo update SHALL be an explicit editable copy, not proof of installed work.
4. Autocomplete SHALL return at most five editable suggestions using only authorized current model components. Unknown identifiers, changed source context or provider failure SHALL not yield usable suggestions. Clients SHALL discard a response after the draft, selected components or model revision changes.
5. Daily summaries SHALL be generated only on an explicit authorized refresh and persisted separately for each actor/date/timezone/current scope. GET SHALL not call a provider. Changed records or permissions SHALL invalidate stored summaries. At most 100 eligible events SHALL be considered; incomplete coverage SHALL be labeled.
6. The model SHALL select/order facts extracted from saved events; server-rendered statements SHALL preserve actual status/decision semantics and cite event IDs and available run IDs. Counts/time/status SHALL not be invented by free-form model prose. The date is the local receipt/event date, not an inferred date of physical work.
7. The real UI SHALL expose audio states, original playback, original/editable transcripts, optional suggestion acceptance and date-based summary refresh/source links. Provider doubles demonstrate workflow tests only; actual Gemini calls and browser microphone acceptance remain separate verification.

### PA-UC-01 — Establish the project reference

**Actor:** project manager. **Priority:** First. **Requirements:** BEAV-R2/R9.

**Story:** As a PM, I want approved drawings, a model, locations and responsible teams attached to my project so every crew is checked against the same agreed reference.

**Flow:** select project → review model/drawing revisions → define location and work scope → identify applicable checks and reviewer → publish the approved reference. Existing model/drawing import is reused. Team/hierarchy additions have separate contracts.

**Acceptance:** WHEN an update is received, the system SHALL bind it to its confirmed project/location and applicable approved reference revisions. IF the reference or location is missing/ambiguous, the system SHALL request setup/location clarification without inventing geometry or completing work. A newly approved revision SHALL invalidate affected pending decisions while retaining their history.

### PA-UC-02 — Submit and assess daily work

**Actor:** worker or foreman. **Priority:** First for photos/text; Next for voice. **Requirements:** BEAV-R1/R2/R3/R9.

**Story:** As a worker, I want to select my task, take photos and describe my work once so the PM can see what happened without collecting separate reports.

**Flow:** confirm room/task → capture photos and note → save/submit → receive submission acknowledgment → background assessment → see result or a specific evidence request. Autocomplete suggests wording/location without changing the worker's submission silently.

**Acceptance:** GIVEN a worker submits photos for a confirmed room, WHEN the supported check runs, THEN its result SHALL cite those assets and applicable sources and appear on that room/work record. WHEN connectivity is unavailable, the client SHALL show a local queued state; retry SHALL preserve submission identity. IF a required detail is hidden or the provider fails, the result SHALL remain insufficient/failed rather than complete.

### PA-UC-03 — Review an exception and update shared progress

**Actor:** PM or authorized reviewer. **Priority:** First. **Requirements:** BEAV-R2/R7/R9.

**Story:** As a PM, I want evidence, the applicable drawing and an explained proposed action together so I can resolve uncertainty and maintain one trustworthy project view.

**Flow:** open Home work item/model pin → inspect photo/reference comparison → accept, reject or request more evidence → record decision → refresh Home/Logs and the same model components.

**Acceptance:** WHEN a reviewer acts, the system SHALL recheck permission, evidence and source revisions and bind the decision to the exact proposal. GIVEN two reviewers act concurrently on that proposal, only one final decision SHALL apply; the other SHALL receive a conflict/current state. A human-accepted result SHALL identify the reviewer and remain distinct from AI completion and formal inspection. Released policy-authorized AI completion SHALL follow the separate completion boundary below.

### PA-UC-04 — Route and resolve a correction

**Actor:** PM, trade lead and assigned worker. **Priority:** Next. **Requirements:** BEAV-R1/R2/R4/R5/R9.

**Story:** As a trade lead, I want a finding attached to a location, responsible role and resolution criteria so my crew can correct it and show the result.

**Flow:** confirm finding → choose responsible role/member → record due date and required evidence → worker submits correction → new assessment → authorized resolution decision.

**Acceptance:** A confirmed issue SHALL preserve the original finding and all correction evidence. A new correction submission SHALL create a new assessment linked to that issue. The issue SHALL remain open until its defined resolution workflow succeeds; uploading a new photo alone SHALL NOT close it. An unresolved relevant issue SHALL remain visible even if older progress was complete.

### PA-UC-05 — Suggest or assign the right person

**Actor:** PM or trade lead with assignment permission. **Priority:** Next. **Requirements:** BEAV-R4/R8/R9.

**Story:** As a manager, I want eligible people suggested by work role, team hierarchy, calendars and existing commitments so I can assign work without searching every contact manually.

**Flow:** define task, location, required role and time → filter eligible project members → rank using current authorized availability/workload → explain candidates → manager confirms, or a manager-enabled routing policy assigns → notify the assignee.

**Acceptance:** Permission role and work qualification SHALL be separate. Missing duration, skills or calendar coverage SHALL appear as unknown and SHALL NOT be presented as guaranteed availability. Before assignment, the system SHALL recheck membership and current schedule. If two assignments contend for the same enforced exclusive time slot, only one SHALL commit. Authorized free/busy may incorporate cross-project commitments without revealing another project's private task details. Automatic routing SHALL run only under a persisted manager-selected policy; suggestions alone SHALL NOT assign work.

### PA-UC-06 — Follow up and escalate unresolved work

**Actor:** manager through configured policy; recipient is the responsible person. **Priority:** Later; in-app reminders can precede external channels. **Requirements:** BEAV-R5/R8/R9.

**Story:** As a PM, I want the system to remind the responsible person and escalate overdue work so I do not have to chase each update myself.

**Flow:** persist follow-up schedule → recheck unresolved work/recipient/channel policy → dispatch approved message or call → record actual delivery state → link reply/new evidence → stop, reschedule or escalate according to policy.

**Acceptance:** Resolved/cancelled work SHALL stop pending reminders. Quiet hours, opt-out and attempt limits SHALL be honored. A duplicate scheduler claim or provider callback SHALL NOT duplicate the domain action. An ambiguous provider timeout SHALL remain unknown pending reconciliation. A recipient reply SHALL be treated as evidence/input, not proof of completion or permission to alter policy.

### PA-UC-07 — Understand today and compare history

**Actor:** PM; customer/client sees only authorized shared information. **Priority:** Next. **Requirements:** BEAV-R7/R9.

**Story:** As a PM, I want a daily summary and calendar comparison of completed work, new findings and outstanding requests so I can decide where attention is needed.

**Flow:** open Home summary → select cited item → inspect corresponding model/work record → open Logs → compare dates → inspect retained evidence and decisions.

**Acceptance:** Counts and changes SHALL be computed from persisted records for an explicit period/timezone. Every factual summary statement SHALL link to supporting records. Missing history SHALL remain partial/unknown. Customer summaries SHALL be generated from their permitted shared records, rather than hiding labels in a more privileged summary. Portfolio views SHALL include only projects the requester may access.

### PA-UC-08 — Use a phone scan for a supported geometric check

**Actor:** worker or survey/capture operator. **Priority:** Later. **Requirements:** BEAV-R6.

**Story:** As a capture operator, I want a supported phone scan attached to the correct room/model so a validated geometric check can use measured evidence.

**Flow:** upload a supported export → preserve original and capture metadata → confirm location → register to approved model → validate coverage/registration → run the supported measurement check → persist result and limitations.

**Acceptance:** Unsupported formats, wrong-room alignment, unknown units and failed registration SHALL prevent geometric completion. A scan SHALL NOT silently modify approved geometry or establish concealed/functional work. The first adapter SHALL be selected from an actual worker export before implementation.

### PA-UC-09 — Handle an end-of-shift surge across crews

**Actor:** many workers and PMs sharing the service. **Priority:** First for isolation/concurrency/recovery; measured broader capacity before expanded rollout. **Requirements:** BEAV-R9.

**Story:** As a contractor, I want many crews to submit together and different managers to keep working so one busy project does not stall or expose another project.

**Acceptance:** WHEN workers submit simultaneously, the system SHALL persist each authorized received update independently of model processing. A busy assessment queue SHALL not block already available project reads or reviewer actions. A run awaiting review SHALL hold no active worker or model session. Every resumed run SHALL retain its own project/actor scope. Concurrent work on the same component SHALL retain all observations and apply revision-checked decisions; different component work SHALL be eligible for parallel processing. Retry/recovery SHALL reject writes from an expired worker lease. Capacity tests SHALL report the configured workload and observed results without inferring capacity from user count alone.

## Pilot workload and traceability

The initial demo target is **at least two people in one project**, as confirmed by the user. Verify the six demo acceptance scenarios above before wider capacity work. A PM plus one worker establishes the minimum; it is not a configured maximum.

For later planning only: 50 workers × three updates/day × three photos/update gives 150 updates and 450 photos/day. Ten such projects give 1,500 updates and 4,500 photos/day. Test a 30-minute shift-end surge plus concurrent reads/reviews and a worker/provider failure once a larger rollout is actually selected. These figures are workload inputs, not observed capacity. Set latency targets with that operator before declaring load acceptance.

| Business outcome | Requirement IDs | Implementation tasks |
|---|---|---|
| Approved context and daily submission | BEAV-R1/R2/R3/R9 | BEAV-002/003; existing product P1.1/P1.2 |
| Review, shared progress and correction history | BEAV-R1/R2/R7/R9 | BEAV-003/004/006; existing product P1.3/P3.2 |
| Role-based assignment and availability | BEAV-R4/R8/R9 | BEAV-000/006/007/009 |
| Scheduled follow-up and integrations | BEAV-R5/R8/R9 | BEAV-007/009 |
| Cited summaries and date comparison | BEAV-R7/R9 | BEAV-003/006/009 |
| Voice and registered scan inputs | BEAV-R1/R6 | BEAV-005 |
| Concurrent crews, isolation and burst handling | BEAV-R9 | BEAV-003/009 |

## Cross-cutting acceptance

- Project, member, asset, component and drawing scope is enforced server-side before retrieval, when executing each tool, and again when applying any action.
- Store run input snapshots, public results, tool audit records, model/prompt/policy versions and usage. Do not expose private reasoning or provider secrets.
- A run has bounded model requests, tool calls, context size, wall time and spend. Provider outages produce a persisted failure; queued evidence remains usable.
- Restart/retry/duplicate worker claims cannot duplicate progress, assignments or deliveries. Cancellation and superseded results cannot subsequently mutate project state.
- Treat text in photos, drawings, transcriptions and messages as evidence, never as instructions that can expand tool access.
- Credentials are server-owned. A client cannot supply executable tools, conversation history containing authorizations, or an arbitrary model endpoint.
- APIs use the same contracts for web and a later Flutter client. iPhone scan acquisition can be native later; scan upload and processing stay server-side.
- Application-owned, versioned prompts and a bounded context builder record the prompt version and retrieved source IDs on every assessment. A framework cannot silently substitute its defaults for these instructions.
- Persist working state before review/waits; restart reconstructs it without losing accepted results or repeating a mutation. Refresh project facts/permissions before resuming. Store confirmed preferences with scope, source and edit/revoke support; inferred memories cannot grant permission or establish evidence.
- Begin with one orchestrator and named workflows. Model interpretation/drafting produces typed results; deterministic code owns transitions, stopping conditions and policy. Identical model inputs are not assumed to produce identical outputs.

## Completion boundary

Default initial release: persist an assessment and route it to review. Automatic AI completion becomes available only for named checks with an accepted evidence catalog, measured evaluation and a versioned released policy. This implements the existing product's automation requirement without reusing legacy confidence-threshold auto-approval. Formal inspection cannot be issued by Placeholder AI.

Manager approvals bind to the exact proposed action, revision and evidence snapshot. Fresh evidence, changed approved drawings, model reconciliation or an open relevant issue invalidates stale completion decisions. Rechecking previously completed work is required; do not carry over the legacy skip-done rule.

## Assumptions and unresolved decisions

1. Hosted versus local/hybrid inference and deployment hardware: user question pending. Model choice remains configurable; no local latency or construction accuracy has been measured.
2. User confirmed intended LiDAR-capable devices but has not selected a scanning app/export. Keep a format-neutral scan asset boundary. RoomPlan JSON plus USDZ is a candidate first adapter; PLY/E57 support depends on actual exports, not a blanket promise or an assumption that all scans improve accuracy.
3. First supported check catalog and false-completion release tolerance need a construction reviewer and real, permissioned examples.
4. Work qualifications, schedules and channel preferences are not implemented on the latest `main`; old `dev` has related partial work and incompatible migration history. Reconcile it in BEAV-000 before reusing it.
5. SMS/voice provider and contact/consent policy remain open. Designing follow-up capability does not enable actual sends or calls.
6. Demo size is resolved: at least two people, one PM and one worker. Broader rollout workload and performance targets remain deferred; no multi-service infrastructure is required just to illustrate that future path.

See [architecture](../../../docs/architecture.md), [framework decision](../../../docs/decisions/0001-placeholder-agent-harness.md), [draft OpenAPI](../../../contracts/openapi.yaml) and [tasks](../../../docs/TASKS.md).

### Project Copilot — contextual assistance in iteration 2

User-confirmed placement: a chatbot component at the top of the existing building workspace, available while contextual panels and the same model remain mounted.

1. Keep `codex/design-iteration-2` building/camera/panel behavior. Opening or closing Project Copilot must not replace/remount the building or lose selection.
2. Show the current panel, selected work/component and local sample provenance. Sending requires real authentication and an explicitly selected authorized server project. Browser-local canvas data is untrusted context, never certified evidence or a silently matched database project.
3. A bounded read-only chat request includes the question, page, display context and at most eight recent session turns. Server retrieval includes at most 25 authorized current model components and 20 visible issues; apply visibility before limits and revalidate scope/source snapshots after inference. Label partial coverage; never infer complete project totals, physical completion or assignment authority.
4. Validate provider citations against server-supplied source keys and construct public references server-side. Unknown/duplicate citations, malformed responses or provider failures expose an unavailable result. No model tools, arbitrary URL retrieval or progress/assignment/message writes are allowed.
5. Echo an input revision; discard late replies after identity, project or page/context changes. Clear conversation on sign-out/project/context change. Conversation memory is session-only for this slice; no durable chat-memory claim.
6. Expand/collapse, connect/sign-in, send, suggested follow-up, clear, sign-out and context navigation controls have visible outcomes and meaningful handler tests. Browser tests must distinguish local UI checks from optional real-provider acceptance.

7. Project Copilot opens without login for the currently displayed browser-local project/context. This public mode receives only explicitly labeled local display context and session turns; it has no project/database facts, citations, tools or write authority.
8. The public Project Copilot endpoint returns an unavailable result when the provider is unavailable or attempts to cite a source. It must never invent a database-backed answer from local canvas text, expose project records, or imply that a sample status is an inspection result.
9. The copilot's photo action and composer attachment control open a device image picker. Preview and remove selected images; enforce the existing six-photo/12 MB per-image limits. Adding them to the daily update preserves the chosen work, existing draft photos and note. Local attachments are passed into the capture workflow for location confirmation and review, never sent to the text-only chat API or presented as an AI inspection.
