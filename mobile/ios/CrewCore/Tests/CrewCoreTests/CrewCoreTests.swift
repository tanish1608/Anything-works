import XCTest
@testable import CrewCore

/// URLProtocol stub standing in for the backend.
final class StubProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, Data))?
    nonisolated(unsafe) static var requests: [URLRequest] = []
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        var req = request
        if req.httpBody == nil, let stream = req.httpBodyStream {
            stream.open(); var data = Data(); var buf = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable { let n = stream.read(&buf, maxLength: buf.count); if n <= 0 { break }; data.append(buf, count: n) }
            stream.close(); req.httpBody = data
        }
        StubProtocol.requests.append(req)
        guard let (status, data) = StubProtocol.handler?(req) else {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)); return
        }
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: req.url!, statusCode: status, httpVersion: nil, headerFields: nil)!,
                            cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

final class CrewCoreTests: XCTestCase {
    var dir: URL!
    var client: APIClient!

    override func setUp() {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        client = APIClient(baseURL: URL(string: "http://test.local:8000")!,
                           tokens: MemoryTokenStore(Tokens(access_token: "a", refresh_token: "r")),
                           session: URLSession(configuration: config))
        StubProtocol.requests = []
        StubProtocol.handler = nil
    }

    func update(_ outbox: Outbox, actor: String = "crew") throws -> PendingUpdate {
        let capture = CaptureMetadata(measurements: [Measurement(value_m: 0.452, uncertainty_m: 0.015, method: "arkit_lidar")],
                                      location: GeoFix(lat: 40.7, lon: -74, accuracy_m: 6, at: Date(timeIntervalSince1970: 0)),
                                      device: DeviceInfo(model: "iPhone", os: "iOS", app: "crew", lidar: true))
        let u = PendingUpdate(actorID: actor, projectID: "p", workID: "WORK-1", workTitle: "Outlet", modelVersionID: "v1",
                              note: "Rough-in done", claim: "", capture: capture, photoFiles: [])
        return try outbox.add(u, photos: [Data([0xFF, 0xD8, 0xFF])])
    }

    func testMountingHeightUsesVerticalDistanceOnly() {
        XCTAssertEqual(MeasurementMath.mountingHeight(floor: [0, -1.2, 0], device: [3, -0.75, -2]), 0.45, accuracy: 1e-9)
        XCTAssertEqual(MeasurementMath.rounded(0.45678), 0.457)
        XCTAssertLessThan(MeasurementMath.nominalUncertainty(lidar: true), MeasurementMath.nominalUncertainty(lidar: false))
    }

    func testOutboxSurvivesReloadAndIsScopedToTheAccount() throws {
        let u = try update(Outbox(root: dir))
        let reopened = Outbox(root: dir)
        XCTAssertEqual(reopened.pending(actorID: "crew").map(\.clientUUID), [u.clientUUID])
        XCTAssertEqual(reopened.pending(actorID: "someone-else"), [])
        XCTAssertEqual(try reopened.photos(of: u), [Data([0xFF, 0xD8, 0xFF])])
    }

