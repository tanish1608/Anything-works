# PLAN.md: 3D Construction Coordination MVP

> Status: **M0 in progress.** Decisions already agreed: **web app first** (Flutter deferred), and a **local database for now**.
> Open questions are in §8. Anything marked *(assumed)* is a default I picked so I could keep moving. Change it if you disagree.

---

## 1. Where I'm deviating from the brief, and why

| # | Brief says | Problem | What I'm doing instead |
|---|---|---|---|
| 1 | Flutter app + three.js viewer in a WebView/iframe with a JS bridge | Agreed with you: web first. A Flutter shell around a web viewer gives two UI stacks and a bridge to debug, for little gain at MVP stage | **React + TypeScript + Vite**, shipped as a **PWA** (installable, offline upload queue). The viewer stays an **isolated module with a command/event API** (`selectElement`, `setColors`, `flyTo`, `snapshot`, plus `onSelect` and similar events). If we wrap it in Flutter or a native app later, that API becomes the bridge unchanged |
| 2 | PostgreSQL | You asked for a local DB for now | **SQLite by default** (zero setup), through SQLAlchemy and Alembic, with no Postgres-only features in the schema. `docker compose` still offers Postgres, and CI runs the tests against **both** so we can switch with one env var |
| 3 | `PyMuPDF` for vector PDF | PyMuPDF is **AGPL-3.0**. In a hosted SaaS that obliges us to open-source the server, unless we buy Artifex's commercial licence | Use **`pypdfium2`** (Apache/BSD) or **`pdfminer.six`** (MIT) for vector extraction in M7. You choose (Q4) |
| 4 | DWG input | No good open-source DWG reader exists. ODA File Converter is free but closed-source with licence terms; LibreDWG is GPL | **DXF only in the MVP.** Users export DXF from AutoCAD, or we add an ODA conversion step if its licence suits you (Q3) |
| 5 | Auto-approve green from AI verdicts | "A false green is far worse than a false gray." Auto-approve is the single biggest false-green risk | Both modes get built, but the **default is "PM approval required"**. Auto-approve needs ≥ 0.9 confidence *and* an evaluation-harness precision ≥ 0.95 for that element type before a project can enable it |
| 6 | Pipe segments verified from photos | Many runs get covered (drywall, slab) and look identical, so matching *which* 6-inch segment appears in a photo is often unanswerable | Photo verdicts are per element as specified. The prompt is told explicitly to say `not_visible` rather than guess, and the evaluation harness reports results **per element type**, so we can see if pipe segments need a coarser unit (per run) |
| 7 | iOS offline sync | Safari has no Background Sync API | Uploads are queued in IndexedDB and synced on app open, on the `online` event, and on a timer. The UI shows "3 uploads waiting" so nothing gets lost silently |
| 8 | Status colors | Precedence between red (issue) and green or amber isn't defined | *(assumed)* **Red (open issue) > Amber (needs review) > Green (done) > discipline default.** An open issue on a completed element should still stand out |

---

## 2. Architecture

```
┌───────────────────────────────┐        ┌───────────────────────────────┐
│ Web app (React + TS, PWA)     │  JSON  │ API (FastAPI)                 │
│ ├ office: projects, issues,   │ ─────▶ │ ├ auth (JWT access + refresh) │
│ │  review editor, history     │ ◀───── │ ├ RBAC policy (one module)    │
│ ├ field: zone → checklist →   │        │ ├ domain services             │
│ │  photos (IndexedDB queue)   │        │ └ event log (append-only)     │
│ └ viewer module (three.js +   │        └──────┬───────────┬────────────┘
│   @thatopen/components,       │               │           │ enqueue
│   web-ifc), command/event API │               ▼           ▼
└───────────────┬───────────────┘        ┌───────────┐ ┌──────────────────┐
                │ signed URLs            │ SQLite /  │ │ Worker (RQ)      │
                ▼                        │ Postgres  │ │ ├ conversion     │
        ┌───────────────┐                └───────────┘ │ │  ezdxf, shapely│
        │ Object store  │◀──────────────────────────── │ │  IfcOpenShell  │
        │ local FS/MinIO│                              │ └ photo analysis │
        └───────────────┘                              │   Anthropic API  │
                                                       └──────────────────┘
```

