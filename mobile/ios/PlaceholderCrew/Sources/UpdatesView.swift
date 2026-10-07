import CrewCore
import SwiftUI

/// Updates on this phone that the server hasn't confirmed, plus recent server history for my work.
struct UpdatesView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        List {
            Section {
                if model.pending.isEmpty {
                    Label("Nothing waiting. Every update was received by the server.", systemImage: "checkmark.circle")
                        .foregroundStyle(Theme.secondary)
                }
                ForEach(model.pending) { update in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(update.workTitle).font(.headline)
                        Text(update.note).font(.subheadline).lineLimit(2)
                        Label(label(update), systemImage: update.state == .needsAttention ? "exclamationmark.triangle" : "iphone")
                            .font(.caption).foregroundStyle(update.state == .needsAttention ? .orange : Theme.secondary)
                        if let error = update.lastError { Text(error).font(.caption).foregroundStyle(.orange) }
                        HStack {
                            Button("Retry") { Task { await model.retry(update) } }
                            Spacer()
                            Button("Discard", role: .destructive) { model.discard(update) }
                        }
                        .buttonStyle(.borderless).font(.footnote)
                    }
                }
            } header: { Text("On this phone") } footer: {
                Text("Updates stay here until the server confirms them. They are sent when you open the app or pull to refresh.")
            }
            Section("Recent activity") {
                ForEach(model.snapshot?.state.events.prefix(20) ?? []) { event in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.snapshot?.state.items.first { $0.id == event.item }?.title ?? event.item).font(.subheadline.bold())
                        Text(event.text).font(.subheadline)
                        Text("\(event.actor) · \(event.at.prefix(16).replacingOccurrences(of: "T", with: " "))")
                            .font(.caption).foregroundStyle(Theme.secondary)
                    }
                }
            }
        }
        .navigationTitle("Updates")
        .refreshable { await model.syncAndRefresh() }
    }

    private func label(_ u: PendingUpdate) -> String {
        switch u.state {
        case .queued: return u.attempts > 0 ? "Queued on this device · will retry" : "Queued on this device"
        case .uploading: return "Uploading…"
        case .needsAttention: return "Needs attention"
        }
    }
}