    func testSubmitSendsTheSharedWorkContractWithCaptureMetadata() async throws {
        let outbox = Outbox(root: dir)
        let u = try update(outbox)
        StubProtocol.handler = { _ in (201, Data(#"{"upload_id":"up1","client_uuid":"\#(u.clientUUID)","received":true}"#.utf8)) }
        let result = await OutboxSync.run(outbox: outbox, client: client, actorID: "crew")
        XCTAssertEqual(result.sent, 1)
        XCTAssertEqual(result.receipts[u.clientUUID], "up1")
        XCTAssertEqual(outbox.pending(actorID: "crew"), [])
        let req = try XCTUnwrap(StubProtocol.requests.first)
        XCTAssertEqual(req.url?.path, "/api/work/WORK-1/updates")
        XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer a")
        let body = String(decoding: req.httpBody ?? Data(), as: UTF8.self)
        for expected in ["name=\"client_uuid\"\r\n\r\n\(u.clientUUID)", "name=\"captured_by\"\r\n\r\ncrew",
                         "name=\"confirmed\"\r\n\r\ntrue", "\"kind\":\"mounting_height\"", "\"value_m\":0.452",
                         "\"lat\":40.7", "filename=\"photo-1.jpg\""] {
            XCTAssertTrue(body.contains(expected), "missing \(expected)")
        }
    }

    func testOfflineRetryKeepsTheSameIdentityAndRefusalsNeedAttention() async throws {
        let outbox = Outbox(root: dir)
        let u = try update(outbox)
        StubProtocol.handler = nil  // offline
        _ = await OutboxSync.run(outbox: outbox, client: client, actorID: "crew")
        var pending = outbox.pending(actorID: "crew")
        XCTAssertEqual(pending.map(\.clientUUID), [u.clientUUID])
        XCTAssertEqual(pending.first?.state, .queued)
        XCTAssertEqual(pending.first?.attempts, 1)
        StubProtocol.handler = { _ in (409, Data(#"{"detail":"Capture reference changed. Reconfirm against the current model before resubmitting."}"#.utf8)) }
        let result = await OutboxSync.run(outbox: outbox, client: client, actorID: "crew")
        XCTAssertEqual(result.attention, 1)
        pending = outbox.pending(actorID: "crew")
        XCTAssertEqual(pending.first?.state, .needsAttention)
        XCTAssertTrue(pending.first?.lastError?.contains("Reconfirm") == true)
        XCTAssertEqual(try outbox.photos(of: pending[0]).count, 1)  // evidence kept
    }

    func testSuggestWorkAsksTheCopilotWithAttachmentsAndReturnsValidatedIDs() async throws {
        StubProtocol.handler = { _ in (200, Data(#"{"input_revision":"x","status":"available","message":"Looks like the outlet","suggested_questions":[],"work_ids":["WORK-1"],"sources":[],"partial_context":true}"#.utf8)) }
        let reply = try await client.suggestWork(projectID: "p", note: "outlet done", attachments: 2)
        XCTAssertEqual(reply.work_ids, ["WORK-1"])
        let req = try XCTUnwrap(StubProtocol.requests.last)
        XCTAssertEqual(req.url?.path, "/api/projects/p/copilot/chat")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: req.httpBody ?? Data()) as? [String: Any])
        XCTAssertEqual(body["attachments"] as? Int, 2)
        XCTAssertEqual(body["message"] as? String, "outlet done")
    }

    func testCheckInPostsToTheCheckinEndpointWithTheComponentAndLearnsTheWork() async throws {
        let outbox = Outbox(root: dir)
        let u = try outbox.add(PendingUpdate.checkIn(actorID: "crew", projectID: "p", elementID: "sink-1", title: "Kitchen sink — drain",
                                                     modelVersionID: "v1", note: "Drain connected", claim: "",
                                                     capture: CaptureMetadata()), photos: [Data([1])])
        StubProtocol.handler = { _ in (201, Data(#"{"upload_id":"up9","client_uuid":"\#(u.clientUUID)","received":true,"work_id":"CHK-1"}"#.utf8)) }
        let result = await OutboxSync.run(outbox: outbox, client: client, actorID: "crew")
        XCTAssertEqual(result.works[u.clientUUID], "CHK-1")
        let req = try XCTUnwrap(StubProtocol.requests.last)
        XCTAssertEqual(req.url?.path, "/api/projects/p/checkins")
        let body = String(decoding: req.httpBody ?? Data(), as: UTF8.self)
        XCTAssertTrue(body.contains("name=\"element_id\"\r\n\r\nsink-1"))
        XCTAssertTrue(body.contains("Kitchen sink — drain"))
    }

    func testLocateDecodesSuggestions() async throws {
        StubProtocol.handler = { _ in (200, Data(#"{"status":"available","message":"Sink drain","title":"Kitchen sink — drain","model_version_id":"v1","suggestions":[{"element_id":"s1","name":"Sink - Island - Single","ifc_class":"IfcFlowTerminal","trade":"plumbing","work_id":null,"work_title":null,"work_status":null,"other_crew":false,"zone_id":"z","room":"Kitchen","code":"A103","level":"Level 1","instances":1}]}"#.utf8)) }
        let result = try await client.locate(projectID: "p", note: "sink", previews: [Data([1])])
        XCTAssertEqual(result.suggestions.first?.label, "Level 1 › Kitchen (A103)")
        XCTAssertEqual(StubProtocol.requests.last?.url?.path, "/api/projects/p/checkins/locate")
    }

    func testConcurrentExpiredRequestsShareOneRefresh() async throws {
        let refreshes = NSLock()
        nonisolated(unsafe) var refreshCount = 0
        StubProtocol.handler = { req in
            if req.url?.path == "/api/auth/refresh" {
                refreshes.lock(); refreshCount += 1; refreshes.unlock()
                Thread.sleep(forTimeInterval: 0.05)
                return (200, Data(#"{"access_token":"b","refresh_token":"r2"}"#.utf8))
            }
            if req.value(forHTTPHeaderField: "Authorization") == "Bearer b" {
                return (200, Data(#"{"id":"u","name":"U","email":"u@x.com"}"#.utf8))
            }
            return (401, Data(#"{"detail":"Not authenticated"}"#.utf8))
        }
        async let a = client.me()
        async let b = client.me()
        async let c = client.me()
        let users = try await [a, b, c]
        XCTAssertEqual(users.map(\.id), ["u", "u", "u"])
        XCTAssertEqual(refreshCount, 1)  // a second refresh with the same token would revoke the session
    }

    func testWorkspaceDecodesTheServerSnapshotAndLatestAICheck() throws {
        let json = #"""
        {"state":{"version":1,"items":[{"id":"WORK-1","title":"Living room outlet","trade":"electrical","owner":"Elle",
          "status":"ai","progress":"AI-checked complete","update":"up1","serverRevision":3,"extra":1,
          "location":{"version":"v1","levelName":"Level 1","roomName":"Living Room","elements":["e1"],"anchor":[0,0,0]}}],
          "events":[{"id":"1","item":"WORK-1","at":"2026-10-06T10:00:00","actor":"Placeholder AI · suggestion","text":"AI-checked complete","tone":"ai"}],
          "assessmentJobs":[{"id":"r","item":"WORK-1","update":"up1","state":"ai_suggested","at":"x","ai":{"id":"a","status":"completed",
            "checks":[{"check_code":"mounting_height","element_id":"e1","outcome":"pass","observation":"Measured 0.452 m"}],
            "suggestion":{"outcome":"pass","decision":"accept","reason":"ok"},"applied":{"status":"ai","policy_version":"ai-complete-v1"}}}]},
         "user":{"id":"crew","name":"Elle","email":"e@x.com"},"role":"trade","permissions":{"review":false,"capture":true,"plan":false}}
        """#
        let snap = try JSON.decoder.decode(WorkspaceSnapshot.self, from: Data(json.utf8))
        let item = snap.state.items[0]
        XCTAssertEqual(item.statusLabel, "AI-checked complete")
        XCTAssertEqual(item.location?.label, "Level 1 › Living Room")
        XCTAssertEqual(snap.latestCheck(for: item)?.ai?.applied?.status, "ai")
    }
}
