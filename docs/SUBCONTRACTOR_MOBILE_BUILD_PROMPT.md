> **October 6 update:** the crew app was built natively for iPhone instead of as a PWA, with camera, AR/LiDAR mounting-height measurement and GPS, on branch `mobile-ios`. See [mobile/README.md](../mobile/README.md). This prompt remains as the original brief; its "no LiDAR / no live AI" limits no longer apply.

> **October 6 API update:** The chosen PM website now supports shared private daily work. For the companion's core task/correction flow, use the contract in [SHARED_DAILY_WORKFLOW.md](SHARED_DAILY_WORKFLOW.md), especially `GET /api/projects/{id}/workspace` and `POST /api/work/{id}/updates`. Select assigned server work IDs, submit actual photos with stable `client_uuid`, `captured_by`, confirmed source version/location, note, claim and capture time, then reconcile `upload_id`. Fetch returned photos with authorization. Crew roles cannot approve or close an issue; fresh correction photos remain red until explicit PM review. Public sample IDs remain unrelated. The legacy zone/checklist/upload contracts below are compatibility context and must not be used to submit an element that has shared tracked work.

# Placeholder AI — subcontractor mobile app build prompt

Updated October 6, 2026. This is a self-contained brief to give Claude in a new conversation. The mobile app is **not built yet**. Copy everything below the divider into Claude; it does not need this conversation.

---

## Your task

Build a small, polished **installable mobile PWA** for subcontractors and field crews to upload daily construction updates. Prioritize a working vertical slice over breadth: choose my project/location → see the building context → take photos and write a short note → submit reliably → see my submission history. This is a companion to our existing PM website, not another construction management suite.

Use React, TypeScript and Vite, with a manifest and service worker for the application shell. This first version targets mobile Safari and Chrome. It does not need an app-store release, Expo, native plugins, video capture, LiDAR, a chatbot or live AI. Keep those out of this build. A PWA fits the time constraint and lets us reuse the actual Three.js model renderer. Document that installation and camera use on a real phone require HTTPS (localhost development is an exception).

Our existing repository is https://github.com/tanish1608/Anything-works, branch `main`. Inspect the repository guidance before changing code. If working in that repository, add the companion under `mobile/`, with its own package scripts and deployment instructions. Do not replace the current PM website or restore its retired route tree. If repository access is unavailable, build the app with an explicitly labeled mock data provider and document the integration steps; do not claim mock uploads reached the PM.

## Product context

Use the **Placeholder AI** name and supplied angular P identity. Reuse `web/public/brand/mark.svg` (black master; invert to white on dark backgrounds) and `web/public/icon-192.png` / `icon-512.png` for app icons; [BRANDING.md](BRANDING.md) documents the assets. Keep the wordmark readable and the mark decorative beside it.

If this prompt is supplied without repository assets, the editable mark is:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 116" fill="currentColor" aria-hidden="true">
  <path d="M0 42 28 28v88L0 106Z"/>
  <path d="m25 12 13-12 43 23q10 5 10 16v15q0 6-7 10L68 73V43q0-7-7-11Z"/>
  <path d="m35 63 26-14v24L35 87Z"/>