- **Storage is behind an interface:** the local filesystem in dev, S3/MinIO in compose and prod.
- **The queue is behind an interface:** jobs run inline in dev and tests, and on RQ + Redis in compose and prod. Nobody has to run Redis just to try the app.
- **Viewer data path:**
  - M1 loads IFC in the browser with web-ifc.
  - From M3 onwards the backend also produces **Fragments** (That Open's fast format) so large models load quickly.
  - IFC remains the system of record for every model version.
- **Vision model:** `VISION_MODEL` env var (default: the latest Claude Sonnet). `ANTHROPIC_API_KEY` comes from env only.

### Repo layout
```
/
├── PLAN.md, README.md, docker-compose.yml, .github/workflows/ci.yml
├── backend/
│   ├── app/
│   │   ├── main.py, config.py, db.py
│   │   ├── auth/          # passwords, JWT, current-user deps
│   │   ├── rbac.py        # role → permission matrix, scope checks
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic I/O
│   │   ├── api/           # routers
│   │   ├── services/      # domain logic; every mutation writes an Event
│   │   └── events.py
│   ├── conversion/        # M3: dxf → plan graph → elements → IFC (+ eval script)
│   ├── vision/            # M5: prompt, client, verdict mapping (+ eval harness)
│   ├── migrations/        # Alembic
│   └── tests/
├── web/
│   └── src/ (api/, auth/, pages/, viewer/, field/, components/)
└── samples/
    ├── README.md          # sources and licences of every sample
    ├── ifc/  dxf/
    └── photos/            # labeled photo set layout for M5
```

---

## 3. Data model

```
User(id, email, name, password_hash)
Organization(id, name)                         -- tenant; ERP/payments hang off this later
OrgMembership(org, user, is_admin)
Project(id, org, name, address, settings JSON) -- settings: approval_mode, confidence_threshold
ProjectMember(project, user, role: owner|pm|trade|viewer, trades[], zone_ids[]?)
Building(project) → Level(building, name, index, elevation, height) → Zone(level, name, code, kind, polygon JSON, qr_token)
Trade(code, name, discipline)                  -- seeded: architecture, structure, plumbing, electrical, hvac, flooring, framing…

DrawingSheet(project, level?, discipline, file_uri, scale, origin/transform JSON, version)
ConversionJob(project, sheet_ids, params JSON, status, log) → ConversionReport(job, counts JSON, items JSON w/ confidence)

ModelVersion(id, project, parent_id, merge_parent_id?, branch, message, author, approved_by, approved_at, status: draft|approved|merged|rejected, ifc_uri, fragments_uri)
Element(id = stable UUID, project, ifc_guid)                       -- identity only, never deleted
ElementRevision(version, element, type, discipline, trade, zone, geometry_ref, props JSON, source: drawn|traced|as_built, confidence, geom_hash)
ElementStatus(element, status: not_started|in_progress|needs_review|done, flags[], updated_at, evidence_verification_id)
                                                                   -- current state, rebuilt from events

Upload(id, project, zone, trade, user, note, voice_uri, client_uuid, captured_at, synced_at, sync_state)
Photo(upload, uri, exif_time, gps, sha256, phash)
Verification(upload, element, verdict, confidence, reason, source: ai|manual, model, prompt_version, confirmed_by, overridden, override_reason)
Issue(project, title, description, status: open|in_progress|resolved|closed, priority, trade, assignee, due, element?, anchor xyz, sheet anchor?, viewpoint)
Viewpoint(camera JSON, section planes JSON, visible layers, isolated elements)
Comment(issue, author, body), Attachment(owner_type, owner_id, uri)
Notification(user, kind, payload, read_at)
Event(id, project, actor, at, type, entity_type, entity_id, zone?, evidence_ids[], data JSON)  -- append-only
```

How the key parts work:
- **Versioning and diffs.**
  - A version is a set of `ElementRevision`s. A diff compares two versions by `element_id`: added, removed, moved (the bbox changed), or changed (props or type changed).
  - `parent_id` plus `merge_parent_id` gives us branches and merges later without a schema change.
- **Status is stored per physical element, not per version.**
  - A new version keeps progress on elements whose geometry is unchanged.
  - A moved or changed element that was `done` gets reset to `needs_review` with a flag, so it can't silently stay green.
- **Green requires evidence, enforced in the service layer, not just the UI.**
  - `ElementStatus.status = done` requires a `Verification` that's linked to an `Upload` with at least one `Photo`.
  - A test enforces this rule.
- **Every change is logged.**
  - `Event` is append-only. The DB layer refuses UPDATE and DELETE on it, with a trigger on Postgres and an ORM guard on SQLite.
  - Every service mutation writes its event in the same transaction.
  - Timeline replay = fold the status events up to time T.
- **Permissions sit in one place.**
  - `rbac.py` is the single place for permission checks.
  - A trade member's visibility is filtered by `trades[]`, and also by `zone_ids[]` when that's set. This is applied both in queries and to file access.
- **Room for later modules.** Materials, inventory and draws attach to `Element`, `Zone` or `Project` via new tables. `Event.type` is an open string.

### Role → permission matrix (M0)

| Permission | owner | pm | trade | viewer |
|---|:-:|:-:|:-:|:-:|
| project.view | ✓ | ✓ | ✓ (scoped) | ✓ |
| project.edit, members.manage | ✓ | ✓ (cannot add or remove owners) | | |
| structure.edit (buildings, levels, zones) | ✓ | ✓ | | |
| drawings.upload, conversion.review | ✓ | ✓ | | |
| model.approve | ✓ | ✓ | | |
| progress.upload | ✓ | ✓ | ✓ (own trades/zones) | |
| progress.approve / override | ✓ | ✓ | override own claims with a reason only | |
| issue.create / comment | ✓ | ✓ | ✓ (scoped) | |
| history.view | ✓ | ✓ | ✓ (scoped) | ✓ |

---

## 4. Milestones

| # | Scope | Done when |
|---|---|---|
| **M0** | Repo, docker compose, SQLite default with Alembic, auth (JWT access + refresh rotation), orgs/projects/members/roles, buildings/levels/zones CRUD, append-only event log, React web shell (login, projects, structure tree, members, activity feed), CI (pytest on SQLite and Postgres, vitest, lint, web build) | Tests are green in CI. A PM can sign up, create a project, add a building, levels and zones, and invite a trade member who only sees what they should. Every change appears in the activity feed |
| **M1** | Viewer module: load a buildingSMART sample IFC; orbit/pan/zoom/walk; section planes and box; discipline toggles and isolate; level/zone filter; pick → properties panel; status coloring with legend and toggle; command/event API | The sample IFC is usable on desktop and phone browsers, and the viewer API has unit tests |
| **M2** | Issues: pin to a point or element, viewpoint save and fly-to, comments, in-app notifications, filters with matching color overlay | The issue loop works end to end, with tests |
| **M3** | DXF conversion: architectural pass (walls, openings, rooms → zones, scale, levels and alignment), plumbing pass (fixtures, segmented pipes, zone assignment), IFC + Fragments output, report with confidences, review editor (sheet overlay, edit, trace missing runs, approve → ModelVersion), 2D sheet ↔ 3D click sync, `eval_conversion.py` | Sample DXFs convert, the evaluation script prints counts and correction stats, and approval is required before going live |
| **M4** | Field flow (manual): zone picker plus QR, trade checklist highlighted in 3D, photos + note, offline queue, PM marks done with evidence → green | Works offline on a phone. The "no green without evidence" test passes |
| **M5** | Vision analysis: prompt + strict JSON schema, verdict mapping, approval modes, "possibly missed" and "retake" flags, notifications, phash reuse detection, `eval_vision.py` (precision and recall per element type, logged per model and prompt version) | The harness runs on the labeled set, and the numbers are recorded in `samples/photos/RESULTS.md` |
| **M6** | History UI: versions with messages, diff view, timeline slider replay, branch-ready model | You can scrub the timeline and diff any two versions |
| **M7** | Vector PDF input, plus scoping raster/vision input | Sample vector PDFs convert through the same pipeline |

---

## 5. Conversion approach (M3, summary)

1. **Parse.** ezdxf pulls in lines, polylines, arcs, block inserts, text and dimensions, with per-project **layer → role mapping** (wall, door, window, room-label, plumbing fixture, pipe…). The mapping is auto-suggested from common layer naming (AIA, `A-WALL`, `P-SANP`…) and the PM confirms it.
2. **Scale.** Candidate scales come from `$INSUNITS`, dimension entities versus measured lengths, and title-block text such as "1/4" = 1'-0"". The PM confirms by measuring one known dimension.
3. **Walls.** If there's a wall layer, use it. Otherwise pair parallel segments with a gap between 50 and 400 mm into wall centerlines with a thickness, then snap and merge.
4. **Openings.** Door and window block inserts and arc swings are mapped to the nearest wall and cut.
5. **Rooms.** Polygonize the wall centerline network with shapely, then match each polygon to a room label text point inside it. Each one becomes a zone, with a confidence based on label match and closure.
6. **Levels.** Each sheet maps to a level. The PM picks a reference point on each sheet, and we stack them using the floor-to-floor height.
7. **Plumbing.**
   - Fixtures come from block names or layer plus a symbol library.
   - Pipes are polylines split at vertices that are fittings or junctions (degree ≠ 2, or a fixture connection). Each segment gets a stable ID: a hash of the rounded endpoints plus the sheet, so it stays stable across re-runs.
   - **Nothing is invented.** If no pipe routes are drawn, the report says so, and the PM traces runs in the editor (`source = traced`).
8. **Output.** IfcOpenShell writes the IFC (IfcWall, IfcDoor, IfcWindow, IfcSpace, IfcSlab, IfcPipeSegment, IfcSanitaryTerminal…), with our element UUID stored in a property set. The conversion report is JSON plus a UI view.
9. **Evaluation.** `eval_conversion.py samples/dxf/` reports detected counts per type against `expected.json`, and records the editor corrections per job (adds, deletes, edits) as the "manual correction" metric.

## 6. Vision approach (M5, summary)

- **Input:** photos (resized to a long side of about 1568px), the expected-element list (id, type, description, rough position in the zone), and the reference render from the viewer's `snapshot()` of the zone's trade layer.
- **Output:** tool-use or structured output with a strict JSON schema. The response is validated, and invalid output is retried once, then treated as "uncertain" for all elements.
- **Mapping:**
  - `installed` with confidence ≥ the project threshold → needs_review (amber), or done (green) only under auto-approve.
  - `missing` → keep the original color and flag "possibly missed", with notifications.
  - `not_visible` or `uncertain` → keep the original color and add a retake prompt.
- **Evaluation:** `eval_vision.py` reports precision and recall per element type plus a false-green count, with results appended to a CSV keyed by model and prompt version.

---

## 7. Test data
- **M1–M2:** the buildingSMART sample IFCs (e.g. the IFC4 reference/sample house files). Sources and licences go in `samples/README.md`.
- **M3:** a small set of **generated** DXF residential plans (single-family house, duplex, 4-unit floor) made with ezdxf, with known ground truth, plus any public DXF plans whose licence allows it. We'll add your real sets when they arrive.
- **M5:** `samples/photos/<case_id>/{photos/*.jpg, case.json}` with zone, trade, expected elements and their true status.

---

## 8. Decisions log (answers 2026-10-04)

1. Real drawing sets: coming at the end. Until then we use generated samples.
2. Multi-tenant: **yes**. Orgs are in the schema, with one org per signup.
3. DWG: **no ODA**. Users export to DXF.
4. PDF library: **pypdfium2 / pdfminer.six** instead of PyMuPDF.
5. Approval mode: deferred. The default stays **PM approval required**, and `auto` exists as a project setting.
6. Status color precedence: **red > amber > green > discipline default**.
7. Auth: **email and password**.
8. Voice notes: **skipped** for now (text notes only).
9. Hosting: decided later.
10. Anthropic API key: coming later. Vision runs in a mock mode until then.
