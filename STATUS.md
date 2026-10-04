# Status report: overnight build (2026-10-04)

All eight milestones (M0–M7) are built, tested and committed. **Nothing is pushed anywhere.** No GitHub remote is connected to this session, so the git bundle I sent you is the only copy outside this container.

## Verification
| Check | Result |
|---|---|
| Backend tests, SQLite | **122 passed** |
| Backend tests, Postgres 16 | **121 passed, 1 skipped** (the SQLite-only migration check) |
| Web unit tests (Vitest) | **16 passed** |
| End-to-end, real Chromium (Playwright) | **9 passed**: one browser flow per milestone (screenshots in `web/e2e/.results/`) |
| `docker compose up` (Postgres) | Migrations, append-only trigger, seed (real conversion in the container), login, PWA assets all checked |
| Conversion eval, 10 DXF + 2 PDF samples | 100% on every metric. **Synthetic samples only; see caveats** |
| Vision eval | Harness runs in `--mock` mode. **Never run against the real API: no key yet** |

## How to try it in 5 minutes
1. Follow the README quick start: backend, then `python -m app.seed`, then web. Or use `docker compose up` + seed.
2. As **pm@example.com**, open Maple Court:
   - **3D model:** layers, section box, walk mode, click an element, "+ Issue".
   - **Drawings:** open a sheet to see the review editor.
   - **Progress, History.**
3. As **plumber@example.com**, use the **Field app**: open UNIT 101 BATH, tick items, add photos and submit. Try it with the network off as well.
4. Back as the PM, use **Progress → Approve**. The element turns green in 3D.

## What's shaky / needs your input
1. **Conversion accuracy on real drawings is unknown.** I wrote both the sample generator and the detector, so the perfect scores only prove the pipeline works and catches regressions. Real sets will bring these, and each will need tuning:
   - xrefs
   - hatches
   - single-line walls
   - curved and angled walls
   - odd layer names
   - dimension-only scales

   **Please send the real drawing sets.** Each one becomes an eval folder.
2. **Vision checks are untested against the model.** The request shape, schema, validation, mapping and safety rules are unit-tested with a fake client. Precision and recall on real photos come once you provide the API key and fill `samples/photos/`.
   - Default model: `claude-opus-5-5` at high effort, with server-side refusal fallbacks enabled (`VISION_FALLBACKS=off` disables them).
   - **Keep auto-approve off until the eval shows ≥ 0.95 precision and 0 false greens.**
3. **Pipe-segment verification from photos may be too fine-grained.** Six identical segments behind one vanity are hard to tell apart in a photo. The eval reports results per element type; if pipe precision is low, verify per run instead of per segment.
4. **MEP heights are schematic.** Plan drawings have no elevations, so cold and hot lines are placed 0.5 m above the floor and waste lines below the slab. The values are editable per pipe in the review editor, and fixtures sit at default heights.
5. **Element identity across re-conversion** is stable when geometry is detected the same way. If a re-run shifts a wall endpoint by more than about 5 cm, that wall gets a new ID, and any progress on it doesn't carry over (it's flagged).
6. **Offline:**
   - Field uploads queue in IndexedDB and sync on reconnect (tested).
   - Offline *reading* of zones and checklists relies on the service worker's cache from an earlier online visit. That's in production builds only (dev mode has no service worker), and it hasn't been tested on a real phone.
   - iOS has no background sync, so the queue sends when the app is opened or regains focus.
7. **Not built:**
   - email invites (people must sign up first, then be added);
   - push notifications (in-app only);
   - voice notes (skipped, as agreed);
   - UI for creating branches (the API and data model support branch, approve and merge);
   - MEP from PDF;
   - raster/scanned input (scoped in PLAN.md §9);
   - login rate limiting.
8. **Deviations from the brief** are explained in PLAN.md §9:
   - DB-backed job queue instead of Redis;
   - local file storage instead of MinIO;
   - three.js + server-generated GLB instead of `@thatopen/components`;
   - trades see architecture as faint context.

## Your answers recorded (PLAN.md §8)
- Multi-tenant: yes.
- DWG: no, users export DXF.
- PDF library: pdfminer.six.
- Default: PM approval required.
- Colour precedence: red > amber > green.
- Login: email and password.
- Voice: skipped.
- Hosting: later.
- API key: tomorrow.
