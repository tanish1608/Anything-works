# Current status — Everything Works AI

Updated October 6, 2026 after the designer UI and detailed BIM implementation. This inventory describes source and verification; it does not certify live AI accuracy.

## Current direction

AI checks daily construction updates against approved project context, flags mistakes or incomplete work, and updates progress and issues in 3D. The product spans construction stages; pre-drywall electrical review is one example.

The original implementation was built as SiteMesh. The UI now uses Everything Works AI branding and the designer's visual system. Internal identifiers and existing backend behavior remain in place.

## Designer UI implementation

The `/demo` workspace now implements Today, Work & Issues, comparison/review, correction detail, building/plan navigation, daily report, setup and mobile capture/result screens. Filters, local drafts, photo input, explicit decisions and correction history persist in the browser. New evidence preserves prior assessment snapshots; signed report text stays fixed after subsequent actions.

The connected app has a real-data Today overview at `/p/:pid/today`, shared typography/colors and updated navigation. The new comparison and completion workflow remains a local fixture demo, pending backend integration and field validation.

See [design implementation notes](docs/design/ui/IMPLEMENTATION.md). Browser visual checks were blocked by a saved local-URL browser-access preference; responsive rendering and real WebGL interaction need review.

## Implemented foundations

P3 now has a detailed public duplex import: 1,282 rendered elements, 22 spaces, four levels and six discipline layers. `/bim-lab` exposes actual IFC geometry, component properties, close-up inspection, precise local pins and linked model-derived 2D silhouettes. An optional seed adds the same detailed project to the authorized connected app. See [the BIM audit](docs/BIM_AUDIT.md) for extraction results and source attribution.

IFC2x3 type classification, property truncation and duplicate room-name merging are fixed. Connected pins now retain their model version; progress projections distinguish actual human acceptance from legacy automatic approvals. Original PDF/CAD references and generated plans are separate; an unaligned sheet cannot silently locate work in 3D. Live automatic completion and exact photo localization are still pending.

| Foundation | Source location | Important limit |
|---|---|---|
| Designer daily-update demo | `web/src/workspace/`, route `/demo`; geometry in `web/src/studio/scene.ts` | Fictional records and generated images; browser-local state; sample checking and notifications are simulated |
| Connected project workspace | `web/src/App.tsx`, `web/src/pages/` | Earlier coordination/progress workflow, not the new complete specification |
| IFC import and GLB generation | `backend/app/bim/` | A model is context, not evidence of actual installed quality |
| DXF and vector-PDF conversion/review | `backend/app/conversion/` | Generated sample results do not establish general real-plan accuracy; DWG is unsupported |
| 3D viewer and model controls | `web/src/viewer/`, `/bim-lab` | Detailed import, component inspection/pins/plans and saved progress projection implemented; live scoped AI completion and WebGL/device visual acceptance remain open |
| Photo uploads and offline queue | `web/src/field/`, `backend/app/services/photos.py` | Device and production offline behavior need validation for the new flow |
| Evidence-backed progress and review | `backend/app/services/progress.py` | Existing `done` semantics need separation into observed completion and acceptance |
| AI photo-analysis integration | `backend/app/vision/`, `backend/app/services/vision_jobs.py` | Installed/missing/not-visible/uncertain results; not validated broad plan compliance |
| Issues, notifications and history | `backend/app/api/`, `backend/app/services/` | New assessment-to-correction flow and consistent projections remain work |
| Authentication and scoped access | `backend/app/auth/`, `backend/app/rbac.py` | Extend the same controls to new records and derived AI outputs |
| Tests and evaluation harnesses | `backend/tests/`, `web/src/test/`, `web/e2e/`, `samples/` | 126 backend and 39 frontend tests pass; browser E2E and live AI evaluations were not run |

## Known migration gaps

1. **Completion versus acceptance.** Existing AI can propose installation status and can auto-approve using an opt-in project confidence threshold. The new product needs scoped AI-checked completion, separate human acceptance and formal inspection records. The legacy path is not the new completion policy.
2. **Repeated daily checking.** Current AI handling skips already-done elements. The new flow must process relevant later evidence and reopen affected work where appropriate.
3. **Quality beyond presence.** Recognizing a visible component does not prove that its installation matches the plan, required measurements or code.
4. **Reference provenance.** The new flow requires per-assessment source snapshots, applicable approved changes and stale-result handling.
5. **Progress denominators.** Existing summaries count elements; this is not automatically physical, labor or schedule completion.
6. **Demo versus connected product.** The new daily workflow persists locally. The connected overview uses the existing API; full assessment and correction synchronization still requires integration.
7. **Field validation.** Real-site detection performance, user effort, customer savings and willingness to pay are not established.

## Remaining production work

- Guided daily assessment across multiple work items.
- Check-specific evidence requirements and supported completion policies.
- Reliable installation-to-plan comparison and coverage reporting.
- An integrated exception → correction → recheck → model update loop.
- Validated LiDAR measurements and jurisdiction-specific code assistance.
- Voice/video processing and external project-system integrations.
- A measured pilot with real customer outcomes.

## Verification and next work

The current implementation passes 126 backend and 39 frontend tests and production compilation. Backend Ruff passes; frontend lint completes with warnings, including the earlier route-menu reset and procedural-WebGL-fallback warnings. Actual GLB ray hits, component identity, close-fit math, persisted pins/plans and evidence-to-element decisions are tested. Browser visual review remains blocked by the saved local-URL preference. No live AI evaluations were run.

Begin with **P0** in [TODO.md](TODO.md): examples, state contract, completion policy and screen flow. Follow [PLAN.md](PLAN.md) for dependencies. Update this file with actual checks and known limitations as implementation progresses.
