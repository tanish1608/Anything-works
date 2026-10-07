# AI checks — review-only work assessment

Status: implemented October 6, 2026. Since the `mobile-ios` branch, policy `ai-complete-v1` marks work "AI-checked complete" when every photo and measurement check passes and no issue is open (PM can reopen; per-project opt-out `ai_auto_complete: false`). Otherwise results are suggestions for the PM.

## What it does

When a crew update is **received by the server** for a tracked work item, and `AGENT_ENABLED=true` with a Gemini key, the backend queues one check run. The run asks Gemini to compare the photos with the work item's approved reference and return one observation per component. The project manager sees the result on the work record and decides.

```
crew update received ──► work_assessments row (queued, frozen context) ──► job: Gemini call (no DB txn held)
        │                                                                          │
        ▼                                                                          ▼
  manual review as before                         server validation (IDs, cited photos, pass needs evidence)
                                                                                   │
                         PM sees "AI check" card ◄── completed / failed / superseded (newer evidence)
                                   │
                         PM's own decision (accept, request evidence, confirm issue, resolve/return correction)
                         recorded under the PM's name with the AI run as provenance
```

## Contract

**Context sent to the model** (`app/agent/assessment.py::build_context`, frozen and hashed per run):

| Field | Source |
|---|---|
| `work` | title, trade, scope, capture guidance |
| `location` | building, level, room, space code from the submission receipt |
| `reference` | approved model revision label |
| `elements[]` | component id, name, IFC class, discipline, up to 20 short properties, size in metres |
| `sources[]` | `{kind: "model", id: version, locator: "element:<id>", sha256}` per component |
| `correction_of_issue` | open issue title and problem text, or `null` |
| `worker_note`, `worker_claim` | from the update; untrusted, a claim is not evidence |
| `photos[]` | photo id and sha256; bytes are re-checked before sending |
| `prompt_version`, `policy_version`, `model_version_id` | versioning |

**Model output** (strict schema, `app/agent/prompt.py::OUTPUT_SCHEMA`): `observations[]` of `{element_id, outcome, observation, evidence_ids, limitations}` with outcome `pass | potential_discrepancy | insufficient_evidence | unsupported`.

**Stored result** (`work_assessments.result`): per-component `checks[]` (adds `check_code`, `check_version`, `sources`, `completion_eligible: false`), a `suggestion` `{outcome, decision, reason}`, model, timing and token counts, or a public `error`.

Suggestion mapping: any possible mistake → confirm issue (or return the correction); all pass → accept (or accept the correction); otherwise → request evidence.

**Validation (fails closed):** unknown or duplicate component ids, photos that were not submitted, a `pass` without cited photos, changed photo bytes, provider refusal, invalid JSON or provider error → run `failed`, nothing changes. A run that finishes after newer evidence or an approved reference change is `superseded`.

**PM decision provenance:** `POST /api/work/{id}/decisions` accepts an optional `assessment_id`. It must be the completed run for the work's current update; the event text records that the PM decided after reviewing that AI check.

## What was ported, and what changed

From `codex/design-iteration-2` (`backend/app/agent/`): the Gemini call shape, the strict observation schema, the server-side citation validation, the "review-only" policy, the prompt's safety rules (untrusted inputs, no certification, absence only when visible) and the public-error handling.

Changed on purpose:

1. **Runs on shared work packages**, not legacy zone uploads, so it fits the website's current workflow.
2. **Uses the approved IFC model component as the reference.** The original required an approved 2D drawing extraction per component and otherwise returned "insufficient evidence" without calling the model, so IFC projects (all current samples) were never checked.
3. **Checks mistakes and corrections, not only presence:** clearly wrong type, placement or incomplete work is a possible mistake; for a correction, the open issue's problem must be visibly gone to pass.
4. **Explicit Gemini schema.** The Pydantic-generated schema (`$defs`/`$ref`) is rejected by Gemini with `400 INVALID_ARGUMENT`; the original live path failed for this reason.
5. **Queued automatically on receipt** instead of a separate client call with idempotency keys; one run per update and input hash.
6. **PM decisions reuse the existing work decisions** instead of a parallel accept/reject API that wrote legacy element status.

Not ported: Project Copilot chat, voice transcription, wording suggestions, AI daily summary, coordination/calendar helpers, drawing reference freezing, lease/recovery, Docker and OpenAPI tooling.

## Running it

```bash
# backend/.env
GEMINI_API_KEY=...
AGENT_ENABLED=true
```

Tests use a fake provider (`backend/tests/test_work_assessment.py`); the suite never calls Gemini.

## Project Copilot chat and photo updates

A floating **Copilot** button opens a chat on every project screen (ported from the `codex/design-iteration-2` Project Copilot and re-targeted at shared work records).

- **Ask:** answers from the work records the person is allowed to see. Connected projects use `POST /api/projects/{id}/copilot/chat`, which builds context from the same authorized workspace snapshot as the UI (trade/zone scope applies), up to 40 work records and 12 recent events, including the latest AI check outcome. Public samples use `POST /api/copilot/public-chat` with the browser's visible sample records (untrusted, nothing authenticated) and a per-process rate limit (`AGENT_PUBLIC_CHAT_PER_MINUTE`, default 20).
- **Send photos:** attach photos (phone camera or files) and describe the work. The copilot suggests up to three work items the photos belong to, limited to work the person can submit for. The person picks the work item, edits the note and ticks the location confirmation; only then is the update submitted through the normal update path (the offline outbox on connected projects, the local record on samples). On connected projects the AI check then runs and its outcome appears in the chat.
- **Without the AI:** if chat is off or fails, photos can still be sent; the person must choose the work item (nothing is guessed).
- **Guarantees:** the copilot never changes records. Cited records and suggested work ids are validated server-side against the person's context; an answer that cites anything else is replaced with "unavailable". Customers can ask questions but cannot attach photos. A copilot update never discards another update the person is still writing.

Not ported from the original copilot: draggable/resizable window, avatar image, calendar coordination, LiDAR shortcut, assignment drafting.

## Measurements and AI completion (`mobile-ios`)

Updates may carry `capture` (multipart JSON field): `measurements[]` (`kind: "mounting_height"`, `value_m`, `uncertainty_m`, `method`), `location` (GPS fix) and `device`. The server computes the component's expected centre height above its level from the approved model and compares: within `tolerance - uncertainty` → pass; beyond `tolerance + uncertainty` → possible mistake; otherwise or if uncertainty exceeds the tolerance → not enough evidence. The model never sees measurements or policy fields.

If the project policy is on, every check (photos and measurements) passes, the work is in review and no issue is open on it or its component, the run marks the work `ai` / "AI-checked complete", sets the element done with `completion_basis: "ai"`, records a `work.ai_completed` event (actor: Placeholder AI) and notifies the assignee and managers. A passing correction never closes an issue.
