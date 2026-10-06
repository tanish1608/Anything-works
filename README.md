# Everything Works AI

**Every daily update becomes a check on work quality and a clearer picture of progress.**

Everything Works AI is being built to check construction photos and daily updates against approved project information, flag potential mistakes, and update completion and issues in a shared 3D model.

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

## Example

A crew submits three updates: framing in one room, electrical installation in another, and painting in a third. The system may find a possible placement mismatch, request a missing close-up, and mark an adequately evidenced painting task AI-checked complete. Each result appears at the correct location, with the source evidence and the checks actually performed.

A PM can review exceptions, confirm or dismiss a finding, and track a correction. A green progress marker never silently means “passed every code requirement” or “officially inspected.”

## What exists today

This repository contains an earlier **SiteMesh** prototype:

- An interactive designer workspace at `/demo`, with daily overview, work filters, comparison, corrections, local mobile capture, reports and 3D status navigation.
- A connected application with model import, drawing review, 3D viewing, issues, photo uploads, progress review and event history.
- A detailed imported duplex at `/bim-lab`: 1,282 actual IFC components, bedroom pipe fittings, close-up inspection, precise model pins and linked 2D silhouettes. Its evidence/progress demonstrations are local test records.
- An offline field upload queue and an existing Gemini photo-analysis integration.

These are foundations. The new daily quality-checking workflow, calibrated automatic completion, reliable plan comparison and broad real-site coverage are **not yet delivered or validated**. Existing “installed” verdicts do not establish correct installation.

See [current implementation and gaps](STATUS.md) and [design implementation notes](docs/design/ui/IMPLEMENTATION.md). UI branding now uses Everything Works AI; internal SiteMesh identifiers remain.

## Read and share

| Document | Purpose |
|---|---|
| [Product specification](docs/PRODUCT_SPEC.md) | Full concept, users, screens, AI behavior and acceptance requirements |
| [Pitch](docs/PITCH.md) | Shareable narrative, economics, competition and references |
| [Build plan](PLAN.md) | Architecture, delivery sequence and decisions |
| [Task backlog](TODO.md) | Detailed work packages for contributors |
| [Current status](STATUS.md) | What is implemented versus planned |
| [Detailed BIM audit](docs/BIM_AUDIT.md) | Real-project import results, viewer choice, precise locations and P3 verification |
| [Developer guide](docs/DEVELOPMENT.md) | Setup, configuration, tests and repository map |
| [Research index](docs/README.md) | Supporting customer-pain and competitor research |

**For friends joining the project:** read this page, then the specification and backlog. Choose a work package with a clear acceptance condition. The next step is to define and demonstrate the complete daily-update loop before expanding the check catalog.

## Running the existing prototype

Follow the [developer guide](docs/DEVELOPMENT.md). The local frontend runs at `http://localhost:5173`; visit `/demo` for the interactive example or use the seeded accounts for the connected workspace.

Documentation reset and designer UI implementation: October 5, 2026. Detailed BIM/inspection work: October 6, 2026. The full new assessment workflow still requires backend integration and field validation.
