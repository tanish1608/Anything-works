import Foundation

public protocol TokenStore: AnyObject, Sendable {
    func load() -> Tokens?
    func save(_ tokens: Tokens?)
}

public final class MemoryTokenStore: TokenStore, @unchecked Sendable {
    private var tokens: Tokens?
    public init(_ tokens: Tokens? = nil) { self.tokens = tokens }
    public func load() -> Tokens? { tokens }
    public func save(_ tokens: Tokens?) { self.tokens = tokens }
}

public struct APIError: Error, LocalizedError, Equatable {
    public var status: Int
    public var message: String
    public var errorDescription: String? { message }

    /// A refusal the crew must act on (changed reference, scope, invalid photo); retrying won't help.
    public var needsAttention: Bool { [400, 403, 404, 409, 413, 422].contains(status) }
}

/// Bearer-token client for the Placeholder AI backend. Refreshes once on 401, never puts tokens in URLs.
public final class APIClient: @unchecked Sendable {
    public var baseURL: URL
    private let session: URLSession
    private let tokens: TokenStore

    public init(baseURL: URL, tokens: TokenStore, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokens = tokens
        self.session = session
    }

    public var isSignedIn: Bool { tokens.load() != nil }

    public func signOut() { tokens.save(nil) }

    private func url(_ path: String) -> URL {
        URL(string: "/api" + path, relativeTo: baseURL)!.absoluteURL
    }

