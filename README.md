# Placeholder AI

**Every daily update becomes a check on work quality and a clearer picture of progress.**

Placeholder AI is being built to check construction photos and daily updates against approved project information, flag potential mistakes, and update completion and issues in a shared 3D model.

The product covers daily work across construction stages. Catching a misplaced electrical box before drywall is one example of the value, not the boundary of the product.

## The problem

Crews send photos, messages and progress reports. A superintendent still has to work out where the work happened, what should have been built, whether the visible work matches the latest plan, and what actually counts as complete. Those decisions are scattered across site walks, drawings, calls and spreadsheets.

An update saying “finished” can hide an incorrect installation, an incomplete task or simply a photo that does not show enough. Errors discovered later can create repeat visits, delays, failed inspections and rework.

## The intended daily workflow

1. **Set the reference:** upload and review plans, identify rooms and work items, and establish applicable requirements.
2. **Submit daily work:** the crew selects its location and task, adds photos and a short update, and submits. Guided capture asks for missing views when needed.
3. **Check the evidence:** AI identifies visible work, compares supported conditions with the approved reference, and separates mistakes, incomplete work and insufficient evidence.
4. **Update progress:** adequately supported items can automatically become **AI-checked complete**. Partial work stays partial; uncertainty goes to review. A worker's claim alone cannot complete a task.
5. **Locate and resolve issues:** findings appear at the relevant room or element in 3D, with evidence, ownership and correction history.
6. **Keep the model current:** new evidence updates progress and findings. Human acceptance, required tests and official inspection approval remain separate records.

The system checks every submitted update, but can only judge the conditions supported by the evidence and implemented checks. Unseen work stays unverified.

## What makes this worth building

The intended value is the connection between **field evidence → comparison with plans → a supported completion decision or actionable issue → updated 3D context → correction**.

The 3D model helps people find and understand the work. AI helps interpret the update. The product succeeds if the complete workflow catches useful mistakes and reduces coordination effort.

Our initial customer hypothesis is US residential and multifamily general contractors and developer-builders. The product direction includes structure, MEP, interiors and closeout; individual checks will be introduced and validated in stages.

The planned interface serves customers/clients, contractors/project managers, subcontractor leads and field crews through different views of the same project and building model. Their visibility and actions will follow project roles; see the [user-view backlog](TODO.md). The website defaults to a public PM testing experience with optional public user-view previews. Private model onboarding connects an account inside the same workspace; public samples remain sign-in free.

Authenticated `/agent` and `/field-capture` provide worker/PM photo and recorded-voice intake; the public preview records still require shared integration.

## Example

A crew submits three updates: framing in one room, electrical installation in another, and painting in a third. The system may find a possible placement mismatch, request a missing close-up, and mark an adequately evidenced painting task AI-checked complete. Each result appears at the correct location, with the source evidence and the checks actually performed.

A PM can review exceptions, confirm or dismiss a finding, and track a correction. A green progress marker never silently means “passed every code requirement” or “officially inspected.”

## Agent implementation

