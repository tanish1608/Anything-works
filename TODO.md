# SiteMesh — what's left to do

Last updated: Oct 4, 2026

## Where we are

The codebase covers the original eight-milestone brief. Checked today:

| Check | Result |
| --- | --- |
| Backend tests (SQLite) | 122 passed |
| Backend tests (Postgres 16) | 121 passed, 1 skipped (the SQLite-only migration check) |
| Backend lint (ruff) | Clean |
| Web unit tests (Vitest) | 16 passed |
| Web lint (oxlint) | 0 errors, 14 warnings (mostly setState inside an effect: `SheetReviewPage.tsx`, `HistoryPage.tsx`) |
| Web build | OK |
| End-to-end (Playwright) | 9 of 9 in two full runs today. `m4.spec.ts` was flaky earlier; keep an eye on it |
| Conversion eval | 100% on our generated samples. **Fails on the first real set** (`drawings2d.pdf`, 12 NIST sheets): see 2.11a |
| Vision eval | Now on **Google Gemini** (`gemini-3.8-flash`). First real API run: 1 synthetic case, 3/3 installed found, missing caught, 0 false greens. No real photos yet |

What the product now is (the final pitch):

1. The whole job sits on a 3D model of the building.
2. Tasks and problems are pinned to the exact room, wall or fixture, with an owner and a due date, and tracked until done.
3. Crews update from their phones with a photo. That spot turns green only with proof and PM approval.
4. The daily report writes itself from the day's updates, photos and voice notes.
5. You can see when a room is clear for the next trade.

What the code already has vs. what this needs:

| Need | In the code today? |
| --- | --- |
| 3D model viewer with trade layers, floors, section box | Yes |
| IFC import, re-import keeps elements matched by IFC GUID | Yes (needs testing on real architect models) |
| Problems (issues) pinned in 3D with viewpoint, owner, priority, due date, comments | Yes |
| **Planned work (tasks) assigned to crews and zones by day** | **No.** Only issues exist |
| **Subcontractor companies and crews** | **No.** Trades are text labels on a project member |
| Photo uploads from the field, offline queue, QR codes per room | Yes |
| Photo check against expected elements (Gemini vision), PM approval, green only with evidence | Yes (untested on real photos) |
| **Guided capture (required photo angles per zone)** | **No** |
| **Voice notes** | **No** (skipped earlier) |
| **AI daily log** | **No** |
| **Zone readiness and trade handoffs** | **No** |
| History, versions, timeline replay | Yes |
| **Owner dashboard across projects** | **No** |
| **Push notifications, email/SMS invites, sub access without an account** | **No.** In-app notifications only |
| 2D-to-3D conversion (DXF, vector PDF) | Works on our generated samples only; real PDF sheets fail (see 2.11a). Now a fallback rather than the main feature |
| **Hosting, real storage (S3), backups, monitoring** | **No.** Local disk and SQLite by default |

---

## Phase 0 — Clean up the repo (1–2 days)

- [x] Commit `CLAUDE.md`.
- [ ] Commit the Gemini switch (vision client, config, tests, docs) and the test guard that keeps tests from calling the real API.
- [ ] Stop tracking `backend/sitemesh_backend.egg-info/` and `web/e2e/.results/*.png`. Add both to `.gitignore` (they change on every install or test run).
- [ ] Watch `e2e/m4.spec.ts` (passed in two full runs on 2026-10-04, flaky before). If it fails again, fix it. Likely a timing issue with the offline queue sync or the shared seeded database between specs. Wait on a real signal (the network response or a UI state), not a timer.
- [ ] Fix the oxlint warnings (14 today) (derive the value during render instead of setting state in an effect).
- [ ] Fix the 25 pytest warnings (mostly deprecations). Treat warnings as errors in CI once they're clean.
- [x] Push to GitHub (`tanish1608/Anything-works`). Check that CI goes green there.
- [ ] Update `PLAN.md` and `STATUS.md` with the new direction: 3D task and progress tracking for mid-size builders; conversion becomes a fallback.
- [ ] Rename the product if "SiteMesh" stays a working name. Check the domain and trademark before the pilot.

