# Placeholder Crew — iPhone app

A native SwiftUI app for site teams. Tap **Daily check-in** to log anything you did today (the AI suggests where it is in the model; you confirm), or open assigned work and send an update: photos, an optional AR/LiDAR mounting-height measurement, a GPS fix and a short note. The backend checks it with AI and, if every check passes, marks the work **AI-checked complete** in the shared 3D model (a PM can reopen it). Built October 6, 2026.

## What's here

```
mobile/ios/
  CrewCore/                 Swift package: API contract, file outbox, multipart, measurement maths (+ tests)
  PlaceholderCrew/
    project.yml             XcodeGen spec (the .xcodeproj is generated, not committed)
    Sources/                SwiftUI app: login, my work, work detail, capture, LiDAR measure, updates
    Assets.xcassets/        App icon
```

## Run it

```bash
brew install xcodegen                       # once
cd mobile/ios/PlaceholderCrew && xcodegen   # creates PlaceholderCrew.xcodeproj
open PlaceholderCrew.xcodeproj              # choose your team under Signing, pick your iPhone, Run
```

- **Backend:** `backend/.env` needs `GEMINI_API_KEY` and `AGENT_ENABLED=true`. Start it reachable from the phone: `cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- **Server address in the app:** defaults to the cloud API `https://placeholder-api-826928184760.us-central1.run.app` (see docs/DEPLOY_GCP.md). For a local backend use your Mac's Wi-Fi IP, e.g. `http://192.168.1.20:8000` (`ipconfig getifaddr en0`). Plain HTTP is allowed only for local networks; production needs HTTPS.
- **Accounts:** an existing project member with upload permission, e.g. `electrician@example.com` / `demo-password` on the seeded detailed duplex (`python -m app.seed --duplex`). A PM assigns work from the website first.
- **LiDAR** needs a Pro iPhone/iPad; other iPhones use ARKit camera estimates (less precise, labelled). AR and the camera do not work in the Simulator.

## How a measurement is checked

The crew taps the floor, then the centre of the outlet/switch box. The app sends the vertical distance with a nominal uncertainty (±15 mm LiDAR, ±40 mm camera; **not validated**). The server compares it with the approved model component's centre height above its level, using the project tolerance (default ±50 mm, `measurement_tolerance_m` in project settings): within tolerance → pass; clearly outside → possible mistake; uncertainty too large or borderline → not enough evidence. The AI only judges the photos; numbers are compared by server code.

## Offline and reliability

Each update is written to the phone (Application Support/crew-outbox, scoped to the signed-in account) before any upload. Its client UUID is generated once and reused on every retry, so the server stores it once. Updates are sent on submit, when the app comes to the foreground and on pull-to-refresh; iOS background sync is not assumed. Server refusals (changed model reference, lost access, invalid photo) keep the evidence and show **Needs attention**.

## Tests

```bash
cd mobile/ios/CrewCore && swift test                                   # contract, outbox, multipart, maths
CREW_LIVE_API=http://127.0.0.1:8000 swift test --filter LiveAPITests   # real backend + AI (needs seeded duplex)
cd ../PlaceholderCrew && xcodebuild -scheme PlaceholderCrew -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

## Not done yet

- Not run on a physical iPhone or the Simulator yet (this Mac's CoreSimulator was out of date). Camera, AR measurement and GPS need a device check.
- No 3D model view in the app (SceneKit can't load our GLB layers without an extra library); location is shown as level › room.
- GPS is recorded, not checked (projects have no site geofence yet).
- Measurement accuracy is not validated against a tape/laser; only mounting height is supported.
- Android is not built.
- Cloud deployment (Cloud SQL etc.) is not set up.
