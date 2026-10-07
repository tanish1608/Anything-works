import CrewCore
import SwiftUI

struct WorkDetailView: View {
    @EnvironmentObject var model: AppModel
    let workID: String
    @State private var capturing = false

    var item: CrewItem? { model.snapshot?.state.items.first { $0.id == workID } }

    var body: some View {
        if let item {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        StatusChip(item: item)
                        Text(item.location?.label ?? "").foregroundStyle(Theme.secondary)
                        if let due = item.due { Text("Due \(due)").font(.footnote) }
                    }
                }
                if let detail = item.detail, !detail.isEmpty {
                    Section("What needs to happen") { Text(detail) }
                }
                if let guidance = item.captureGuidance, !guidance.isEmpty {
                    Section("Photos to take") { Label(guidance, systemImage: "camera.viewfinder") }
                }
                if let job = model.snapshot?.latestCheck(for: item), let ai = job.ai {
                    Section("AI check") { BeaverSays { AICheckView(ai: ai) } }
                }
                Section("History") {
                    ForEach(model.snapshot?.state.events.filter { $0.item == workID }.prefix(8) ?? []) { event in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.text).font(.subheadline)
                            Text("\(event.actor) · \(event.at.prefix(16).replacingOccurrences(of: "T", with: " "))")
                                .font(.caption).foregroundStyle(Theme.secondary)
                        }
                    }
                }
            }
            .navigationTitle(item.title)
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) {
                if model.snapshot?.permissions.capture == true {
                    Button { capturing = true } label: {
                        Label(item.issue != nil ? "Send correction photos" : "Add daily update", systemImage: "camera.fill")
                            .frame(maxWidth: .infinity).padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .padding()
                    .background(.ultraThinMaterial)
                }
            }
            .sheet(isPresented: $capturing) { CaptureView(item: item) }
            .refreshable { await model.refresh() }
        } else {
            ContentUnavailableView("Work not available", systemImage: "questionmark.folder",
                                   description: Text("It may have been reassigned. Pull to refresh."))
        }
    }
}

struct AICheckView: View {
    let ai: AICheck

    var body: some View {
        switch ai.status {
        case "queued", "running":
            HStack { ProgressView(); Text("Checking your photos against the approved model…") }
        case "failed":
            Label("The AI check couldn't run. Your project manager will review the photos.", systemImage: "exclamationmark.circle")
        default:
            VStack(alignment: .leading, spacing: 8) {
                if ai.applied != nil {
                    Label("Marked AI-checked complete", systemImage: "checkmark.seal.fill").foregroundStyle(.green).bold()
                    Text("Every check passed. This is not inspection approval; your PM can reopen it.")
                        .font(.caption).foregroundStyle(Theme.secondary)
                }
                ForEach(Array(ai.checks.enumerated()), id: \.offset) { _, check in
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(check.check_code == "mounting_height" ? "LiDAR height" : "Photos") · \(label(check.outcome))")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(color(check.outcome))
                        Text(check.observation).font(.subheadline)
                    }
                }
                if ai.applied == nil, let s = ai.suggestion {
                    Text(s.outcome == "insufficient_evidence" ? "Next: send the missing view." :
                         s.outcome == "potential_discrepancy" ? "Next: your PM will review a possible mistake." :
                         "Next: waiting for your project manager.")
                        .font(.footnote).foregroundStyle(Theme.secondary)
                }
            }
        }
    }

    private func label(_ outcome: String) -> String {
        ["pass": "Looks as expected", "potential_discrepancy": "Possible mistake",
         "insufficient_evidence": "Not enough evidence", "unsupported": "Can't be checked"][outcome] ?? outcome
    }

    private func color(_ outcome: String) -> Color {
        outcome == "pass" ? .green : outcome == "potential_discrepancy" ? .red : .orange
    }
}
