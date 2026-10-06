# Placeholder AI task ledger

Baseline: `origin/codex/design-iteration-2` at `6c42490`, current branch `codex/design-iteration-2`. Agent implementation `c8400f6` was preserved and cherry-picked as `e7af584`. This worktree is `/Users/salauatkakimzanov/Desktop/Uni/sf-hack/Anything-works-agent`. Old `dev` and its APP task ledger remain in the original worktree; this ledger tracks the new Placeholder AI work only. Existing product backlog remains in [TODO.md](../TODO.md).

BEAV IDs are retained for continuity; the product/agent name is Placeholder AI. The user selected ByteByteGo's practices; LangGraph is the preferred pause/resume direction, with adoption pending implementation verification rather than an installed dependency.

## Business milestone — two-person demo

User-confirmed initial scope: **at least two people, one PM and one worker, one shared project**. Demonstrate approved context → worker photo/note submission → persisted assessment → PM review → consistent Home/Logs/model result. The chosen public sample workspace remains distinct from authorized shared backend data. Calendar assignment, messages/calls and scan inputs follow later; no large deployment is required for this milestone.

BEAV-002 supplies assessment behavior; BEAV-003 supplies durable shared records and chosen-UI integration. BEAV-004 is required before any claim of validated automatic completion, not for a clearly attributed PM acceptance. See the six [demo acceptance scenarios](../.kiro/specs/placeholder-agent/requirements.md#current-demo-boundary--at-least-two-people).

| ID | Status | Owner | Branch / PR | Dependency or blocker | Acceptance |
|---|---|---|---|---|---|
| BEAV-001 | REVIEW | Codex | `codex/design-iteration-2` / none | Independent design review; first check and deployment decisions open | Trace agent requirements and selected ByteByteGo practices to context/control/state/scope acceptance; record memory design, framework/connector choices, provisional API and implementation sequence. |
| BEAV-000 | READY | Unassigned | none | Parallel migration `0007` and nine merge conflicts | Reconcile latest main with selected old-dev profile/people/calendar work; preserve stored data and latest workspace, resolve migration lineage, run frontend/backend/migration checks. Do not assume copying old models is safe. |
| BEAV-002 | REVIEW | Codex | `codex/design-iteration-2` / none | Provider access for live field eval | Implement one scoped photo/drawing assessment with versioned prompt, bounded source context, typed observations, citations and abstention. Use existing provider baseline and test doubles for failure/auth/schema paths. Real labeled evidence gates quality claims; optional open-weight comparison does not block a provider-neutral slice. No automatic green. |
| BEAV-003 | IN_PROGRESS | Codex | `codex/design-iteration-2` / none | Home/Logs integration, browser/provider acceptance; LangGraph saver adoption | Persist run/check/action state and LangGraph checkpoints; jobs dispatch execution, domain DB owns facts. Test restart, expired lease writes, duplicates, stale evidence/reference, wrong-project access, forged approvals, budgets and cancellation. Pass two-person demo with distinct scoped identities in chosen root UI: worker submission → PM review → shared Home/Logs/model result after refresh. Preserve model and route choice. |
| BEAV-004 | BACKLOG | Unassigned | none | BEAV-003; expert-labeled corpus and check policy | Release named checks with measured false-completion/abstention/coverage; separate AI observation, human acceptance and inspection; retire conflicting legacy auto-approval/skip-done paths. |
| BEAV-005 | IN_PROGRESS | Codex | `codex/design-iteration-2` / none | BEAV-003; actual voice samples/scan export | Preserve original audio and editable transcripts; implement one selected LiDAR adapter with units, registration/coverage, revision links and rejection tests. No unregistered measurements. |
| BEAV-006 | IN_PROGRESS | Codex | `codex/design-iteration-2` / none | BEAV-000/003; actual qualifications/calendar APIs | Rank eligible members with reasons and fresh availability; audit assignment policy, no-match and schedule rechecks; implement autocomplete and cited bounded analysis. |
| BEAV-007 | BACKLOG | Unassigned | none | BEAV-003; connector release/accounts and approved channel policy | Validate native MCP identity isolation and one ready-made calendar integration; implement reviewed follow-up outbox/flow with retry dedupe, quiet hours, opt-out, stop-on-resolution and real provider delivery states. Phone adapters follow provider selection. |
| BEAV-008 | REVIEW | Codex | `codex/design-iteration-2` / none | Independent review of business scenarios; user selected at least two people for demo | Document actor/story/flow/acceptance for nine business use cases; trace to requirements/tasks; explain two-person milestone and later concurrency/isolation path. Validate links/IDs; no implementation or capacity claims. |
| BEAV-010 | IN_PROGRESS | Codex | `codex/design-iteration-2` / none | Live browser/provider acceptance | Keep iteration-2 layout and one model; add top-of-page contextual Agent Isle with scoped read-only responses, verified button flows and explicit sample/server provenance. |
| BEAV-009 | BACKLOG | Unassigned | none | BEAV-003; larger rollout requested, workload/SLO agreement and contract review | Prove multiple worker/API instances with shared storage/DB, tenant isolation, fair scheduling, provider budgets and scoped projections. Test shift-end burst, restart/lease fencing, reviewer conflicts, cross-project assignment reservations and credential isolation as relevant features ship; record latency/queue age/failures/cost against selected targets. No new infrastructure solely for two-person demo. |

## How the documents relate

| Document | Question it answers | Example |
|---|---|---|
| `.kiro/specs/placeholder-agent/requirements.md` | What business outcome and observable behavior must work? | A worker's update reaches the PM once; only the PM can accept the current proposal. |
| `docs/architecture.md` | Which components, records and boundaries make that behavior possible? | Shared project DB, separate per-submission runs, scoped APIs and revision-safe writes. |
| `contracts/openapi.yaml` | What messages can web or later mobile exchange with the server? | Queue/read/cancel a run; decide an exact proposed action; use recorded voice, helper and read-only Agent Isle operations. Fourteen operations are implemented and contract-tested. |
| `docs/TASKS.md` | What delivery work remains, who owns it and what proves it? | BEAV-002 assessment, BEAV-003 shared demo, BEAV-004 evaluated automation. |

## Capability delivery status

These are agent requirements, not a list of finished features. This table applies to the new worktree; legacy/sample UI does not establish backend agent behavior.

| Requested capability | Current implementation | Remaining delivery task |
|---|---|---|
| Images/voice for daily updates | Scoped photo/text and recorded audio at `/agent`; original audio/text retained, author corrections and explicit note copying | BEAV-005: live transcription evaluation, real noisy-site samples and selected scan adapter |
| Inspect photos with drawings; update progress/model | Review-only visible presence against approved drawing extraction; PM acceptance stores human completion and refreshes authorized model pins | BEAV-003: shared root Home/Logs; BEAV-004: labeled check evaluation and released completion policy; original sheet interpretation is not claimed |
| Autocomplete | Explicit read-only suggestions from authorized current components; editable acceptance and stale-input rejection | BEAV-006: live model/UI evaluation and remaining assignment work |
| Help assign work | Not implemented; calendar/qualification constraints and explanations designed | BEAV-000/006 |
| Follow up via message/phone | In-app receipt/review/evidence-request notifications only; no external delivery/calls | BEAV-007 |
| iPhone LiDAR input | Not implemented; export/registration policy unresolved | BEAV-005 |
| Data analysis | Explicit AI daily-briefing refresh selects saved event IDs; server-rendered statements have citations, partial coverage and source freshness | BEAV-006: live model/UI evaluation and broader analysis/assignment |

## Implementation review and evidence — BEAV-002/003

Implemented five scoped assessment operations, four SQL records/migration `0008`, fenced jobs/recovery, typed Gemini adapter and the authenticated `/agent` workflow inside the iteration-2 UI. Source paths are in [architecture](architecture.md#implemented-review-only-photo-slice). Branch: `codex/design-iteration-2`; no PR. `BEAV-002` stays REVIEW and `BEAV-003` stays IN_PROGRESS because live evaluation and the full shared Home/Logs milestone remain open.

Independent read-only reviewer `agent_review` found two P2 defects: evidence-byte changes could be accepted, and disjoint component uploads invalidated reviews. Both were fixed; the reviewer independently reran the five new regression scenarios (5 passed) and reported no remaining findings in these changes. No Copilot/GitHub PR review is claimed.

Final backend verification after the fixes and explicit thinking configuration: `PYTHONPATH=. ../../Anything-works/backend/.venv/bin/python -m pytest -q` from this worktree's backend: **170 passed, 65 warnings**. Full web suite: **82 passed in 16 files**; `npx tsc -b` passed. Migration upgrade/downgrade/re-upgrade and old-user retention passed on disposable SQLite. Backend Ruff and script Ruff passed. Frontend lint completed with warnings, including the drawing-preview object-URL effect warning; it is not a warning-free result. Targeted regression/contract/CLI run after the two fixes: 34 passed. No test invoked a live provider.

Documentation structural check passed: seven unique OpenAPI operation IDs/path parameter sets, 63 resolved schema/response references, 13 required-property sets, 77 local document links, nine requirement IDs, nine business scenarios and ten valid task rows. Generated web DTOs reproduce exactly. This is structural validation; full OpenAPI metaschema validation remains unclaimed.

Live Gemini access is unverified: local configuration sees the key, but this sandbox cannot resolve the Gemini hostname. The smoke command in [DEVELOPMENT.md](DEVELOPMENT.md#placeholder-ai-agent-demo) sends no project data or progress writes. No listening socket/browser run was possible here. Vite production bundling is blocked by missing `@fontsource/inter`/`@fontsource/jetbrains-mono` packages and unavailable registry DNS; TypeScript passing is not a production build. PostgreSQL/multi-process concurrency, field accuracy and a real two-person browser flow remain unverified.

## Recorded voice and helper evidence — BEAV-005/006

Implemented the recorded-voice, editable-suggestion, daily-briefing and Agent Isle extension after independent contract review: nine additional operations, two tables/migration `0009`, generated DTOs and the workspace controls. BEAV-005/006/010 remain IN_PROGRESS because LiDAR, calendar/qualification assignment, live acceptance and browser/provider acceptance are still open. Live transcription, phone delivery and unrestricted data analysis are not implemented.

Latest complete suites: **202 backend tests passed, one skipped, 70 warnings** and **103 frontend tests passed in 19 files**. Targeted helper/provider/contract/migration verification: 27 passed; Agent Isle chat/contract verification: 15 passed. Tests cover scoped intake/reads, author-only revision corrections, retained originals, stale suggestions/summary sources, timezone handling, SQL scope before event limits, provider failures, single HTTP request on transcription 429/500, fenced job recovery, chat citation allowlists, issue visibility, sign-out, clearing, contextual panel changes and late-response fencing. All provider tests use doubles. TypeScript and changed backend/script Ruff passed; repository frontend lint still has existing warnings. Browser microphone capture, real Gemini transcription/chat, live model access, production bundling and noisy-site accuracy remain unverified. The [teammate walkthrough](DEVELOPMENT.md#teammate-test-walkthrough) provides direct host verification steps.

Current structural verification passed: 13 unique operations/path-parameter sets, 98 resolved references, 17 schema required-property sets, 78 local links, nine business cases, nine requirements and ten task rows. Generated DTOs reproduce exactly; `git diff --check` passed. These checks do not establish full OpenAPI metaschema or live-provider validity.

The user fetched `codex/design-iteration-2` from the host. Agent changes were cherry-picked onto that branch as `e7af584`, preserving iteration-2 Workspace and its tests. The top-of-page contextual Agent Isle is BEAV-010. No push or PR is claimed.

## Historical design-only verification for BEAV-001

Research uses primary repository/documentation sources linked in ADR 0001. This is a design review, not a deployed demo. No framework/model/connector was installed, benchmarked or invoked on a real site. No external message or phone call was sent.

Advanced the worktree baseline by fast-forward from `0a79d2d` to fetched `aa3692b`; no original-dev changes discarded. Renamed the draft agent paths and operation IDs before implementation. The draft now uses `/agent` paths; no deployed API was renamed.

Ran `/tmp/check-placeholder-design.py` with the existing original-worktree Python environment: YAML parses; six draft operation IDs/path parameter sets are valid; all 53 schema/response references resolve; 13 required-property sets are consistent; 31 local document links and all eight task IDs resolve. Placeholder AI branding and `/agent/` paths passed. `git diff --check` and a whitespace/end-of-file check of all seven changed documents passed. Chosen Home/Logs source paths exist. Full OpenAPI metaschema validation, runtime/API implementation, model/connector execution and browser acceptance were not performed; the design remains in REVIEW.

## Historical design-only verification for BEAV-008

Updated `/tmp/check-placeholder-design.py` passed: nine unique business cases, nine unique requirement IDs, ten unique task rows with permitted statuses, 35 local document links, YAML structure and the unchanged six operations/53 references/13 schema required-property sets. Document whitespace and `git diff --check` passed. This documentation change adds BEAV-R9 and use cases PA-UC-01 through PA-UC-09; it does not implement worker scaling, role views or a live two-person demo. No OpenAPI operation/schema was changed for this clarification; BEAV-009 requires contract review before future API/schema changes. UI flows, live model behavior and capacity remain unverified.