## Phase 1 — Prove the idea with real people before building much more (2–4 weeks, runs alongside Phase 2)

These are the questions that decide whether the build is worth it. Each one gets a number we write down.

- [ ] **Interview 10–15 superintendents and PMs** at mid-size builders ($20M–$300M a year). Ask:
  - How do you track who's working where today?
  - How long does the daily report take, and who reads it?
  - How often does a crew show up to a room that isn't ready? What does that cost?
  - How do you check a sub's progress before paying them?
  - What tools do you pay for now (Procore, Raken, Fieldwire, OpenSpace, WhatsApp, spreadsheets)? What do you hate about them?
- [ ] **Count how many jobs actually have a usable 3D model (IFC/Revit) from the architect.** Ask every interviewee and every architect we know. If it's under ~30%, the 2D conversion fallback moves back up the list.
- [ ] **Collect 3–5 real IFC models** from real projects (family business first). These become test data.
- [ ] **Collect 2–3 real drawing sets** (DXF/PDF) for the conversion fallback.
- [ ] **Shadow one superintendent for a day** on the family business site. Write down every phone call, text, photo and report. This becomes the "before" picture.
- [ ] **Track trade handoffs on one building for a month.** Count how many times a crew arrived and the room wasn't ready, and how many hours or days that lost. This is the proof for the handoff feature.
- [ ] **Look at Smartapp, OpenSpace Field, Fieldwire, Dalux and Raken hands-on** (free trials or demos). Write one page on what each does well and badly for a mid-size job.
- [ ] **Decide US first or India first.** Competition is much denser in the US. Write down the reasons and pick one.
- [ ] **Test pricing in conversations.** Would you pay $1,000–2,500 per project per month? Per project, or per year across all projects?

## Phase 2 — Build what the pitch promises (6–10 weeks)

Build in this order. Each item ends with tests, a commit and a short report, per the working agreement.

### 2.1 Tasks (planned work) — P0

- [ ] Add a `Task` model: title, description, project, zone, elements (many), trade, assigned company or crew, assignee, start date, due date, status (not started / in progress / done / blocked), priority, created by. Use the same pin-and-viewpoint approach as issues.
- [ ] Decide whether tasks and issues share one table with a `kind` field, or stay separate. (Suggestion: one "work item" table with kind = task | issue. Same list, filters, comments and pins; less code.)
- [ ] Migration `0007_tasks`, plus tests on SQLite and Postgres.
- [ ] Events for every task change (created, assigned, status, due date moved). The append-only log rule still applies.
- [ ] API: create, update, list with filters (zone, trade, crew, assignee, status, due this week, late), bulk-create (e.g. "plumbing rough-in for every unit on Level 3").
- [ ] Web: create a task by clicking an element or room in 3D; a task list with filters; a "my tasks today" view.
- [ ] Viewer overlay: color elements by task status (late = red outline, due today, done).
- [ ] Field app: a crew sees today's tasks for their zones, updates status, attaches photos.
- [ ] Link a task to progress: finishing a task with photos creates the upload that the PM approves. No separate flow.
- [ ] Tests: permissions (a trade sees only their tasks and zones), the events are written, no task marks an element green without evidence.

### 2.2 Companies and crews — P0

- [ ] Add `Company` (subcontractor firm) and `Crew` (a named group under a company, with a foreman). Project members belong to a company.
- [ ] Assign tasks and issues to a company or crew, not only a person.
- [ ] Crew check-in per zone per day (a tap in the field app or a QR scan). This is the "who worked where" record for the daily log.
- [ ] Update RBAC: a foreman manages their crew's tasks; a company admin sees all their crews on the project. Keep all checks in `app/rbac.py`.
- [ ] Tests for every new permission.

