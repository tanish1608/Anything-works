import Foundation

/// Server contracts (see docs/SHARED_DAILY_WORKFLOW.md and docs/AI_CHECKS.md). Unknown fields are ignored.
public struct Tokens: Codable, Equatable, Sendable {
    public var access_token: String
    public var refresh_token: String
    public init(access_token: String, refresh_token: String) {
        self.access_token = access_token
        self.refresh_token = refresh_token
    }
}

public struct User: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var email: String
}

public struct ProjectSummary: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var address: String?
    public var my_role: String?
}

public struct WorkLocation: Codable, Equatable, Sendable {
    public var version: String
    public var building: String?
    public var levelName: String?
    public var roomName: String?
    public var spaceCode: String?
    public var elements: [String]

    public var label: String {
        [levelName, roomName].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " › ")
    }
}

public struct WorkPhoto: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var url: String
    public var name: String?
}

public struct WorkItem: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var trade: String
    public var owner: String?
    public var status: String
    public var progress: String?
    public var review: String?
    public var detail: String?
    public var due: String?
    public var issue: String?
    public var correction: Bool?
    public var update: String?
    public var captureGuidance: String?
    public var location: WorkLocation?
    public var photos: [WorkPhoto]?
    public var serverRevision: Int?

    /// Plain-language status for crews; "ai" is AI-checked, never human acceptance or inspection.
    public var statusLabel: String {
        switch status {
        case "ai": return "AI-checked complete"
        case "human": return "Accepted by PM"
        case "issue": return correction == true ? "Correction sent · awaiting PM" : "Open issue"
        case "review": return "Awaiting review"
        case "evidence": return "More photos requested"
        case "none": return "Not started"
        default: return status.capitalized
        }
    }
}

public struct AICheckResult: Codable, Equatable, Sendable {
    public var check_code: String?
    public var element_id: String
    public var outcome: String
    public var observation: String
    public var limitations: [String]?
}

public struct AISuggestion: Codable, Equatable, Sendable {
    public var outcome: String
    public var decision: String?
    public var reason: String
}

public struct AIApplied: Codable, Equatable, Sendable {
    public var status: String
    public var policy_version: String
}

public struct AICheck: Codable, Equatable, Sendable {
    public var id: String
    public var status: String
    public var checks: [AICheckResult]
    public var suggestion: AISuggestion?
    public var applied: AIApplied?
    public var error: [String: String]?
}

public struct AssessmentJob: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var item: String
    public var update: String
    public var state: String
    public var ai: AICheck?
    public var at: String
}

public struct WorkEvent: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var item: String
    public var at: String
    public var actor: String
    public var text: String
}

public struct WorkspaceState: Codable, Equatable, Sendable {
    public var items: [WorkItem]
    public var events: [WorkEvent]
    public var modelVersion: String?
    public var assessmentJobs: [AssessmentJob]?
}

public struct Permissions: Codable, Equatable, Sendable {
    public var review: Bool
    public var capture: Bool
    public var plan: Bool
}

public struct WorkspaceSnapshot: Codable, Equatable, Sendable {
    public var state: WorkspaceState
    public var user: User
    public var role: String
    public var permissions: Permissions

    /// The newest AI check for a work item's current update.
    public func latestCheck(for item: WorkItem) -> AssessmentJob? {
        state.assessmentJobs?.first { $0.item == item.id && $0.update == item.update }
    }
}

public struct UploadReceipt: Codable, Equatable, Sendable {
    public var upload_id: String
    public var client_uuid: String
    public var received: Bool
    /// Daily check-ins: the work the update was added to (existing or created from the check-in).
    public var work_id: String?
}

/// Phone capture metadata sent with an update (server: app/agent/measurements.py).
public struct Measurement: Codable, Equatable, Sendable {
    public var kind: String = "mounting_height"
    public var value_m: Double
    public var uncertainty_m: Double
    public var method: String
    public var note: String = ""
    public init(value_m: Double, uncertainty_m: Double, method: String, note: String = "") {
        self.value_m = value_m
        self.uncertainty_m = uncertainty_m
        self.method = method
        self.note = note
    }
}

public struct GeoFix: Codable, Equatable, Sendable {
    public var lat: Double
    public var lon: Double
    public var accuracy_m: Double
    public var at: Date
    public init(lat: Double, lon: Double, accuracy_m: Double, at: Date) {
        self.lat = lat
        self.lon = lon
        self.accuracy_m = accuracy_m
        self.at = at
    }
}

public struct DeviceInfo: Codable, Equatable, Sendable {
    public var model: String
    public var os: String
    public var app: String
    public var lidar: Bool
    public init(model: String, os: String, app: String, lidar: Bool) {
        self.model = model
        self.os = os
        self.app = app
        self.lidar = lidar
    }
}

public struct CaptureMetadata: Codable, Equatable, Sendable {
    public var measurements: [Measurement] = []
    public var location: GeoFix?
    public var device: DeviceInfo?
    public init(measurements: [Measurement] = [], location: GeoFix? = nil, device: DeviceInfo? = nil) {
        self.measurements = measurements
        self.location = location
        self.device = device
    }
}

public enum JSON {
    public static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return e
    }()
    public static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}

/// Project Copilot answer (POST /api/projects/{id}/copilot/chat). `work_ids` are validated server-side.
public struct CopilotReply: Codable, Equatable, Sendable {
    public var status: String
    public var message: String
    public var work_ids: [String]
}

/// A model component the signed-in person may log a daily check-in on (GET /checkins/catalog).
public struct CatalogComponent: Codable, Equatable, Sendable, Identifiable, Hashable {
    public var id: String { element_id }
    public var element_id: String
    public var name: String
    public var ifc_class: String
    public var trade: String
    public var work_id: String?
    public var work_title: String?
    public var work_status: String?
    public var other_crew: Bool
}

public struct CatalogRoom: Codable, Equatable, Sendable, Identifiable, Hashable {
    public var id: String { zone_id }
    public var zone_id: String
    public var name: String
    public var code: String
    public var level: String
    public var components: [CatalogComponent]
    public var label: String { "\(level) › \(name)" + (code.isEmpty ? "" : " (\(code))") }
}

public struct CheckinCatalog: Codable, Equatable, Sendable {
    public var model_version_id: String?
    public var rooms: [CatalogRoom]
}

/// AI location suggestion for a check-in: one component, its room, and how many of that type are in the room.
public struct LocationSuggestion: Codable, Equatable, Sendable, Identifiable, Hashable {
    public var id: String { element_id }
    public var element_id: String
    public var name: String
    public var trade: String
    public var work_id: String?
    public var work_title: String?
    public var other_crew: Bool
    public var zone_id: String
    public var room: String
    public var code: String?
    public var level: String
    public var instances: Int
    public var label: String { "\(level) › \(room)" + ((code ?? "").isEmpty ? "" : " (\(code!))") }
}

public struct LocateResult: Codable, Equatable, Sendable {
    public var status: String
    public var message: String?
    public var title: String?
    public var suggestions: [LocationSuggestion]
    public var model_version_id: String?
}
