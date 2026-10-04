# PLAN.md — 3D Construction Coordination MVP (DRAFT v0)

> Status: **draft, awaiting answers.** No code has been written yet.
> The brief I received is cut off partway through "Feature 1" (at "...zones (rooms or areas such as Unit").
> Everything below Feature 1 is planned from the four-point summary only. See Q0.

---

## 1. Where I'd push back on the brief

These are the parts I think will hurt if we build them exactly as described.

### 1a. Fully automatic "2D drawings → 3D model" is the riskiest part of the product
- **Vector DXF/DWG** can realistically be converted. Walls are line or polyline pairs on named layers, and doors and windows are blocks. Even so, layer naming differs from firm to firm, so we'll need a per-project layer-mapping step.
- **Vector PDFs** (exported from CAD) are doable but noisier. There are no layers or blocks, only line weights and paths.
- **Scanned or raster PDFs** need ML-based wall and room detection. That's a research project, not an MVP feature.
- **MEP (plumbing, electrical, HVAC)** is mostly symbols and schematic runs with no elevations. Any 3D placement of it is a guess.

**Proposal:** make conversion *assisted*, not magic. The pipeline parses DXF (and vector PDF as a stretch goal) into candidate walls, openings and rooms. The PM then sets the scale and floor-to-floor heights, maps CAD layers to trades, and fixes mistakes in a 2D review editor before we extrude to 3D. MEP elements get placed as 2D-derived objects at default heights, clearly labeled "schematic". The output is a model the PM has *approved*, and that approval is what makes the model trustworthy.

### 1b. "The photo turns the work green" shouldn't mean computer vision decides
Figuring out which elements a phone photo shows, and whether they're actually done, isn't reliable enough to drive a status that lenders and owners will trust.

**Proposal:** the worker selects the zone, the elements or a whole task, marks them "done", and attaches photos as evidence. The status goes to **pending** (for example amber or hatched) until a PM approves it, and only then turns **green**. Anything the worker didn't claim keeps its original color, as the brief asks. We keep photo metadata (GPS, EXIF time, uploader) for audit. Auto-suggestion from vision can come later.

### 1c. "Git-like history" should be an append-only event log, not actual git
Running real git under a multi-user web app causes trouble with binary blobs, merge conflicts and permissions.

**Proposal:**
- Every mutation writes an immutable `events` row: actor, timestamp, entity, before/after diff, and optional location (element, zone, level).
- Model geometry is versioned as immutable **model revisions**. A re-upload or re-conversion creates revision N+1 with an element-level diff against N (added, removed, changed).
- The UI then gives the git-like experience: a timeline, a "blame" view per element, and a compare view between revisions.

---

## 1d. Revizto as the reference product: what we match, what we skip, what we add

These are findings from Revizto's public docs and reviews. I could only use search results, because revizto.com is blocked from this sandbox. We copy no branding, assets or code. Standard industry concepts like "issue", "viewpoint" and "priority" are fair game, but our names, UI and workflows are our own.