</svg>
```

Use white on the dark header and dark ink on light surfaces, paired with the text **Placeholder AI**.

**Placeholder AI** aims to check daily construction updates against approved project information, flag potential mistakes, and connect evidence, issues and progress to the same 3D building. It applies to all construction stages. Checking electrical work before drywall is one example, not the entire product.

The existing website centers a large building model, with contextual work/evidence panels. It has two public IFC samples, optional authenticated project/model onboarding, and a browser-local demo of capture/review/corrections. The live assessment agent is not connected. Authenticated upload/review APIs exist, but the chosen PM website does **not yet display those private field records**. A real mobile API upload is stored on the backend; showing it in the current PM panel requires a separate integration. Make this distinction explicit in your README and demo instructions.

A crew's photo or claim that work is finished never automatically means accepted, code-compliant, or inspected. Submission changes the record to awaiting review. Only show actual returned review information; never simulate a successful AI check on a real photo, auto-turn a model green after upload, or edit model geometry from field evidence.

## Scope and screens

Only subcontractors/field crews use this app. Their backend membership role is `trade`; there is no separate `worker` server role. No PM approvals, customer portal, budgets, procurement, people management, model import, RFI suite, analytics dashboard or permission editor.

1. **Sign in.** Email/password for an existing invited account. Clear loading/error handling. No open signup or selectable fake role. Only projects returned for this authenticated user are accessible. If an account lacks upload permission, explain that and disable capture; do not grant access client-side.
2. **My site.** Project switcher when the account has more than one project. Project name, the current approved 3D building, current location, and one prominent **Add daily update** button. Below: a short list of my recent updates. This is not a KPI dashboard. Show only permitted trades/zones/components; use actual IDs. You can label the source checklist “Work to report”; do not invent assigned work-package records from our browser-local PM fixtures.
3. **Choose location/work.** Building → floor → room/zone, with a simple searchable list. Show unit numbers only if reviewed metadata establishes them; never infer Unit 403 or invent a room. Select zero or more allowed source components from that zone/trade checklist. Highlight selected components in the 3D context when geometry exists. Require a checkbox confirming the location before submission. If a component has no room association, do not silently attach it to an arbitrary room; offer the supported zone-level report or explain the missing association.
4. **Capture daily update.** Confirm trade, floor and room. Add 1–6 photos using camera or gallery; show previews with remove/retake. A required short “What changed today?” note, with a placeholder such as “Installed cold-water connection; pressure test still needed.” Keep the location chip visible. Use the current approved source version as capture context. Avoid extra forms; hours, crew count, structured materials and completion percentage are not needed in version one.
5. **Review and submit.** One summary with selected project/location/work, photos and note; Back to edit and Submit. Save a durable local draft before making a network request. Show truthful progress and distinct states: **Draft**, **Queued on this device**, **Uploading**, **Submitted — awaiting review**, **Needs attention**. A successful response with an upload ID is the only basis for “Submitted.” Offline mode must say the update is still on this device.
6. **My updates/detail.** Actual own uploads, newest first, with date, zone, trade, thumbnails and note. Open an update to see evidence and returned review information. Pending, uncertain and correction requests remain distinct from human confirmation. Display a legacy installation verdict as a reviewer observation, not comprehensive quality approval. Show local unsent drafts separately from server submissions. Correction photos are a new update with an explicit reference in the note; the shared work contract now carries the issue/correction state and history; use it for linked correction updates.

Use a compact bottom navigation if useful: **Site · Updates**. The capture button is the main action. There is no desktop sidebar and no repeated 3D viewer on every screen. Keep one renderer on the site/location screen and dispose it when leaving that screen. Capture itself should prioritize photos.

## Visual direction

The product's visual focus is the building, inspired by a clean 3D property showroom. Make the app feel related to the PM website without shrinking its desktop dashboard.

- Inter or the system sans-serif; dark slate background `#101a28`, model stage `#101b2a`, panels `#182535`, borders `#2d3e52`, main text `#edf3fb`, secondary text `#98aabd`, blue accent `#5fa9ff` / `#72b6ff`.
- Large readable project title; spacious photo previews; a roughly 260–320 px building preview on the site screen. One primary action per step. Moderate rounding and restrained borders; no neon gamer decoration, dense badge clusters or tiny inspection tools.
- At least 44 px touch targets, visible focus, safe-area insets, stable layout while the keyboard is open, appropriate input types, and strong contrast. Progress/error meaning must be readable without color alone.
- Rotate the model slowly only on an idle site screen; respect reduced motion, pause on touch interaction and when backgrounded. No rotation during photo capture. Provide a pause control.
- Design at 390 px width; verify 320 px, landscape and tablet. No horizontal page overflow. Keep the submission action reachable without covering the form or photo controls.

## 3D implementation

Reuse our real geometry rather than drawing a decorative replacement building. Relevant existing files:

