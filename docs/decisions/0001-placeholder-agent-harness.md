# ADR 0001 — Placeholder AI's bounded Python agent harness

Status: PROPOSED; research completed October 6, 2026. No framework installed or runtime benchmark performed.

## Decision and adoption boundary

Follow the user's selected [ByteByteGo production-agent practices](https://blog.bytebytego.com/p/best-practices-for-building-ai-agents). Implement named workflows inside the existing FastAPI backend; application code owns state transitions, authorization, budgets and side effects. The model interprets evidence and returns typed observations/proposals at explicit steps. Keep prompts and context assembly in version-controlled application code.

Preferred orchestration library: **LangGraph**, for the required persisted pause/resume and review steps. LangChain is optional for a needed model or MCP adapter, not the application's domain layer. Reuse the existing Gemini integration for the first provider baseline. PydanticAI remains an evaluated alternative; do not install both harnesses. The previous provisional PydanticAI recommendation is superseded by this user-directed workflow design.

No dependency is added by this ADR. BEAV-002 must prove provider compatibility and one assessment first; BEAV-003 must prove persistent checkpoints, restart recovery and safe application of results before adopting LangGraph in production. A simple ordinary-code assessment can establish the first baseline without a generic autonomous loop.

This is a fit assessment from current primary documentation and repository source, not a measured package-size, reliability or model-quality ranking. Pin a stable SDK version only after testing its provider/tool/output behavior with our Python 3.11+ environment.

## Open-source options

