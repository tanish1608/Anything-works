import Foundation

/// One daily update saved on the device before any network request. The client UUID is generated once and
/// reused for every retry, so the server stores it at most once.
public struct PendingUpdate: Codable, Equatable, Sendable, Identifiable {
    public enum State: String, Codable, Sendable {
        case queued          // saved on this device, not yet confirmed by the server
        case uploading
        case needsAttention  // the server refused it; evidence is kept until the person decides
    }

    public var id: String { clientUUID }
    public var clientUUID: String
    public var actorID: String
    public var projectID: String
    public var workID: String
    public var workTitle: String
    public var modelVersionID: String
    public var note: String
    public var claim: String
    public var capturedAt: Date
    public var capture: CaptureMetadata
    public var photoFiles: [String]
    public var state: State
    public var lastError: String?
    public var attempts: Int

    public init(actorID: String, projectID: String, workID: String, workTitle: String, modelVersionID: String,
                note: String, claim: String, capturedAt: Date = Date(), capture: CaptureMetadata, photoFiles: [String]) {
        self.clientUUID = UUID().uuidString.lowercased()
        self.actorID = actorID
        self.projectID = projectID
        self.workID = workID
        self.workTitle = workTitle
        self.modelVersionID = modelVersionID
        self.note = note
        self.claim = claim
        self.capturedAt = capturedAt
        self.capture = capture
        self.photoFiles = photoFiles
        self.state = .queued
        self.attempts = 0
    }
}

/// File-backed outbox: each update lives in its own folder with its JPEGs, scoped by account.
public final class Outbox: @unchecked Sendable {
    public let root: URL
    private let fm = FileManager.default
    private let lock = NSLock()

    public init(root: URL) {
        self.root = root
        try? fm.createDirectory(at: root, withIntermediateDirectories: true)
    }

    public static func standard() -> Outbox {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return Outbox(root: base.appendingPathComponent("crew-outbox", isDirectory: true))
    }

    private func folder(_ id: String) -> URL { root.appendingPathComponent(id, isDirectory: true) }

    /// Persist photos and metadata atomically enough for a phone: photos first, the manifest last.
    @discardableResult
    public func add(_ update: PendingUpdate, photos: [Data]) throws -> PendingUpdate {
        lock.lock(); defer { lock.unlock() }
        var u = update
        let dir = folder(u.clientUUID)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        u.photoFiles = try photos.enumerated().map { index, data in
            let name = "photo-\(index + 1).jpg"
            try data.write(to: dir.appendingPathComponent(name), options: .atomic)
            return name
        }
        try JSON.encoder.encode(u).write(to: dir.appendingPathComponent("update.json"), options: .atomic)
        return u
    }

    public func save(_ update: PendingUpdate) throws {
        lock.lock(); defer { lock.unlock() }
        try JSON.encoder.encode(update).write(to: folder(update.clientUUID).appendingPathComponent("update.json"),
                                              options: .atomic)
    }

    /// Updates for one account only; another person on the same phone never sees or sends them.
    public func pending(actorID: String) -> [PendingUpdate] {
        lock.lock(); defer { lock.unlock() }
        let dirs = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        return dirs.compactMap { dir -> PendingUpdate? in
            guard let data = try? Data(contentsOf: dir.appendingPathComponent("update.json")) else { return nil }
            return try? JSON.decoder.decode(PendingUpdate.self, from: data)
        }
        .filter { $0.actorID == actorID }
        .sorted { $0.capturedAt < $1.capturedAt }
    }

    public func photos(of update: PendingUpdate) throws -> [Data] {
        try update.photoFiles.map { try Data(contentsOf: folder(update.clientUUID).appendingPathComponent($0)) }
    }

    public func remove(_ update: PendingUpdate) {
        lock.lock(); defer { lock.unlock() }
        try? fm.removeItem(at: folder(update.clientUUID))
    }
}