- `web/src/viewer/ProjectScene.tsx`: shared React scene controller, selection/markers, rotation, layer loading and source-preserving exploded presentation.
- `web/src/viewer/ViewerCanvas.tsx`, `Viewer.ts`, `spatialMath.ts`, `explosion.ts`, `markers.ts`, `envelope.ts`, `colors.ts`, `filters.ts`, `bridge.ts`: renderer and helpers. Inspect transitive imports before copying/reusing; one file alone is not the complete viewer.
- `web/src/viewer/modelData.ts`: public sample manifest/types. `authorizedModel.ts`: authenticated current-model/plan loading and authenticated GLB loading.
- `web/src/viewer/ModelPlan.tsx`: model-derived 2D silhouettes, not original approved drawing sheets.
- `web/src/api/client.ts`, `types.ts`: actual transport/auth contracts.
- `web/src/field/queue.ts` and retained field pages: earlier queue/capture foundations. Their public routes are retired, and their old storage design must not be treated as finished account-scoped offline security.

The public model assets live under `web/public/bim-duplex/` and `web/public/bim-schependomlaan/`. Preserve their attribution if used in a labeled sample mode. The larger apartment has 3,504 components, about 17 MB of detailed manifest JSON and 4.7 MB of meshes. Do not load both models or multiple WebGL canvases to create thumbnails. Do not copy all detailed properties into the mobile form. Use the smaller source sample for optional mock demonstrations.

For connected use, load the **current approved** project model; drafts are not field reference. Fetch authorized meshes using the authenticated API helper, then pass their ArrayBuffers to the renderer. Do not put access tokens in image/mesh URLs. A private model never falls back silently to a sample building.

Limit pixel ratio and unnecessary layers for phones, pause rendering when idle/backgrounded, and dispose geometries/materials/listeners/object URLs on replacement/unmount. Preserve IFC world coordinates and model/version/component identity; exploded floors are presentation offsets only. Camera framing must fit the actual model, with a close-up only when a component is selected. The model is spatial context, not automatic photo registration. Exact photo-to-world matching, measurements and AR/LiDAR are future work.

If WebGL or model loading fails, keep the authorized floor/room/checklist selector and photo submission usable, with a clear “3D unavailable” explanation. Do not make successful camera capture depend on WebGL. Only show a 2D fallback when actual model-derived plan data exists.

## Primary shared-work contract (use this for the new companion)

Use the existing bearer authentication and project/model loaders below. The phone app must select **an assigned private work package** returned by the workspace endpoint. A zone checklist alone does not establish a shared task in the PM interface.

- `GET /api/projects/{projectId}/workspace` returns `{state, user, role, permissions}`. `state.items` are the permitted assigned records, with `id`, `title`, `trade`, `owner`, `assigneeId`, `serverRevision`, `location` (approved version, source elements, floor/room and anchor), `captureGuidance`, `photos`, `update`, `review`, `issue`, `correction`, `progress` and history. Use `permissions.capture`; a role preview cannot grant permission.
- Confirm the chosen task/location and required capture views. Post multipart to `POST /api/work/{workId}/updates`: `client_uuid` generated once, `captured_by` = authenticated `user.id`, captured `model_version_id`, `confirmed=true`, required `note`, optional separate `claim`, ISO `captured_at`, and 1–6 `files` (JPEG/PNG/WebP, server max 25 MB each). The response `{upload_id, client_uuid, received:true}` is the receipt, not AI approval.
- Refresh the workspace after receipt and on foreground/reconnect (the PM app polls every ten seconds). Show `state.events` and latest `state.assessmentJobs` receipt/reference/actor context for task history. Shared photos use authenticated `GET /api/photos/{id}` to an object URL; never put bearer tokens in URLs.
- A PM request changes the task's recorded review/detail. Submit correction photos as a **new UUID on the same work ID**. The issue stays open until a PM/owner records a review decision. The crew app must not call `/work/{id}/decisions` to approve/resolve, nor legacy issue PATCH as a shortcut.
- Show actual in-app follow-ups from `GET /api/notifications?unread=true`, filtered by project. Mark read through `POST /api/notifications/{id}/read`. No external message delivery is implemented.
- A 409 means changed reference, stale context or conflicting identity. Keep the photos; let the PM reconfirm the work reference, then have the crew explicitly reconfirm and create a new draft submission. A lost response with unchanged payload retries the original UUID. A denied/removed assignment keeps the evidence on that user's device until access is restored.