| Revizto capability | What it is | Our MVP plan |
|---|---|---|
| **Issue tracker** | Issues have a 3D location, status (open / in progress / closed), priority (four levels), assignee, watchers, tags, deadline, reporter, comments, attachments and full change history. They can be filtered and reported on | **Match.** This is M2. We add a `trade` and `zone` field to each issue and a "pending review" status so the PM can sign off on fixes |
| **Viewpoints** | Each issue saves a camera position and visibility state, and opening the issue restores it | **Match.** Each issue stores the camera, section box, visible layers and selected elements |
| **Markups on issues** | Users draw, comment and attach photos and files on an issue | **Match, simplified.** 2D markup on the issue snapshot (arrow, cloud, freehand, text) plus photo attachments |
| **Unified 2D/3D split view** | Sheets are overlaid on the model, there's a side-by-side pane, the user's position is tracked on the sheet, and callout hyperlinks jump between views | **Match, and it's easier for us.** We generated the 3D model *from* the sheets, so sheet-to-model registration comes free from conversion. The split view shows the source drawing beside the 3D level, with a "you are here" marker. Clicking a room on the sheet flies the camera to it. Callout hyperlinks come later |
| **Search sets and appearance templates** | Saved queries over element properties, plus saved color and transparency schemes, which can be personal or shared | **Match in a narrower form.** Trade layers and progress coloring *are* our built-in appearance templates. Saved filters (by trade, zone, status or type) come in M5 |
| **Stamps** | Quick, templated issues placed on 2D sheets | **Later.** Useful for inspectors, and an easy follow-up once sheets and issues exist |
| **Clash detection and grouping** | Automatic clash detection between models, grouped and synced to issues | **Skip for MVP.** Our MEP geometry is schematic, so clashes would mostly be noise. We'd revisit once MEP placement is better |
| **Issue automation** | Rule-based updates to deadlines, status, priority, assignee and tags | **Later.** Simple notifications, such as "assigned to you" or "due tomorrow", are in the MVP |
| **Roles** | License-level roles plus customizable project roles | **Simpler.** We use four fixed project roles from the brief, plus scoping by trade and zone (Revizto doesn't have zone scoping). The policy layer is built so custom roles can come later |
| **Platforms** | Desktop app, web app, and iOS/Android apps for field use | **Web only, mobile-first for field screens.** A PWA with an offline photo queue if you need offline support (see Q6) |
| **Input** | Revit, Navisworks, IFC and other BIM models | **The opposite end of the market.** We take DXF and PDF drawings and produce the model, so the builder never needs BIM authoring |

**What we add that Revizto doesn't have:**
1. Conversion from 2D drawings to a 3D model, which is the core wedge.
2. Trade-scoped access, so a trade worker sees only their own layer and zones.
3. Photo-evidenced progress claims, approved by the PM, that drive the green/original coloring of the model.
4. A per-element history and a "blame" view tying progress, issues and model revisions together.
5. Pricing and UX for builders, not BIM coordinators.

**Lessons from Revizto user complaints:**
- Reviewers mention a steep learning curve, slow sync on large projects, and unreliable model uploads.
- So we aim for a fast web viewer with geometry split per level and lazy loading, three or four primary screens, and conversion jobs that report clear, actionable errors.

---

## 2. Proposed architecture

```
┌──────────────┐   HTTPS/JSON   ┌───────────────┐    ┌──────────────┐
│ Web app      │ ─────────────▶ │ API (FastAPI) │──▶ │ PostgreSQL   │
│ React + TS   │                │ auth, RBAC,   │    │ (+ PostGIS?) │
│ three.js     │ ◀── signed ─── │ events        │    └──────────────┘
│ (R3F)        │     URLs       └──────┬────────┘
└──────┬───────┘                       │ jobs (Redis queue)
       │ direct upload/download        ▼
       │                        ┌───────────────┐    ┌──────────────┐
       └──────────────────────▶ │ Object store  │◀── │ Conversion   │
                                │ (S3 / MinIO)  │    │ worker (Py)  │
                                └───────────────┘    │ ezdxf,       │
                                                     │ shapely,     │
                                                     │ PyMuPDF,     │
                                                     │ trimesh→glTF │
                                                     └──────────────┘
```

- **Backend: Python (FastAPI, SQLAlchemy, Alembic).** The geometry and CAD libraries we need (ezdxf, shapely, PyMuPDF, trimesh) are all Python. Keeping the API in the same language lets us share models and validation.
- **Frontend: React + TypeScript + Vite, using three.js through react-three-fiber.**
  - We render glTF per level, with element IDs stored in node `extras`.
  - Trade layers are toggled by element `trade`.
  - Status coloring is applied client-side from a lightweight status map, so it doesn't require regenerating geometry.
- **Data: PostgreSQL for everything relational. Files (drawings, photos, glTF) go in S3-compatible storage** (MinIO locally).
- **Jobs: Redis plus RQ** (or arq) for conversion and thumbnails.
- **Auth:** email+password with JWT sessions for the MVP. The auth layer is shaped so SSO can be added later.
- **Local dev:** `docker compose up` brings up Postgres, Redis, MinIO, the API, the worker and the web app.
- **Tests:**
  - Backend: pytest, including RBAC matrix tests and conversion golden-file tests using small sample DXFs.
  - Frontend: Vitest.
  - Smoke test: one Playwright flow.

### Repo structure
```
/
├── README.md               # setup that actually works
├── PLAN.md                 # this file
├── docker-compose.yml
├── backend/
│   ├── app/
│   │   ├── api/            # routers per resource
│   │   ├── auth/           # users, sessions, RBAC policy
│   │   ├── models/         # SQLAlchemy models
│   │   ├── services/       # domain logic (issues, progress, history)
│   │   └── events.py       # append-only audit/event log
│   ├── conversion/         # DXF/PDF parsing → 2D plan graph → 3D extrusion → glTF
│   ├── worker.py
│   ├── migrations/
│   └── tests/ (incl. fixtures/*.dxf)
└── web/
    ├── src/
    │   ├── viewer/         # three.js scene, layers, picking, pins
    │   ├── review/         # 2D conversion review editor
    │   ├── features/       # projects, issues, progress, history
    │   └── api/            # typed client (generated from OpenAPI)
    └── tests/
```

---

## 3. Data model (core)

Core tables:

```
Organization ─┬─ User (global identity)
              └─ Project ── ProjectMembership(user, role, trades[], zone_ids[])
                   └─ Building ── Level(elevation, height) ── Zone(name, polygon)
Drawing (file, level_id?, kind: arch|plumbing|electrical|hvac|…, uploaded_by)
ConversionJob (drawing_ids[], status, layer_mapping, scale, log)
ModelRevision (project_id, n, source_job_id, approved_by, glb_uri per level)
Element (stable_id, revision_id, level_id, zone_id?, trade, type, geometry_ref, props jsonb)
Issue (project, title, status, priority, assignee, trade?, element_id?, anchor xyz + camera viewpoint, due)
  └─ Comment, Attachment
Task / WorkAssignment (trade, zone/elements, assignee, due)
ProgressReport (author, date, zone, notes) ── Photo (uri, exif, gps)
  └─ ProgressClaim (element_id | task_id, claimed_status) → Approval (by, decision, at)
ElementStatus (element_stable_id, status: not_started|pending|complete|rejected, current) – derived/cached
Event (id, project_id, actor_id, at, entity_type, entity_id, action, diff jsonb, location jsonb)
```

Notes on these choices:
- **`Element.stable_id` carries across revisions.** It's matched by geometry and type, so progress and issues survive a re-conversion. When matching fails, the item is flagged for the PM.
- **Roles are per project:** `owner`, `pm`, `trade`, `viewer`. Trade members are scoped by `trades[]` and `zone_ids[]`. Every query goes through one policy function, so the same check covers API responses and file URLs. That way a plumber can't fetch the electrical glTF directly.
- **Future modules plug into existing IDs.** Lots and units are just Zones with a type, so ERP, inventory, draws and warranty can hang off `project_id`, `zone_id` or `element_id`, plus `Event`, without schema surgery. I'll add `Zone.kind` and a `props jsonb` to keep that open.

---

## 4. Milestones (each ends with a stop and a report)

| # | Milestone | Done when |
|---|-----------|-----------|
| **M0** | Skeleton: repo, docker-compose, CI, auth, Org/Project/Building/Level/Zone CRUD, RBAC policy + matrix tests, event log | A user can create a project, invite members with roles, and every change appears in the event log |
| **M1** | Viewer: load a glTF per level (hand-made sample first), orbit/section/level isolate, trade-layer toggles, element picking, trade-scoped visibility | A plumber login sees only the plumbing and their zones. A PM sees everything |
| **M2** | Issues:<br>• pin to a 3D point or element with a saved viewpoint (camera, section box, layers)<br>• status, priority, assignee, watchers, tags, deadline and trade<br>• comments, attachments and snapshot markup<br>• filters, a jump from the issue list to 3D, and a PDF/CSV issue report<br>• in-app notifications | The issue loop works end to end |
| **M3** | Conversion v1 and the 2D/3D split view:<br>• DXF upload → layer mapping → 2D review editor<br>• extrude walls, slabs and openings → glTF → PM approves → ModelRevision<br>• sheet viewer with split view and position tracking, using the registration from conversion<br>• issues can be pinned on the sheet too | Our sample house DXFs convert, golden tests pass, and the sheet and model stay in sync |
| **M4** | Progress: assignments, mobile-friendly photo upload, claims → PM approval → green/pending/original coloring, plus a daily report view | The worker → PM → green loop works on a phone browser |
| **M5** | History: timeline, per-element blame, revision compare (added/removed/changed highlighting), and CSV/PDF export of the audit trail | Questions about who did what, where and when can be answered from the UI |
| M6 (stretch) | Vector-PDF conversion, MEP schematic placement, re-conversion with stable-ID matching, stamps on sheets, saved filters and color schemes, simple issue automation rules | — |

I'd put Conversion (M3) *after* the viewer and issues on purpose. That way the coordination product is usable with a sample model while the hardest piece matures, and the viewer gives us a way to inspect conversion output.

---

## 5. Questions / ambiguities (please answer before I build past M0)

0. **The brief is truncated** at Feature 1 ("...zones (rooms or areas such as Unit"). Please send the rest: the remainder of Feature 1, Features 2–4 in detail, and anything about non-functional requirements, the deliverable filenames, and so on. The placeholders in "Start by writing : ..." and "keep a  with setup steps" look like filenames that were lost. I've assumed `PLAN.md` and `README.md`.
1. **Input formats:** what share of your builders have DWG/DXF and what share only have PDFs? Are those PDFs vector exports or scans? Can you give me 2–3 real (or anonymized) drawing sets? This one question decides how feasible M3 is.
2. **DWG:** is it acceptable to require DXF export, or convert with the ODA File Converter (free, but closed-source with licensing terms)? Native DWG parsing in-house isn't realistic.
3. **Conversion fidelity:** is "walls, slabs, openings, rooms, plus schematic MEP" an acceptable v1 fidelity? Do you need roofs, stairs or framing members?
4. **Progress approval:** do you accept the claim → PM approval → green flow from 1b, or must a photo alone turn elements green?
5. **Granularity of progress:** by element (this wall), by zone plus trade ("Unit 3B plumbing rough-in"), or by task checklist? For small builders I'd suggest zone + trade + phase (rough-in / trim / final) as the default.
6. **Offline:** do trade workers need offline photo capture (no signal on site)? If so, the web app needs to be a PWA with an upload queue. Alternatively, would a native app be expected later?
7. **Tenancy:** is this multi-tenant SaaS (many builder orgs) from day one, or a single org for now?
8. **Auth:** is email/password OK for the MVP, or do you need Google/Microsoft SSO or magic links? Also, do trade workers have email, or do they log in by phone or SMS?
9. **Hosting / deployment target:** AWS, GCP, a single VPS, or don't care for now?
10. **Stack:** any constraints, such as a team that only knows Node or an existing infra preference? If not, I'll go with Python + React/three.js as above.
11. **IFC export:** should we export IFC so builders can hand models to Revizto/Navisworks users? It's cheap to add once we have elements, and it's a good interop story.
12. **Scale targets:** what's the largest project (units, levels, drawings per level) we should test against?
13. **Revizto parity:** is the "match / later / skip" split in §1d right for you? In particular:
    - Is it OK to skip clash detection for the MVP?
    - Do you need the issue workflow to match Revizto's (open / in progress / closed), or can we add "pending review"?
    - Does anyone have a Revizto seat I could see screenshots or a walkthrough from? The site is blocked from my sandbox.

---

*Next step: once you answer (especially Q0 and Q1), I'll update this plan and start M0.*
