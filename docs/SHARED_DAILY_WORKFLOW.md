# Shared daily workflow — Placeholder AI

October 6, 2026. The chosen building workspace now connects **real authenticated accounts, server work records, photo intake, manual review, issues, corrections, history and model progress**. Public samples remain isolated, browser-local demonstrations. Live AI quality checking is not enabled.

## Rehearse with two accounts

1. Start the backend, apply migrations through `0009`, and start the web app. Use `VISION_MODE=off` for this manual demonstration. No reset or seed is required for existing projects.
2. From project home choose **Add / import project**. Register/connect the PM account, create a private project, upload IFC, inspect the draft and approve the model reference.
3. In a separate browser profile or device, register the crew account through project home. Registration alone does not grant project access.
4. In the PM workspace, open **Project team** from the account menu. Add the registered email as a trade crew member with the appropriate trade. A read-only customer uses the `viewer` project role; an administrative `owner` has management permissions.
5. Find a source component through the model or spatial directory. **Track work here** creates a titled work record, assigned to an actual eligible member, with required capture views. A project member needs access to the task's trade and area; one component currently has one tracked work record.
6. On the crew device refresh project home and open the shared project. Only that crew's permitted assigned work appears. Open **New update**, confirm the location, add actual photos and a note, and submit. A worker's completion claim remains separate from acceptance.
7. The PM sees the upload on the next refresh (foreground/reconnect or the ten-second polling interval). Select its work row or model pin to inspect the actual photos and approved IFC reference. Accept reviewed work, request more evidence, or confirm an issue with a responsible member, due date and correction reason.
8. The crew sees the request in the shared record and in-app team updates. Submit fresh correction photos on the same work record. The component remains red while the issue is open.
9. The PM reviews the fresh correction, records a reason and chooses **Accept correction & resolve**. The server closes the linked issue and records human acceptance. The crew, work list, history and 3D projection show the same result after refresh. This is not an AI check or an official inspection.

A panel keeps one renderer mounted while moving between tasks, evidence and history. Notifications are stored in-app; no email, SMS or WhatsApp message is sent.

## Contracts for contributors and the phone companion

All endpoints require the existing authenticated API helper and central project RBAC. Never submit public sample task IDs as private work or component IDs.

| Endpoint | Contract |
|---|---|
| `GET /api/projects/{project_id}/workspace` | Authoritative permitted `state`, actual `user`, `role` and `permissions`. State includes tasks, immutable work-event snapshots and submission/reference receipts. |
| `POST /api/projects/{project_id}/work` | PM/owner: `id`, `title`, `element_id`, current `model_version_id`, actual `assignee_id`, optional `capture_guidance`. Source location/reference are derived server-side. |
| `POST /api/work/{work_id}/updates` | Multipart: stable `client_uuid`, authenticated capture actor `captured_by`, captured `model_version_id`, `confirmed=true`, `note`, separate `claim`, `captured_at`, and 1–6 `files`. Returns `{upload_id, client_uuid, received:true}`. |
| `POST /api/work/{work_id}/decisions` | PM/owner: `type`, `reason`, `expected_revision`, exact `update_id`, plus `assignee_id`/ISO `due` for confirm/assign. Supported types: accept, confirm, request, resolve, reject, assign, reopen, dismiss, reference. |
| `GET /api/photos/{photo_id}` | Authorized image bytes. Fetch with the authenticated helper, display an object URL, and revoke it on unmount/session change. No tokens in URLs; no private response caching. |
| `GET/POST /api/projects/{project_id}/members` | Actual membership and registered-account onboarding. Fine trade/area scopes remain available through member PATCH. No invitation delivery is simulated. |
| `GET /api/notifications?unread=true` | Actual current-account in-app updates. Filter the selected project and mark read through `POST /api/notifications/{id}/read`. Work links open the chosen workspace. |

The existing Upload/Photo intake records are reused. `WorkPackage` stores authoritative task state and optimistic revision; `WorkSubmission` stores the intake receipt, payload hash and original source snapshot. Append-only `Event` records retain actor, decision, evidence IDs and full task snapshots. Work issues reuse `Issue`; active status is also projected to the source element. Legacy upload/verification/AI paths cannot change tracked work, and linked issues cannot bypass correction review through the legacy issue PATCH route.

## Failure and revision behavior

- Drafts and photos use account/project-scoped IndexedDB, not private work snapshots in localStorage. Public fixture keys are unchanged.
- Queue persistence and draft removal commit atomically. Queue identity survives lost responses; exact repeated payloads return the original receipt without adding photos/events. Reusing the UUID for different evidence or another capture actor is rejected.
- A queued update has no server receipt and cannot change server colors or acceptance. Failed validation/scope/reference updates retain photos. **Restore photos as draft** allows explicit location reconfirmation; tasks no longer assigned require the PM to restore access.
- Submission reopens previous human acceptance. Open issues remain prominent until explicit reviewed correction closure. Fresh photos alone cannot close an issue.
- Decisions carry the work revision and update that the reviewer opened. Concurrent edits or newer evidence return 409; the form retains its reason and refreshes current records rather than approving unseen evidence.
- A new approved model invalidates prior task completion, records the change and requires the PM to reconfirm the source task. Old photos cannot complete the new baseline; missing/reassigned source context needs review.
- Account changes clear private in-memory records/photos and hide the former account's draft/outbox. Queued intake includes the capture actor; it cannot be sent as a different account even after token rotation/account changes.

## Verification and limits

Backend tests use two distinct authenticated sessions, real sample IFC import/approval and disposable SQLite/storage. They exercise receipt deduplication, real actor history, correction closure, photo permissions, invalid intake, stale decisions and changed references. Frontend DOM tests walk planning → crew evidence → PM issue → crew correction → PM acceptance across separate mounts with cleared localStorage and API fixtures, checking the shared renderer's color inputs. Native Blob/IndexedDB queue tests cover account boundaries and retry identity. These are not browser or physical-device tests.

The manual shared loop is connected. Live AI/released check policies, original-sheet/detail registration, formal inspections, cross-trade task dependencies, multi-item daily submissions, native companion delivery, physical camera/PWA/assistive acceptance and production hardening remain open. First-time private model loading requires a connection; offline drafts/outbox survive until the app can reconnect, but private 3D viewing is not an offline promise. PostgreSQL migration syntax is portable; PostgreSQL execution was not tested in this run. Project snapshots currently load task history/evidence metadata together; larger production histories need measured pagination/storage tuning.