### 2.3 Sub access without friction — P0

- [ ] Invite by email and SMS with a magic link. No password needed for trades.
- [ ] Let a sub open one task from a link and reply with photos without creating a full account (a scoped, expiring token tied to that task).
- [ ] Rate-limit login and magic-link endpoints.
- [ ] Tests: expired links fail, a token can't read other tasks or zones.

### 2.4 Guided capture — P0 (fixes the biggest weakness in photo checks)

- [ ] Per zone and trade, define required photo angles (e.g. "bathroom wet wall, full height", "under the sink"). Start with templates per room type.
- [ ] Field app walks the worker through each required shot, with an example picture and an overlay hint.
- [ ] The vision check only says "complete" when every required angle is present. Otherwise the elements stay "not visible" and the worker is asked for the missing shot.
- [ ] Capture the reference render from the viewer for each angle (the `reference_key` field exists; wire it to required angles).
- [ ] Add a coverage number to the vision eval: what share of expected elements appeared in at least one photo.

### 2.5 Voice notes — P0 (the daily log needs them)

- [ ] Record audio in the field app, queue it offline like photos.
- [ ] Transcribe on the server (pick a speech-to-text API; model name and keys in env vars).
- [ ] Attach the transcript to the upload, task or issue. Show the audio and text in the UI.
- [ ] Support Spanish (and Hindi/Telugu if India first). Check transcription quality on real site audio with background noise.

### 2.6 AI daily log — P0

- [ ] Add a `DailyLog` model: project, date, status (draft / signed), body (structured sections), signed by, signed at, sources (the events, uploads, photos and transcripts it used).
- [ ] A nightly job (and a "draft now" button) gathers the day's events, check-ins, task changes, issues, uploads and transcripts, and asks Gemini for a structured draft:
  - weather
  - crews and headcount by company and zone
  - work completed
  - issues opened and closed
  - delays
  - inspections
  - safety notes
  - tomorrow's plan
- [ ] Every line in the draft links back to its evidence (photo, task, transcript). No claims without a source.
- [ ] The super edits and signs. A signed log is locked; corrections become a new event.
- [ ] Export the signed log as PDF and send it to the owner by email.
- [ ] Pull weather automatically from a weather API using the project address.
- [ ] Eval harness: for 10+ real site days, compare the AI draft with the super's own report. Measure missing facts, wrong facts (must be zero) and minutes saved.

### 2.7 Zone readiness and trade handoffs — P1 (our sharpest differentiator)

- [ ] Define prerequisites per zone and trade. Example: drywall in Unit 304 needs plumbing rough-in, electrical rough-in and fire sprinklers all verified, the inspection passed and no open issues. Start with templates per building type.
- [ ] Compute a readiness state per zone (ready / blocked by X / not started) from verified elements, inspections and open issues.
- [ ] Show readiness on the 3D model (a "ready for drywall" view) and in a list.
- [ ] When a zone becomes ready, notify the next trade's foreman and create or unblock their task.
- [ ] Add an `Inspection` record (type, zone, date, inspector, pass/fail, photo of the signed card).
- [ ] Tests: a zone is never "ready" while any prerequisite lacks evidence.

### 2.8 Owner dashboard — P1

- [ ] Portfolio page: every project with % complete by trade, late tasks, open issues, and the last signed daily log.
- [ ] A project summary page that works on a phone.
- [ ] A weekly email summary.

### 2.9 Notifications — P1

- [ ] Web push for the installed PWA (Android, desktop, iOS 16.4+ from the home screen).
- [ ] SMS for subs who never open the app (task assigned, zone ready, retake requested).
- [ ] Email digests. Per-user notification settings.

### 2.10 UI polish — P1

