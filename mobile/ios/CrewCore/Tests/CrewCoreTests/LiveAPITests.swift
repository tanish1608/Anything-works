import XCTest
@testable import CrewCore

/// Runs only with CREW_LIVE_API set (e.g. http://127.0.0.1:8000) against a backend seeded with the detailed duplex.
/// Submits a real photo and LiDAR-style measurement for a work item and waits for the AI check.
final class LiveAPITests: XCTestCase {
    func testCrewUpdateReachesTheServerAndGetsAnAICheck() async throws {
        guard let base = ProcessInfo.processInfo.environment["CREW_LIVE_API"], let url = URL(string: base) else {
            throw XCTSkip("Set CREW_LIVE_API to run against a live backend")
        }
        let env = ProcessInfo.processInfo.environment
        let client = APIClient(baseURL: url, tokens: MemoryTokenStore())
        let user = try await client.login(email: env["CREW_EMAIL"] ?? "electrician@example.com", password: env["CREW_PASSWORD"] ?? "demo-password")
        let projects = try await client.projects()
        let project = try XCTUnwrap(projects.first { $0.name.hasPrefix("Duplex Apartment") })
        let before = try await client.workspace(project.id)
        let work = try XCTUnwrap(before.state.items.first { $0.id == (env["CREW_WORK"] ?? "WORK-BR1-OUTLET") })
        let photo = try Data(contentsOf: URL(fileURLWithPath: env["CREW_PHOTO"] ?? "../../../web/public/design-assets/wall-unit-406.jpg"))
        let height = Double(env["CREW_HEIGHT"] ?? "0.46")!
        let outbox = Outbox(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        try outbox.add(PendingUpdate(actorID: user.id, projectID: project.id, workID: work.id, workTitle: work.title,
                                     modelVersionID: try XCTUnwrap(work.location?.version), note: "Rough-in wiring done (live API test)",
                                     claim: "Reported complete",
                                     capture: CaptureMetadata(measurements: [Measurement(value_m: height, uncertainty_m: 0.015, method: "arkit_lidar")],
                                                              location: GeoFix(lat: 40.0, lon: -75.0, accuracy_m: 10, at: Date()),
                                                              device: DeviceInfo(model: "test", os: "macOS", app: "crew-core-test", lidar: true)),
                                     photoFiles: []), photos: [photo])
        let sent = await OutboxSync.run(outbox: outbox, client: client, actorID: user.id)
        XCTAssertEqual(sent.sent, 1, "\(outbox.pending(actorID: user.id).first?.lastError ?? "")")
        var job: AssessmentJob?
        for _ in 0..<40 {
            let snap = try await client.workspace(project.id)
            let item = try XCTUnwrap(snap.state.items.first { $0.id == work.id })
            job = snap.latestCheck(for: item)
            if let status = job?.ai?.status, ["completed", "failed", "superseded"].contains(status) {
                print("LIVE status:", item.statusLabel)
                for c in job?.ai?.checks ?? [] { print("LIVE check:", c.check_code ?? "", c.outcome, "|", c.observation) }
                print("LIVE applied:", String(describing: job?.ai?.applied))
                break
            }
            try await Task.sleep(for: .seconds(3))
        }
        XCTAssertNotNil(job?.ai, "No AI check: is AGENT_ENABLED=true with a Gemini key?")
    }
}