    private func send(_ request: URLRequest, authorized: Bool = true, retry: Bool = true) async throws -> Data {
        var req = request
        if authorized, let t = tokens.load() { req.setValue("Bearer \(t.access_token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401, authorized, retry, try await refresh() {
            return try await send(request, authorized: authorized, retry: false)
        }
        guard (200..<300).contains(status) else {
            let detail = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["detail"]
            let message = (detail as? String) ?? ((detail as? [String: Any])?["message"] as? String)
                ?? HTTPURLResponse.localizedString(forStatusCode: status).capitalized
            if status == 401 { tokens.save(nil) }
            throw APIError(status: status, message: message)
        }
        return data
    }

    private func json<T: Decodable>(_ method: String, _ path: String, body: Encodable? = nil,
                                    authorized: Bool = true) async throws -> T {
        var req = URLRequest(url: url(path))
        req.httpMethod = method
        if let body {
            req.httpBody = try JSON.encoder.encode(AnyEncodable(body))
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try JSON.decoder.decode(T.self, from: try await send(req, authorized: authorized))
    }

    private func refresh() async throws -> Bool {
        guard let t = tokens.load() else { return false }
        var req = URLRequest(url: url("/auth/refresh"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSON.encoder.encode(["refresh_token": t.refresh_token])
        guard let (data, response) = try? await session.data(for: req),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let fresh = try? JSON.decoder.decode(Tokens.self, from: data) else {
            tokens.save(nil)
            return false
        }
        tokens.save(fresh)
        return true
    }

    // MARK: Endpoints

    public func login(email: String, password: String) async throws -> User {
        let t: Tokens = try await json("POST", "/auth/login", body: ["email": email, "password": password], authorized: false)
        tokens.save(t)
        return try await me()
    }

    public func me() async throws -> User { try await json("GET", "/auth/me") }

    public func projects() async throws -> [ProjectSummary] { try await json("GET", "/projects") }

    public func workspace(_ projectID: String) async throws -> WorkspaceSnapshot {
        try await json("GET", "/projects/\(projectID)/workspace")
    }

    /// Ask the project copilot which assigned work these photos belong to. Suggestions only; the person confirms.
    public func suggestWork(projectID: String, note: String, attachments: Int, selected: String? = nil) async throws -> CopilotReply {
        var body: [String: AnyCodable] = ["input_revision": .string(UUID().uuidString), "page": .string("capture"),
                                          "message": .string(note.isEmpty ? "Photos of today's work." : note),
                                          "attachments": .int(max(0, min(6, attachments)))]
        if let selected { body["selected_work_id"] = .string(selected) }
        return try await json("POST", "/projects/\(projectID)/copilot/chat", body: body)
    }

    public func checkinCatalog(projectID: String) async throws -> CheckinCatalog {
        try await json("GET", "/projects/\(projectID)/checkins/catalog")
    }

    /// Where is this? AI suggestions from the note and up to three small preview photos. Never records anything.
    public func locate(projectID: String, note: String, previews: [Data]) async throws -> LocateResult {
        var form = MultipartForm()
        form.field("note", note)
        for (index, data) in previews.prefix(3).enumerated() {
            form.file("files", filename: "preview-\(index + 1).jpg", mime: "image/jpeg", data: data)
        }
        var req = URLRequest(url: url("/projects/\(projectID)/checkins/locate"))
        req.httpMethod = "POST"
        req.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
        req.httpBody = form.finished()
        req.timeoutInterval = 60
        return try JSON.decoder.decode(LocateResult.self, from: try await send(req))
    }

    public func photo(_ id: String) async throws -> Data {
        try await send(URLRequest(url: url("/photos/\(id)?thumb=1")))
    }

    /// POST /api/work/{id}/updates. Same client UUID on every retry; the response is a receipt, not approval.
    public func submit(_ update: PendingUpdate, photos: [Data]) async throws -> UploadReceipt {
        var form = MultipartForm()
        form.field("client_uuid", update.clientUUID)
        form.field("captured_by", update.actorID)
        form.field("model_version_id", update.modelVersionID)
        form.field("confirmed", "true")
        form.field("note", update.note)
        form.field("claim", update.claim)
        form.field("captured_at", ISO8601DateFormatter().string(from: update.capturedAt))
        form.field("capture", String(decoding: try JSON.encoder.encode(update.capture), as: UTF8.self))
        for (index, data) in photos.enumerated() {
            form.file("files", filename: "photo-\(index + 1).jpg", mime: "image/jpeg", data: data)
        }
        if let element = update.elementID, update.workID.isEmpty {
            form.field("element_id", element)
            form.field("title", update.title ?? "")
        }
        let path = update.elementID != nil && update.workID.isEmpty
            ? "/projects/\(update.projectID)/checkins" : "/work/\(update.workID)/updates"
        var req = URLRequest(url: url(path))
        req.httpMethod = "POST"
        req.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
        req.httpBody = form.finished()
        req.timeoutInterval = 120
        return try JSON.decoder.decode(UploadReceipt.self, from: try await send(req))
    }
}

public struct SyncResult: Equatable, Sendable {
    public var sent = 0
    public var attention = 0
    /// client UUID -> server upload ID for updates confirmed in this run.
    public var receipts: [String: String] = [:]
    /// client UUID -> work ID (daily check-ins learn it from the server).
    public var works: [String: String] = [:]
}

/// Sends queued updates for one account. Server refusals keep the evidence and ask the person to act.
public enum OutboxSync {
    @discardableResult
    public static func run(outbox: Outbox, client: APIClient, actorID: String) async -> SyncResult {
        var result = SyncResult()
        for var update in outbox.pending(actorID: actorID) where update.state != .needsAttention {
            update.state = .uploading
            try? outbox.save(update)
            do {
                let receipt = try await client.submit(update, photos: try outbox.photos(of: update))
                guard receipt.client_uuid == update.clientUUID else { throw APIError(status: 409, message: "Receipt mismatch") }
                outbox.remove(update)
                result.sent += 1
                result.receipts[update.clientUUID] = receipt.upload_id
                result.works[update.clientUUID] = receipt.work_id ?? update.workID
            } catch let error as APIError where error.needsAttention {
                update.state = .needsAttention
                update.lastError = error.message
                try? outbox.save(update)
                result.attention += 1
            } catch {
                update.state = .queued
                update.attempts += 1
                update.lastError = (error as? APIError)?.message ?? "Not sent yet: no connection to the server."
                try? outbox.save(update)
            }
        }
        return result
    }
}

private struct AnyEncodable: Encodable {
    let value: Encodable
    init(_ value: Encodable) { self.value = value }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}

/// Minimal JSON value for request bodies with mixed types.
public enum AnyCodable: Encodable, Sendable {
    case string(String), int(Int)
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .int(let v): try c.encode(v)
        }
    }
}