- [ ] Redesign the office app. It works but looks like a dev build. Use the walkthrough demo's look as a starting point.
- [ ] A simpler field app: big buttons, works with gloves, readable in sunlight, three taps to report.
- [ ] An onboarding flow: create project → upload IFC → see the model split into floors and rooms → invite crews. Target: under 15 minutes.
- [ ] Empty states, loading states and error messages written in plain site language.

### 2.11 Integrations — P2

- [ ] Procore: two-way sync of tasks and issues, push signed daily logs into Procore's daily log.
- [ ] Import photos from OpenSpace or other 360° tools where the customer already uses them.
- [ ] Import the schedule from MS Project or P6 to create tasks.
- [ ] Optional: photo intake over WhatsApp (a sub sends photos to a number and they land on the right task).

### 2.11a Conversion on real drawings — P1 (moves to P0 if Phase 1 finds most jobs have no IFC)

First real test, 2026-10-04: `drawings2d.pdf` (12 vector sheets from NIST: house, duplex, apartments, office, retail, school, restaurant). Every sheet "converts" but none is usable. On sheet 2 (house, first floor): 55 wall pieces, 0 doors, 3 rooms named "W", "M", "H", scale guessed. Fix in this order and track each step with the eval:

- [ ] Make it an eval set: split into one PDF per sheet under `samples/pdf/real_nist/`, record the true scale, room names, door and window counts in `expected.json` for at least the house sheets (2–4). Check and note the licence in `samples/README.md` (US government work).
- [ ] Filter the sheet border and title block. Today only lines on the page edge are dropped; these sheets have an inset frame, which became walls and a 47 m² "room".
- [ ] Read rotated text. The plans are drawn sideways, and pdfminer splits rotated labels into single letters. Group characters by their matrix/direction before matching room labels and scale notes.
- [ ] Find the scale. Notes are tiny and rotated. Also try dimension strings (e.g. `15' - 2 1/4"`) against measured line lengths.
- [ ] Split a sheet into its separate drawings (main plan, enlarged kitchen and restroom plans, schedules) by viewport or title ("FIRST FLOOR PLAN"). Today they are merged into one level.
- [ ] Interior walls: most are missed (thin double lines). Revisit the line-weight rule.
- [ ] Doors: 0 found on all 12 sheets. Check the arc and swing shapes these sheets use.
- [ ] Read all pages of a multi-page PDF (today only page 1 is read), with the PM picking which sheets are plans.

### 2.12 Park for later (don't build now)

- [ ] Payments tied to verified progress, lender draws, materials and deliveries. The data model leaves room for them.
- [ ] Raster or scanned drawing conversion. Scoped in `PLAN.md` §9.
- [ ] Branch-and-merge UI for design changes (the API supports it).

## Phase 3 — Production readiness (2–3 weeks, before the first paid pilot)

- [ ] Choose hosting (AWS, GCP or a simpler platform). Write it in `PLAN.md` §8.
- [ ] Postgres in production with daily backups and a tested restore.
- [ ] Move photo, IFC and GLB storage to S3-compatible storage (`Storage` interface exists; add the S3 backend).
- [ ] Replace the DB job queue only if it can't keep up. Measure first.
- [ ] Secrets in a secret manager; nothing in code (non-negotiable 6).
- [ ] HTTPS, CORS, secure cookies, CSP headers.
- [ ] Error tracking (e.g. Sentry) for backend and web, plus uptime monitoring.
- [ ] Structured logs, with no photos or personal data in the logs.
- [ ] Security review: auth, magic links, file uploads (type and size checks, image re-encoding), permission checks on every file download.
- [ ] Data policy: who owns photos, how long we keep them, how a customer exports or deletes their data. Write terms of service and a privacy policy.
- [ ] Cost tracking for Gemini vision and transcription per project per day. Set limits and alerts.
- [ ] Load test: one project with 500 photos a day, 50 users, a 200 MB IFC model.

## Phase 4 — Testing plan

### Automated tests (run on every commit in CI)