| Option | Verified capability and license | Fit for this codebase / retained application work |
|---|---|---|
| [PydanticAI](https://github.com/pydantic/pydantic-ai) | MIT; typed tools/outputs, model providers, multimodal inputs and deferred tool requests. [Slim installation](https://pydantic.dev/docs/ai/overview/install/) permits selecting provider extras. | Alternative when typed model/tool integration alone is enough. App still supplies project authorization, durable jobs and atomic policy application. Deferred approvals are a mechanism, not an authorization boundary. |
| [Nanobot](https://github.com/HKUDS/nanobot) | MIT; personal-agent loop with tools, memory, chat channels and scheduled automation. | Closest lightweight Hermes-style alternative. Useful channel/loop reference, but adopting its personal gateway/session model still needs project isolation, RBAC and domain persistence. Do not base selection on old “4,000 lines” claims; current scope has grown. |
| [smolagents](https://huggingface.co/docs/smolagents/index) | Apache-2.0; compact agents, vision input, CodeAgent and JSON ToolCallingAgent. | Good for a small experiment. Use ToolCallingAgent if selected; database authorization, approvals and restart handling remain ours. Model-authored Python is unnecessary for initial construction checks. |
| [Qwen-Agent](https://github.com/QwenLM/Qwen-Agent) | Apache-2.0; tools, document retrieval, multimodal Qwen examples and self-hosted model services. | Good if committing to Qwen. Provider-specific prompting/tool parsing warrants compatibility tests; optional interpreter/RAG/UI are unnecessary for our backend. |
| [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview) | Stateful graph workflows, persistence, interrupts and durable execution; usable without LangChain. | Preferred orchestration direction for review/resume. Use explicit nodes and persistent checkpoints inside the backend. Existing jobs dispatch work; SQL domain records remain authoritative. Framework checkpoints do not grant permissions or make writes exactly once. |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | MIT; persistent sessions, memory/skills, messaging gateway, cron and terminal backends. | Useful patterns for follow-ups and session continuity. Its general personal-agent/tool environment is a larger integration surface than Placeholder AI needs; do not fork the whole runtime for the MVP. |

Pydantic documents that [client-submitted deferred approvals do not establish authorization](https://pydantic.dev/docs/ai/tools-toolsets/deferred-tools/). Approval records, allowed actions and argument fingerprints must be checked against server-owned state.

## Model shortlist, separate from the harness

| Role | Candidate | What remains unverified |
|---|---|---|
| Open-weight image/drawing understanding and tool use | [Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B), Apache-2.0 | Official card covers multimodal and tool-calling use. Evaluate photo-to-drawing evidence, schema adherence and abstention; serving memory depends on precision, image resolution, context and concurrency. Do not claim it fits the user's machine without hardware information. |
| Alternative vision baseline | [Qwen3-VL-8B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct), Apache-2.0 | Compare on the same permissioned construction corpus rather than assuming model-card visual benchmarks establish inspection accuracy. |
| Recorded voice transcription | [Whisper large-v3-turbo](https://huggingface.co/openai/whisper-large-v3-turbo), MIT; [faster-whisper](https://github.com/SYSTRAN/faster-whisper) runtime | Test accents, noise, room identifiers, dimensions and trade vocabulary. Preserve audio and flag uncertainty; a transcript is a worker statement, not physical proof. Verify runtime support on the selected hardware. |
| Hosted initial baseline | Existing Gemini adapter in `backend/app/vision/client.py` | Reuse provider integration where possible. Validate selected deployed model availability and new structured output behavior; the current presence detector is not an evaluated architectural checker. |

The agent SDK does not train a model or make point-cloud reasoning reliable. Photos/drawing crops go to a vision model; scans go through geometric processing and registration, with resulting measurements/coverage available to the agent. Use a separate transcription adapter so a vision model does not have to support native audio.

### Gemini selection for the two-person demo

Decision, October 6, 2026: use the specific stable `gemini-3.8-flash` endpoint for the current bounded photo/text assessment; set the local demo's `VISION_EFFORT=medium`. Keep one provider/model path initially. The existing settings default remains high for deployments that have not explicitly configured effort. No automatic model fallback or new routing service is added.

Google's [3.8 Flash model card](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) documents text/image/video/audio/PDF inputs, text output, structured output and function calling. Low, medium and high thinking levels are supported; minimal is not. These capabilities fit our typed observation step, but do not prove construction accuracy. The adapter currently sends photos and extracted drawing primitives, not original PDF pages or audio; it exposes no model tools. Account access and one real structured request still require the smoke check in [DEVELOPMENT.md](../DEVELOPMENT.md).

| Workflow | Choice | Delivery boundary |
|---|---|---|
| Photos, approved drawing context, proposals | `gemini-3.8-flash` | Adapter implemented; live connectivity and labeled field evaluation pending. PM review remains mandatory. |
| Autocomplete, routine summaries and assignment explanations | [3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) | Editable suggestions and selection of cited daily-briefing facts are implemented. Live access/quality remain unverified. Assignment explanations and qualification/calendar enforcement remain BEAV-006 work. |
| Recorded voice → editable text | [3.5 Transcribe](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe) | Recorded BEAV-005 adapter implemented using the documented Interactions REST endpoint, with job-owned retries and no HTTP retry. Live transcription is not implemented. Preserve the original audio and verify trade terms/noise before treating transcripts as statements. |
| Live conversational follow-ups | [3.8 Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live) candidate | Planned BEAV-007; no phone integration or outbound delivery. A voice model does not provide telephony. |
| Difficult drawing interpretation | [3.1 Pro preview](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview) evaluation candidate | Not an automatic fallback or assumed improvement over 3.8 Flash. Compare on the same evidence before adding a second reviewer. |
| LiDAR measurements | Registered geometry processing, with measurements supplied to the primary model | Planned BEAV-005; no Gemini endpoint establishes dimensional accuracy from an unregistered phone scan. |

[Standard API pricing](https://ai.google.dev/gemini-api/docs/pricing), checked October 6, 2026: 3.8 Flash is $0.75 per million input tokens and $3.75 per million output tokens including thinking through December 31, 2026; prices rise to $1.50/$7.50 on January 1, 2027. 3.5 Flash-Lite is $0.30/$2.50. These are token prices, not measured per-update costs; photos, context and thinking affect consumption. Recheck pricing before a larger rollout. Flash-Lite and recorded Transcribe adapters now implement their named workflows; live connectivity and accuracy remain evaluation gates. Other models remain candidates.

## What to retain from Hermes-like systems

- Small explicit tool registry; only the tools needed for each workflow are exposed.
- Durable run/session identifiers and bounded context summaries containing source IDs.
- Scheduled re-entry with refreshed domain context for follow-ups.
- Channel adapters around the same project services.

Application records are authoritative memory. Do not enable unrestricted shell, SQL, browser actions, filesystem traversal or autonomous edits to released check policies. Add a sandboxed analysis executor only when a concrete data-analysis requirement cannot be met by bounded application queries.

## MCP client versus a connector catalog

[LangChain's MCP integration](https://docs.langchain.com/oss/python/langchain/mcp) can expose server tools to a model. Its current `langchain.mcp` namespace is documented as beta; verify and pin the selected client API before implementation. MCP support does not bundle authenticated Google/Microsoft/Twilio accounts or tenant mapping. Choose the construction workflow independently of the connector provider.

| Connector/workflow option | Verified offering | Proposed use / limit |
|---|---|---|
| [Activepieces](https://github.com/activepieces/activepieces) | Community core/pieces under MIT with [commercial enterprise exceptions](https://github.com/activepieces/activepieces/blob/main/LICENSE); large integration catalog and [built-in OAuth MCP server](https://www.activepieces.com/docs/mcp/overview). Its catalog includes calendar, email, Slack and telephony pieces. | First candidate for ready-made business connectors. Validate the selected self-hosted release and actual tool surfaces. Current MCP docs emphasize flow discovery/building/management; use reviewed, narrow execution flows rather than exposing publish/edit permissions to workers. Marketing app counts are not evidence each required operation works. |
| [Windmill](https://www.windmill.dev/docs/core_concepts/mcp) | MCP can expose scripts and flows as tools; workflow-oriented execution. | Alternative when versioned Python/TypeScript integration scripts are the main need. Check release/edition licensing and required feature availability before adoption; a script hub is not a pre-authorized connector account. |
| [IBM ContextForge](https://github.com/IBM/mcp-context-forge) | Apache-2.0 MCP/API gateway with federation, discovery and governance. | Consider later if multiple independent MCP servers need centralized access/control. It is a gateway, not the first calendar/phone integration, and adds an operational service. |
| [n8n](https://docs.n8n.io/advanced-ai/accessing-n8n-mcp-server) | Workflow platform with MCP access. [Sustainable Use License](https://docs.n8n.io/sustainable-use-license) has use restrictions. | Relevant functional comparator, but do not describe it as unrestricted MIT/Apache open source. Embedding it into a sold product needs separate license review. |

Recommended target: LangGraph for persisted orchestration when proven by BEAV-003; direct Python tools for construction domain services; a pinned MCP client and optional Activepieces Community Edition for approved external integrations. Prove one calendar read and one sandbox follow-up flow before expanding the catalog. No second service is installed by this design.

For each connection, persist owner/project mapping, allowed tool names/scopes, server identity/version and credential reference. Use identity-specific authenticated sessions; a pooled connection must not mix credentials or tool permissions between projects. Verify isolation with overlapping runs.

## Practices for business workflow automation

The selected article groups its guidance into context, control flow, state and scope. This repository turns those principles into observable acceptance rather than a broad tool-enabled chatbot:

| Principle | Placeholder AI implementation | Required evidence |
|---|---|---|
| Own prompts and context | Version prompts; retrieve the confirmed room, applicable approved sheets and relevant prior observations within configured limits. | Prompt/source revisions recorded; irrelevant or unauthorized records excluded. |
| Own control flow | Explicit intake → context → assessment → validation → review/apply; hard request, tool, time and spend caps. | Exhausted budget stops processing without completing work. |
| Keep memory in software | Persist run checkpoints and use project records as factual memory. Reload current business state at resume. | Restart preserves progress; changed evidence invalidates old proposals. |
| Keep scope narrow | One orchestrator with separate assessment, suggestion and assignment workflows; only required tools enabled. | Assessment cannot invoke calendar writes or send a message. |
| Design human handoff | Save the evidence, source snapshot, proposed action and reason before waiting. | Reviewer can inspect the exact proposal; approval replay cannot duplicate writes. |
| Measure before adding autonomy | Begin with photo/drawing review; measure errors and abstention on real examples before automatic completion. | Report actual DB/UI outcomes and false completions, not plausible prose. |

This does not assume model calls are deterministic: identical inputs can yield different outputs. Deterministic transitions, validation and recorded results make failures traceable; repeated-case evaluation measures model variability. See the article's primary references: [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) and [Anthropic's engineering guide](https://www.anthropic.com/engineering/building-effective-agents).

Additional application controls:

1. Keep intake, idempotency, scheduling, eligibility, evidence rules and writes deterministic. Use model judgment for interpretation, source selection, uncertainty and drafts.
2. Treat tools as narrow domain operations with typed inputs/results, scoped credentials and declared side effects. Do not turn the entire REST API or a connector catalog into unrestricted tools.
3. Persist state before waits; use bounded retries, leases, timeouts and an outbox for side effects. Long-running follow-up tasks survive worker restarts without holding a conversation open.
4. Gate writes with server policy; record exact proposed action/revision and its approval. Permit policy-authorized routine automation; require review for uncertainty and consequential exceptions.
5. Retrieve only applicable source context and record provenance. Documents/tool output are untrusted data, not permission grants. Validate identifiers and facts independently of model prose.
6. Measure end-to-end workflow success, false completion, abstention, duplicate writes/deliveries, latency and cost on representative scenarios. Start narrow before adding delegation. [Agent evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) emphasizes checking actual environment outcomes, not just a plausible answer.
7. Separate protocol authentication from domain authorization. Follow [MCP security guidance](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices): audience-bound tokens, no token passthrough, validated upstream access and consent. A successful MCP call does not establish that a worker may assign a task or expose a project's documents.

These are design controls tailored to the repository; none is claimed implemented or empirically verified here.

## Implementation consequences

- Candidate dependency: LangGraph with a persistent saver compatible with the configured database. Select and pin versions in the implementation task. LangChain provider/MCP packages, transcription and geometry packages are added only for adapters actually implemented.
- Use existing storage, notifications, events and jobs. Do not add Redis, a vector database, Temporal or a second agent service for the first slice.
- The baseline jobs queue only claimed queued work. Agent runs now add leases/recovery and fenced result writes; broader queue stages remain future work. Add leases/checkpoints and transactional action deduplication before claiming durable execution; using an SDK does not solve this gap.
- Runtime should fail/abstain on unsupported structured outputs, missing provider capability or unavailable evidence; never downgrade silently to unvalidated text.
- Hosted/local fallback is an explicit project/deployment data policy, not an automatic transfer of private assets to another provider.

## Decision still required

The user selected the ByteByteGo principles. Library/checkpointer adoption still requires BEAV-002/003 compatibility and recovery tests. Deployment preference, first field check and scan format remain open in the [requirements](../../.kiro/specs/placeholder-agent/requirements.md). These do not block designing the workflow or testing it with provider doubles. Thirteen assessment/voice/suggestion/summary operations are now implemented and contract-tested. The first check is visible_component_presence against reviewed extraction primitives, always requiring PM acceptance. LangGraph has not been installed; the tested first slice follows the allowed ordinary-code/SQL baseline. Live accuracy and the complete two-person Home/Logs acceptance are still open.
