import CrewCore
import SwiftUI

/// My site: the assigned work for this account in the selected project.
struct ProjectHomeView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        List {
            if model.projects.count > 1 {
                Picker("Project", selection: Binding(get: { model.projectID ?? "" },
                                                     set: { model.projectID = $0; Task { await model.refresh() } })) {
                    ForEach(model.projects) { Text($0.name).tag($0.id) }
                }
            }
            if let snap = model.snapshot {
                if !snap.permissions.capture {
                    Label("Your role can view work but not send updates.", systemImage: "lock")
                        .foregroundStyle(Theme.secondary)
                }
                Section {
                    if snap.state.items.isEmpty {
                        Text("No work is assigned to you in this project yet. Your project manager assigns work from the website.")
                            .foregroundStyle(Theme.secondary)
                    }
                    ForEach(sorted(snap.state.items)) { item in
                        NavigationLink(value: item.id) { WorkRow(item: item) }
                    }
                } header: { Text("Work to report") }
            } else {
                HStack { Spacer(); ProgressView("Loading your work…"); Spacer() }
            }
            if let message = model.message {
                Text(message).font(.footnote).foregroundStyle(Theme.secondary)
            }
        }
        .navigationTitle(model.project?.name ?? "My site")
        .navigationDestination(for: String.self) { id in WorkDetailView(workID: id) }
        .refreshable { await model.syncAndRefresh() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Text(model.user?.email ?? "")
                    Button("Sign out", role: .destructive) { model.signOut() }
                } label: { Image(systemName: "person.crop.circle") }
            }
        }
    }

    /// Open issues and requests first, then work not started, then finished work.
    private func sorted(_ items: [CrewItem]) -> [CrewItem] {
        let order = ["issue", "evidence", "review", "none", "ai", "human"]
        return items.sorted { (order.firstIndex(of: $0.status) ?? 9) < (order.firstIndex(of: $1.status) ?? 9) }
    }
}

struct WorkRow: View {
    let item: CrewItem
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.title).font(.headline)
            Text(item.location?.label ?? "Location not set").font(.subheadline).foregroundStyle(Theme.secondary)
            StatusChip(item: item)
        }
        .padding(.vertical, 4)
    }
}