The review-only photo slice at `/agent` uses real backend accounts, approved drawing-extraction snapshots, saved assessments and manager decisions. A worker submits photos; the agent assesses visible component presence; the PM accepts/rejects the exact proposal; both see saved human progress on the authorized model. Recorded voice upload/transcription, author corrections, editable suggestions, explicitly refreshed cited daily briefings and the contextual Project Copilot chatbot are implemented on the iteration-2 workspace. LangGraph/MCP, LiDAR, calendar assignment, live transcription and external follow-ups remain later work. See [setup and demo steps](docs/DEVELOPMENT.md#placeholder-ai-agent-demo), [requirements](.kiro/specs/placeholder-agent/requirements.md), [architecture](docs/architecture.md) and [task evidence](docs/TASKS.md). Live field accuracy and the complete shared Home/Logs workflow remain unverified.

## What exists today

The current website builds on the earlier **SiteMesh** prototype:

- The project showroom is home at `/`. Opening a project enters one large building workspace with contextual panels for work/issues, evidence and decisions, daily updates, progress history and teams. There are no separate Home/Logs/Building model pages.
- A public duplex with 1,282 actual IFC components, exploded floors, exterior walls/roof initially hidden, source-system controls, component zoom, model pins and linked 2D silhouettes. Floor, reviewed Unit A/B and room locations share the original source geometry and IDs.
- Browser-local capture, offline update identity, human review, corrections and progress replay on the same model. Project Copilot is a compact floating bottom-right chatbot that opens against the current screen's local context without login. Authenticated assessment, voice, helper and chat requests use the backend.
- Real authenticated project creation/IFC upload, draft preview and explicit reference approval inside the chosen interface. Private geometry uses authorized requests. Private field capture/review persistence and live AI remain pending.
- Public customer, PM, subcontractor and field-worker previews, all-status search, team/due-date controls and a larger 3,504-component apartment sample.
- A viewport-sized project showroom at `/?screen=projects`: a rotating interior source model, source facts, a four-project grid and explicit Open project action. Preview controls and horizontal card scrolling are removed; larger connected catalogs use page controls. Opening a project starts with Work & issues beside the building.
- Medical-Dental Clinic adds 16,071 source components across architectural, structural and sample MEP layers. Esplan Building adds 1,958 components and 285 source spaces, with precise survey-coordinate geometry. New projects begin with no inferred field progress.

These are foundations. The new daily quality-checking workflow, calibrated automatic completion, reliable plan comparison and broad real-site coverage are **not yet delivered or validated**. Existing “installed” verdicts do not establish correct installation.

See [current implementation and gaps](STATUS.md) and [design implementation notes](docs/design/ui/IMPLEMENTATION.md). UI branding now uses Placeholder AI; internal SiteMesh identifiers remain.

## Read and share

| Document | Purpose |
|---|---|
| [Product specification](docs/PRODUCT_SPEC.md) | Full concept, users, screens, AI behavior and acceptance requirements |
| [Pitch](docs/PITCH.md) | Shareable narrative, economics, competition and references |
| [Build plan](PLAN.md) | Architecture, delivery sequence and decisions |
| [Task backlog](TODO.md) | Detailed work packages for contributors |
| [Current status](STATUS.md) | What is implemented versus planned |
| [UI iteration 2 backlog](docs/UI_TODO_ITERATION_2.md) | Dedicated interface checklist and acceptance work |
| [Brand identity](docs/BRANDING.md) | Placeholder AI logo assets, app icons and reproduction |
| [Subcontractor mobile build prompt](docs/SUBCONTRACTOR_MOBILE_BUILD_PROMPT.md) | Standalone subcontractor PWA brief; authenticated browser capture already exists at `/field-capture` |
| [Apartment import test](samples/ifc/schependomlaan/README.md) | Larger source project, import fidelity and real upload acceptance |
| [Client demo](docs/CLIENT_DEMO.md) | Walkthrough, capability boundaries, rehearsal and pilot priorities |
| [Customer stories and workflow gaps](docs/USER_STORIES.md) | Fictional PM/crew/onboarding journeys, fixes made and concrete next acceptance criteria |
| [Clinic sample](samples/ifc/clinic/README.md) / [Esplan sample](samples/ifc/esplan/README.md) | Source attribution, measured import results, fidelity limits and reproduction |
| [Building workspace](docs/BUILDING_WORKSPACE.md) | Current canvas/panel UI, source locations and testing boundaries |
| [Shared model workflow](docs/MODEL_WORKFLOW.md) | Import/review setup, spatial hierarchy, daily evidence and shared progress |
| [Detailed BIM audit](docs/BIM_AUDIT.md) | Real-project import results, viewer choice, precise locations and P3 verification |
| [Developer guide](docs/DEVELOPMENT.md) | Setup, configuration, tests and repository map |
| [Research index](docs/README.md) | Supporting customer-pain and competitor research |

**For friends joining the project:** read this page, then the specification and backlog. Choose a work package with a clear acceptance condition. The next step is to define and demonstrate the complete daily-update loop before expanding the check catalog.

## Running the existing prototype

**After pulling main:** upgrade the local database to `0010` using the [worktree update commands](docs/DEVELOPMENT.md#updating-this-agent-worktree-after-pulling-main); existing records are retained.

**Local testing (installed dependencies):** run `python3 scripts/dev_agent.py` from this repository root, then open `http://127.0.0.1:5174`. Keep the terminal open. Add `--restart` only when replacing this worktree's running servers. There is one application API, not a separate agent server.

Demo: select a work record → Copilot **Assign** → choose the responsible trade/person and correction instruction → review/confirm. No calendar is required; existing deadlines and progress are preserved. Use **Update** for daily photos/notes and keep issues open until reviewed correction evidence and PM sign-off. Ownership changes in the public sample remain browser-local. See [the demo walkthrough](docs/DEVELOPMENT.md#communication-demo-and-phone-capture).

Mobile capture: `/field-capture` uses the authenticated project API for photos, scan screenshots and recorded voice. A PM can open a scoped capture link from `/agent`. Raw LiDAR geometry and native iPhone scanning are not implemented.

For Docker, open Docker Desktop and run `docker compose up --build --force-recreate --wait` from this repository root. Open `http://127.0.0.1:8080`; the API docs are on `http://127.0.0.1:8011/docs`. Compose reads `backend/.env`, waits for a registered chat route, and keeps database/storage volumes across rebuilds. See [Docker setup](docs/DEVELOPMENT.md#docker) for logs, restarts and optional demo accounts. Docker build/runtime acceptance is not verified in the sandbox.

For this agent worktree, with dependencies already installed, run `python3 scripts/dev_agent.py --restart` from the repository root. It verifies the loaded backend/chat route, restarts only listeners belonging to this worktree, and starts the API on 8010 plus Vite on 5174 with the matching proxy. Keep the terminal open. `--check` validates imports/provider configuration without stopping servers or making a model request. The launcher does not seed/reset/migrate a database; first-time setup is in the developer guide.

Follow the [developer guide](docs/DEVELOPMENT.md). The local frontend runs at `http://localhost:5173`; open `/` for the main website. One large building canvas is the main workspace. Issues, photos/review, daily updates, progress history, teams and project context open beside it. Click the project title to enter the project showroom, or open `/?screen=projects` directly. Old `/demo/...` and page bookmarks redirect into the corresponding root query-state panels. The previous login/project UI is retired from public routing; optional model onboarding is in the chosen UI, while private field-record integration remains a separate work package.

Documentation reset and designer UI implementation: October 5, 2026. Detailed BIM/inspection and Project Copilot work: October 6, 2026. Live provider, browser and field validation remain required.