The PM creates/assigns the task and capture requirements; crews do not re-enter ownership. An administrative owner is a manager, while a customer is a read-only viewer. Public browser sample records are not imported into this server contract. Private model loading requires a network; preserve confirmed drafts/outbox until reconnection without claiming offline 3D.

## Legacy intake and model API context

All paths below include the `/api` prefix. Use the server implementation/types as final authority if anything differs. The API base URL must be configurable, e.g. `VITE_API_BASE_URL`; use a same-origin proxy in development where possible. No embedded production credentials or invented endpoints.

Deploy the companion on its own HTTPS origin with `/api` proxied to the existing backend where possible; this keeps its service-worker scope separate from the PM website. If hosting under a path on the same origin instead, configure Vite base, router basename, manifest start URL and service-worker scope consistently (e.g. `/crew/`), and verify the PM root service worker does not intercept the companion's routes. Use a distinct mobile session-storage key and account-scoped draft database; don't accidentally share a global queue with the PM prototype. If using a cross-origin API, configure the backend's explicit allowed origins; don't disable authentication or broadly allow origins as a shortcut.

| Purpose | Request / response |
|---|---|
| Sign in | `POST /api/auth/login`, JSON `{email,password}` → `{access_token,refresh_token}` |
| Refresh | `POST /api/auth/refresh`, JSON `{refresh_token}` → rotated token pair; the existing client retries a 401 once |
| Identity | `GET /api/auth/me` → `{id,email,name}` |
| My projects | `GET /api/projects` → array with `id,name,address,settings,created_at,my_role,my_trades,my_zone_ids` |
| Spatial tree | `GET /api/projects/{projectId}/tree` → buildings with levels and zones, each with actual IDs and names |
| Approved model | `GET /api/projects/{projectId}/viewer` → `{version: ModelVersion \| null,layers:[{discipline,url,context}]}`; use current version, no draft selector |
| Source components | `GET /api/projects/{projectId}/elements` → permission-scoped component records with identity, location and bounds |
| Source plan | `GET /api/models/{versionId}/plans/{levelId}` → model-derived elements/rooms/provenance |
| Mesh | Authenticated GET of the returned layer URL, normally `/api/models/{versionId}/meshes/{discipline}.glb` |
| Zone work checklist | `GET /api/zones/{zoneId}/checklist?trade={code}` → `{model_version_id,zone:{id,name,level_id,polygon},items:[...]}`; item IDs are eligible element IDs |
| Submit | `POST /api/projects/{projectId}/uploads`, multipart fields described below; response 201 with an upload record |
| Own history | `GET /api/projects/{projectId}/uploads?mine=true&limit=50` → own upload records; label this “Recent updates,” not an unlimited full history |
| Detail | `GET /api/uploads/{uploadId}` → upload plus photos/verifications |
| Private photo | `GET /api/photos/{photoId}` (optional `?thumb=1`) → authenticated image Blob |

Send `Authorization: Bearer <access_token>` on private requests. Backend RBAC is authoritative; client filtering is a usability aid. Project members carry `my_role`, `my_trades` and possibly limited `my_zone_ids`. Never broaden those based on a route or locally selected role.

Multipart submission fields:

```text
zone_id           required actual permitted zone ID
trade             required actual permitted trade code
client_uuid       required UUID generated once when the local update is created
files             required repeated field for the photo Files/Blobs
note              short text, server limit 5,000 characters
captured_at       optional ISO 8601 capture timestamp
element_ids       JSON string array of allowed checklist IDs, e.g. ["source-id"]
model_version_id  approved version used when confirming work location; send it when available
```

Do not manually set multipart `Content-Type`; the browser supplies its boundary. Omit the optional server `reference` image field in this first version: an automatically captured 3D screenshot is not an approved drawing or evidence of installation.

The upload response includes `id,zone_id,trade,user_id,user_name,zone_name,note,client_uuid,captured_at,created_at,analysis_status,photos,verifications`. Photo entries include authorized `url` and `thumb_url`. Verifications include `element_id,verdict,confidence,reason,source,state,confirmed_by,confirmed_at,overridden` and other provenance fields. Inspect existing types for exact enums; don't manufacture an AI-approved state.

