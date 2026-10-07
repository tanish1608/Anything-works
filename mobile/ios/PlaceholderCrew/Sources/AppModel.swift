import CrewCore
import Foundation
import SwiftUI

typealias CrewItem = CrewCore.WorkItem

@MainActor
final class AppModel: ObservableObject {
    @Published var user: User?
    @Published var projects: [ProjectSummary] = []
    @Published var projectID: String? { didSet { UserDefaults.standard.set(projectID, forKey: "projectID") } }
    @Published var snapshot: WorkspaceSnapshot?
    @Published var pending: [PendingUpdate] = []
    @Published var message: String?
    @Published var loading = false
    @AppStorage("serverURL") var serverURL = "https://placeholder-api-826928184760.us-central1.run.app"

    let outbox = Outbox.standard()
    private(set) lazy var client = APIClient(baseURL: URL(string: serverURL) ?? URL(string: "http://127.0.0.1:8000")!,
                                             tokens: KeychainTokenStore())
    private var poll: Task<Void, Never>?

    init() {
        projectID = UserDefaults.standard.string(forKey: "projectID")
        Task { await restore() }
    }

    var project: ProjectSummary? { projects.first { $0.id == projectID } }

    private func restore() async {
        guard client.isSignedIn else { return }
        do {
            user = try await client.me()
            await loadProjects()
        } catch {
            client.signOut()
        }
    }

    func signIn(email: String, password: String) async {
        loading = true
        defer { loading = false }
        client.baseURL = URL(string: serverURL.trimmingCharacters(in: .whitespaces)) ?? client.baseURL
        do {
            user = try await client.login(email: email, password: password)
            message = nil
            await loadProjects()
        } catch {
            message = (error as? APIError)?.message ?? "Couldn't reach \(serverURL). Check the server address and Wi-Fi."
        }
    }

    func signOut() {
        poll?.cancel()
        client.signOut()
        user = nil
        snapshot = nil
        projects = []
        pending = []  // queued updates stay on the device, locked to their original account
    }

    func loadProjects() async {
        do {
            projects = try await client.projects()
            if project == nil { projectID = projects.first?.id }
            await syncAndRefresh()
        } catch {
            message = (error as? APIError)?.message ?? "Couldn't load projects."
        }
    }

    func refresh() async {
        guard let projectID else { return }
        do {
            snapshot = try await client.workspace(projectID)
        } catch {
            message = (error as? APIError)?.message ?? "Offline: showing the last loaded work."
        }
    }

    /// Send anything queued for this account, then reload the shared work records.
    func syncAndRefresh() async {
        guard let user else { return }
        let result = await OutboxSync.run(outbox: outbox, client: client, actorID: user.id)
        pending = outbox.pending(actorID: user.id)
        if result.sent > 0 { message = "\(result.sent) update(s) received by the server." }
        await refresh()
    }

    /// Save on the device first, then try to send. Returns the server upload ID when it was received now
    /// (nil means it is queued on this phone). Watches for the AI check result for a couple of minutes.
    @discardableResult
    func submit(item: CrewItem, note: String, claim: String, photos: [Data], capture: CaptureMetadata) async throws -> String? {
        guard let user, let projectID, let version = item.location?.version else { return nil }
        let update = PendingUpdate(actorID: user.id, projectID: projectID, workID: item.id, workTitle: item.title,
                                   modelVersionID: version, note: note, claim: claim, capture: capture, photoFiles: [])
        try outbox.add(update, photos: photos)
        pending = outbox.pending(actorID: user.id)
        let result = await OutboxSync.run(outbox: outbox, client: client, actorID: user.id)
        pending = outbox.pending(actorID: user.id)
        await refresh()
        poll?.cancel()
        poll = Task { [weak self] in
            for _ in 0..<24 {
                try? await Task.sleep(for: .seconds(5))
                guard let self, !Task.isCancelled else { return }
                await self.refresh()
                if let current = self.snapshot?.state.items.first(where: { $0.id == item.id }),
                   let job = self.snapshot?.latestCheck(for: current), ["completed", "failed", "superseded"].contains(job.ai?.status ?? "") {
                    return
                }
            }
        }
        return result.receipts[update.clientUUID]
    }

    /// Work this person can send photos for, best AI suggestion first. Falls back to all assigned work.
    func suggestWork(note: String, photoCount: Int, selected: String?) async -> (ids: [String], message: String?) {
        guard let projectID, let items = snapshot?.state.items, snapshot?.permissions.capture == true else { return ([], nil) }
        let valid = Set(items.map(\.id))
        do {
            let reply = try await client.suggestWork(projectID: projectID, note: note, attachments: photoCount, selected: selected)
            return (reply.work_ids.filter { valid.contains($0) }, reply.status == "available" ? reply.message : nil)
        } catch {
            return ([], nil)
        }
    }

    func discard(_ update: PendingUpdate) {
        outbox.remove(update)
        pending = outbox.pending(actorID: user?.id ?? "")
    }

    func retry(_ update: PendingUpdate) async {
        var u = update
        u.state = .queued
        u.lastError = nil
        try? outbox.save(u)
        await syncAndRefresh()
    }
}
