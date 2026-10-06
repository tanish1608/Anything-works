# Current status — Everything Works AI

Documentation reset: October 5, 2026. This inventory is based on source inspection, not a fresh runtime or accuracy certification.

## Current direction

AI checks daily construction updates against approved project context, flags mistakes or incomplete work, and updates progress and issues in 3D. The product spans construction stages; pre-drywall electrical review is one example.

The existing implementation was built as SiteMesh. This reset changes documentation only. UI branding, packages, database behavior and AI logic remain unchanged.

## Implemented foundations

| Foundation | Source location | Important limit |
|---|---|---|
| Interactive building demo | `web/src/studio/`, route `/demo` | Fictional six-level, 48-unit project; browser-local state; AI checks and live notifications are not connected |
| Connected project workspace | `web/src/App.tsx`, `web/src/pages/` | Earlier coordination/progress workflow, not the new complete specification |
| IFC import and GLB generation | `backend/app/bim/` | A model is context, not evidence of actual installed quality |
| DXF and vector-PDF conversion/review | `backend/app/conversion/` | Generated sample results do not establish general real-plan accuracy; DWG is unsupported |
| 3D viewer and model controls | `web/src/viewer/` | New coverage and AI-completion semantics still need implementation |
| Photo uploads and offline queue | `web/src/field/`, `backend/app/services/photos.py` | Device and production offline behavior need validation for the new flow |
| Evidence-backed progress and review | `backend/app/services/progress.py` | Existing `done` semantics need separation into observed completion and acceptance |
| AI photo-analysis integration | `backend/app/vision/`, `backend/app/services/vision_jobs.py` | Installed/missing/not-visible/uncertain results; not validated broad plan compliance |
| Issues, notifications and history | `backend/app/api/`, `backend/app/services/` | New assessment-to-correction flow and consistent projections remain work |
| Authentication and scoped access | `backend/app/auth/`, `backend/app/rbac.py` | Extend the same controls to new records and derived AI outputs |
| Tests and evaluation harnesses | `backend/tests/`, `web/src/test/`, `web/e2e/`, `samples/` | Present in source; not rerun as part of this docs-only reset |

## Known migration gaps

1. **Completion versus acceptance.** Existing AI can propose installation status and can auto-approve using an opt-in project confidence threshold. The new product needs scoped AI-checked completion, separate human acceptance and formal inspection records. The legacy path is not the new completion policy.
2. **Repeated daily checking.** Current AI handling skips already-done elements. The new flow must process relevant later evidence and reopen affected work where appropriate.
3. **Quality beyond presence.** Recognizing a visible component does not prove that its installation matches the plan, required measurements or code.
4. **Reference provenance.** The new flow requires per-assessment source snapshots, applicable approved changes and stale-result handling.
5. **Progress denominators.** Existing summaries count elements; this is not automatically physical, labor or schedule completion.
6. **Demo versus connected product.** Studio actions persist locally. Its existing handoff and reporting story needs adaptation and integration work.
7. **Field validation.** Real-site detection performance, user effort, customer savings and willingness to pay are not established.

## Planned, not shipped by this reset

- Guided daily assessment across multiple work items.
- Check-specific evidence requirements and supported completion policies.
- Reliable installation-to-plan comparison and coverage reporting.
- An integrated exception → correction → recheck → model update loop.
- Validated LiDAR measurements and jurisdiction-specific code assistance.
- Voice/video processing and external project-system integrations.
- A measured pilot with real customer outcomes.

## Verification and next work

No application tests or live AI evaluations were run for this documentation reset. Historical test counts and old milestone checkmarks have been removed rather than presented as current evidence.

Begin with **P0** in [TODO.md](TODO.md): examples, state contract, completion policy and screen flow. Follow [PLAN.md](PLAN.md) for dependencies. Update this file with the date, actual checks run and known limitations when implementation begins.