- [ ] Keep all backend tests green on both SQLite and Postgres.
- [ ] New tests for every feature above, including permission tests for every new endpoint.
- [ ] Contract tests for the viewer's message bridge, if we wrap the app in a native shell later.
- [ ] An end-to-end test per main flow:
  - [ ] PM creates a task in 3D and assigns it to a crew.
  - [ ] Foreman completes it with guided photos, offline, then syncs.
  - [ ] PM approves; the element turns green.
  - [ ] Super opens the drafted daily log, edits it and signs.
  - [ ] Zone becomes ready; the next trade is notified.
  - [ ] Sub replies to a task through a magic link with no account.
- [ ] Visual regression screenshots for the viewer and main pages.
- [ ] A test that fails if anything turns green without linked evidence (exists; keep it).

### Accuracy tests (run whenever a prompt or model changes; record the numbers)

- [ ] **Photo checks:** label 300+ real photos from the family business site (zone, trade, expected elements, true status). Fill `samples/photos/`. Report precision and recall per element type, plus false greens.
  - Target before auto-approve can be turned on: precision ≥ 0.95 and zero false greens on the labeled set.
- [ ] **Coverage:** with guided capture, what share of expected elements appear in at least one photo? Target ≥ 90%.
- [ ] **Daily log:** compare against the super's own report for 10+ days. Wrong facts must be zero.
- [ ] **Voice transcription:** word error rate on 30+ real site recordings, including noisy ones.
- [ ] **IFC import:** run on every real model we collect. Check floors, rooms and trades are detected correctly, and time the import.
- [ ] **IFC re-import:** take two versions of the same real project. Check that tasks and progress carry over and changed elements are flagged.
- [ ] **Conversion fallback:** run the eval on the real drawing sets (first one: `drawings2d.pdf`, see 2.11a). Record how much manual fixing each sheet needed.
- [ ] Keep a results log (date, model name, prompt version, numbers) in `samples/RESULTS.md`.

### Field tests (real phones, real site)

- [ ] Test the PWA on the phones crews actually carry: older Android, iPhone, with gloves, in bright sun.
- [ ] Offline test on site: airplane mode for a full shift, then sync. Nothing lost, nothing duplicated.
- [ ] Battery and data use over a full day of photo uploads.
- [ ] QR codes: print them, post them in rooms, and check they survive a week of site dust.
- [ ] Decide PWA vs. native app based on these results (iOS push and background upload are the usual reasons to go native).

### Pilot test (the real proof)

- [ ] Run a 6–8 week pilot on one family-business building.
- [ ] Before the pilot, record the baseline: daily report time, handoff misses per month, time spent chasing subs, how progress is checked before paying.
- [ ] Measure weekly:
  - [ ] Minutes per daily log (before vs. after).
  - [ ] Share of crews updating from their phones.
  - [ ] Photo checks the PM accepted vs. overrode.
  - [ ] False greens (must stay at zero).
  - [ ] Handoff misses (before vs. after).
  - [ ] How often the PM and owner open the 3D view without being asked.
- [ ] Weekly 20-minute feedback call with the super and PM. Keep a running list of what they hate.
- [ ] At the end, write a one-page case study with the numbers.
- [ ] Then: 3–5 paid pilots with outside builders.

## Phase 5 — Business tasks (in parallel)

- [ ] Rewrite the memo around the corrected competitor picture (add Smartapp, Fieldwire, Doxel, Cupix and DroneDeploy; remove "no one does this").
- [ ] Make the pitch deck from the four-line pitch, the walkthrough demo and the pilot numbers.
- [ ] Record a 60-second screen capture of the walkthrough demo for outreach.
- [ ] Decide on company formation, founder roles and equity split.
- [ ] Build a list of 50 target mid-size builders in the chosen market.
- [ ] Ask architects and MEP consultants we know whether they'd share IFC models with their builders through us.
