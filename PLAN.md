# Build plan — Everything Works AI

Updated October 5, 2026. This replaces the old SiteMesh milestone plan. Application implementation follows in a separate coding task.

## Direction

Build a daily construction quality and progress loop: **upload → establish context → check → update completion or raise an issue → correct → keep 3D current**.

Support work across construction stages. Release individual checks incrementally. Electrical work before drywall is an example, not the product scope.

Read the [product specification](docs/PRODUCT_SPEC.md) for required behavior and [STATUS.md](STATUS.md) for the source-based inventory.

## Architecture to retain

- FastAPI, SQLAlchemy 2 and Alembic; SQLite for local development and PostgreSQL support.
- Central project/trade/zone access rules in `backend/app/rbac.py`.
- Storage abstraction for evidence and model assets; local files currently.
- DB-backed jobs for conversion and analysis; use the existing mechanism before adding infrastructure.
- Append-only events recorded in the same transaction as domain changes.
- Reviewed drawing conversion and IFC import; server-generated GLB assets.
- React, TypeScript, TanStack Query and a separate three.js viewer.
- IndexedDB field queue; reconnect and app-open retry behavior.
- Existing Gemini adapter and evaluation harness as integration foundations.

Do not rebuild these solely because the product narrative changed. Keep the browser-local Studio demo explicitly separate from authenticated project data.

## Proposed domain additions

These are design proposals, not existing table or API names. Finalize them during P0.

| Record | Purpose and key fields |
|---|---|
| DailyUpdate | Client submission ID, actor, project, location, task claims, attachments, capture/submission times, processing state |
| Requirement | Source document and revision, scope, expected condition, units/tolerance if applicable, approved-change links |
| CheckDefinition | Supported condition, required capture, applicability, check version, release state, completion eligibility |
| Assessment / CheckRun | Update, immutable reference snapshot, item/check IDs, observed result, evidence regions, model/prompt version, uncertainty |
| WorkAssessment | Evidence coverage, observed progress, AI completion decision, applicable policy version and human review status |
| Finding | Assessment link, location, issue lifecycle, owner, due date, resolution requirements |
| ReviewDecision | Reviewer, decision, scope, reason, timestamp and superseded decision |
| InspectionRecord | External/formal result and attachment, kept separate from AI completion |

Reuse existing Upload, Photo, Verification, Issue, Element and Event records where their semantics fit. Avoid maintaining two conflicting sources of truth. Write migration and compatibility mappings before changing progress storage.

## Processing flow

1. Accept an idempotent daily update and authorize every referenced object.
2. Persist evidence before enqueuing analysis.
3. Snapshot applicable plan revisions and check definitions.
4. Validate capture and match the location/work item; stop automatic decisions on ambiguity.
5. Run supported checks and validate structured outputs server-side.
6. Apply a versioned completion policy; keep failure and uncertainty explicit.
7. Commit observations, findings, progress changes and audit events together.
8. Update API query projections for daily summary, 3D colors and notifications.
9. Re-run only affected checks on new evidence or approved reference changes.

Use retry-safe job identities and reject stale analysis results. A job finishing after a drawing revision must not turn the affected work complete against the old reference.

## Delivery phases and exit conditions

| Phase | Deliverable | Exit condition |
|---|---|---|
| **P0 — Define and prepare** | Check catalog, example evidence, state contract, UX and evaluation plan | Team can label sample outcomes consistently and explain completion versus acceptance |
| **P1 — Daily workflow** | Persisted capture, context, evidence/review states and exception inbox | One update survives offline/retry and reaches a reviewer with correct reference context |
| **P2 — AI assessment and progress** | Supported checks, provenance, evaluation and controlled automatic completion | Per-check release criteria met; uncertainty, failures and stale inputs never produce completion |
| **P3 — 3D and corrections** | Model status projection, assigned issues, correction loop and daily progress Logs | Multi-outcome update changes the correct items and an issue can be resolved with retained evidence |
| **P4 — Pilot and hardening** | Real-site workflow evaluation, operations and economics | Evidence supports repeat use, manageable review burden and clear value for a buyer |
| **P5 — Expansion** | Additional checks/trades, voice/video, measurements, code and integrations | Each extension has validated inputs and a release gate |

For a hackathon, create a small vertical slice of P1–P3 with labeled fixtures where needed. P0 is still required. Broader automation and commercial readiness require P4; completing a demo does not complete the pilot gate.

No dates or ownership are assigned yet. Work can be divided by the packages in [TODO.md](TODO.md).

## Frontend plan

Adapt the existing demo's spatial navigation and task presentation into the new story. Build the connected daily submission and result view, comparison panel, exception inbox and correction detail against shared typed contracts.

Make status language consistent in mobile, model and Logs. Include loading, offline, failed analysis, inadequate capture, unsupported check and changed-reference states. Keep a 2D alternative for users who do not need 3D navigation.

Separate AI-checked complete, human accepted and formal inspection badges. Do not use a global “safe,” “compliant,” or “ready to cover” indicator based only on photo analysis.

## Legacy behavior to migrate

The current progress service treats installed evidence as a proposal for `done`; `vision_jobs.py` also supports a project-wide confidence-threshold auto-approval option.

The new direction requires a separate, scoped **AI-checked completion** record and formal human review status. Replace or isolate the legacy option before exposing the new workflow; do not merely enable it globally. Existing completed records need an explicit provenance mapping, including legacy AI decisions without a human actor.

The legacy analysis skips already-done elements. New daily updates must be able to surface contradictory evidence or affected revisions for previously completed items.

Current progress summaries count elements. Introduce task/check coverage first; do not relabel those counts as schedule, labor or cost completion.

## Validation strategy

- Unit/domain tests for permission boundaries, status transitions, policy gates, stale results and idempotency.
- Integration tests for upload → assessment → completion/finding → correction → event history.
- Browser tests for capture, failed uploads, offline/reconnect, review and model synchronization.
- Labeled field evaluation per check, with missed defects and false completions measured separately.
- Workflow study comparing combined field capture and office review effort with the customer's existing method.

Keep deterministic fixtures for demos and tests. Live model outputs require an evaluation record; API connectivity alone is not validation.

## Decisions to resolve before dependent coding

- Which concrete checks have usable real examples and an expert reviewer?
- How are work packages mapped to existing element/zone records?
- Which result types qualify for automatic completion, and what baseline and thresholds govern release?
- What is the minimum usable approved reference when plans are incomplete?
- How are approved changes, reopened work and manual overrides displayed?
- Which capture devices and offline conditions matter to the first design partners?
- What evidence access, retention and sharing policy is agreed with each pilot?

Do not block independent setup or interface prototyping while these are answered. Use explicit fixtures and assumptions, and keep unvalidated automation disabled.
