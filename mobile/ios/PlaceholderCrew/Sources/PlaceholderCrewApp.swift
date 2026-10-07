import SwiftUI

@main
struct PlaceholderCrewApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
        .onChange(of: phase) { _, now in
            // Retry queued updates when the app returns to the foreground; iOS background sync is not assumed.
            if now == .active { Task { await model.syncAndRefresh() } }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        if model.user == nil {
            LoginView()
        } else {
            TabView {
                NavigationStack { ProjectHomeView() }
                    .tabItem { Label("Site", systemImage: "building.2") }
                NavigationStack { UpdatesView() }
                    .tabItem { Label("Updates", systemImage: "tray.and.arrow.up") }
                    .badge(model.pending.count)
            }
        }
    }
}