The backend supports uploads without selected element IDs, allowing a zone-level update where appropriate. The app should require the short note and confirmed location even where the server accepts an empty note. Shared private work is now exposed through the workspace/work endpoints above; public demo browser IDs are still not private work or element IDs.

## Reliable photos, drafts and offline behavior

Use IndexedDB to store account/project-scoped drafts, photo Blobs and a durable queue; not base64 photos in localStorage. Generate `client_uuid` **once** and reuse it for every retry of the same update. The backend is idempotent per project/UUID. Record and reconcile the returned upload ID; an interrupted connection must not create duplicate submissions.

Choose a reasonable first-version client limit: 1–6 images, JPEG output when supported, longest edge approximately 2,048 px, no more than 8 MB per output. The existing server maximum is 25 MB per file. Explain decode/HEIC failures and allow retaking or choosing supported photos; never silently upload an empty/corrupt image. Revoke preview object URLs on removal/unmount. Keep capture timestamps distinct from server submission timestamps. Don't infer GPS location or measurements from missing metadata.

Retry on the next foreground open and explicit Retry, with bounded backoff for network/server failures. `navigator.onLine` is a hint, not proof a request succeeded. Do not promise iOS background sync. Preserve drafts across reloads on the same device, and label them accordingly.

Handle failure cases deliberately:

- **401:** refresh once; if unsuccessful, require reauthentication. Keep queued updates tied to their original account; never send them under another account.
- **403/invalid zone or trade:** keep evidence, stop automatic retries and ask for permitted project/location context. Do not downgrade into a public sample.
- **409 model revision changed:** fetch the new approved reference, show the change and require location/component reconfirmation before retrying the retained evidence. Do not silently replace the version. Other 409 responses can mean a reused photo; show the server reason rather than treating every conflict as a model change.
- **413 / 422 photo validation:** show which photo/field needs correction and preserve the rest of the draft.
- **Lost connection after Submit:** retry with the original UUID; do not add a second local record with a new UUID.

Service-worker caching should cover public app-shell assets only. Private API responses, model files and photo URLs must not enter a shared URL-keyed cache. Session changes must remove private in-memory/query/object-URL state. Scope queued drafts by authenticated user ID; signing in as a different user cannot expose or submit the previous user's queue. On logout, offer a clear discard-unsent-data choice, and lock retained drafts to the original user. This first version need not provide private model viewing offline; it can preserve already confirmed capture context and photo drafts until reconnection. State this limitation.

Set the initial backend demo configuration to **`VISION_MODE=off`** and project approval mode **`pm_required`**. Submitted evidence awaits review; don't turn on mock automatic approvals to make a demo look connected. If backend settings cannot be changed from this task, report that setup requirement explicitly.

## Delivery and acceptance

Deliver working source, `.env.example`, package scripts and a concise README covering setup, API connection, HTTPS phone testing, demo vs real mode, known gaps and the PM private-record integration boundary. Keep the existing website intact. Include fixture data only behind an unmistakable sample-mode label and a provider interface; production mode must never silently fall back to fixtures.

Verify these concrete journeys with meaningful tests and actual phone checks where available:

1. A permitted trade user signs in, sees only allowed projects/locations, selects context, captures photos and submits; the API returns the server upload ID and own-history shows it.
2. Submission works through the accessible location list when 3D fails. Changing project disposes the prior scene and keeps drafts separate.
3. Airplane-mode capture survives reload; reconnect/retry submits once with the original UUID. A timeout after the server stored the upload also does not duplicate it.
4. A source-revision conflict preserves photos and demands reconfirmation. Validation failures preserve the draft. Session expiry never reports a fake success.
5. Switching accounts does not leak project geometry, photos, history or queued updates, and cannot submit the other account's draft.
6. No upload turns the model green automatically. Review information shown in the app matches actual returned provenance.

Run TypeScript/build and focused unit/integration tests. Record which camera, installation, rendering, offline and iPhone/Android journeys you actually tested; don't substitute DOM tests for real-device results. Finish the core slice before optional styling extras. In your final delivery, distinguish working features, mocked features, backend setup requirements and the remaining integration with the PM website.
