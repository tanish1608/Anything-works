# Repository operating contract

Follow the user's repository instructions. The user authorized implementation after the design review. This branch implements the scoped Placeholder AI photo-assessment, recorded-voice and read-only text-helper slices against `origin/main` at `aa3692b`; it does not merge divergent old `dev` or enable external communications.

The user selected ByteByteGo's production-agent principles. Application code owns prompts, bounded context, workflow transitions and persisted memory. LangGraph is the preferred pause/resume adapter pending compatibility/recovery tests. Keep the chosen root workspace UI; do not restore retired routes. Inherited branding is subordinate to the user's Placeholder AI name; preserve persisted/internal identifiers.

Read progressively: `.kiro/specs/placeholder-agent/requirements.md`, relevant `contracts/openapi.yaml` operations, `docs/architecture.md`, `docs/decisions/`, `docs/TASKS.md`, then nearby source/tests. Report conflicts. `STATUS.md` records current behavior; drafts and fictional workspace results are not implemented agent capabilities.

Keep changes surgical. Reuse FastAPI, SQLAlchemy, existing jobs/storage/events and the shared viewer. Domain logic, validation, evidence rules and authorization belong server-side; APIs remain usable by a later Flutter client. Never create another model or fictional production evidence to make a workflow appear complete.

API work starts with reviewed requirements and OpenAPI. Thirteen assessment/voice/suggestion/summary operations are implemented and contract-tested after independent contract review. Web DTOs are generated from the checked schemas. Workers report `CONTRACT_CHANGE_REQUIRED` before changing them. Do not weaken evidence, project scope, completion policy or approval checks to accommodate a model/provider.

Track work with stable IDs, owner, branch/PR, dependencies, acceptance and actual verification in `docs/TASKS.md`. Use separate branches/worktrees and scoped ownership for explicitly authorized parallel work. Product supervision owns acceptance; workers do not self-certify independently reviewed tasks.

Run the smallest meaningful verification, including regression/contract/auth/migration tests where applicable. Record unverified browser, model and connector behavior precisely. Design checks alone validate structure/links; `backend/tests/test_agent_contract.py` also compares implemented schemas and operations. Neither substitutes for full OpenAPI metaschema validation or live browser/model acceptance.

Do not overwrite user work, change production data, install speculative infrastructure, send messages/calls or push/deploy without authorization. Keep secrets and private evidence out of Git; never expose private reasoning. Use canonical docs rather than duplicate plans/handoffs. PRs describe purpose, choices, verification, contract changes and remaining risks; commits use one short imperative subject with no AI attribution.
