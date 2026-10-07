import ARKit
import CrewCore
import PhotosUI
import SwiftUI

/// Daily check-in: camera first, say what you did, the AI suggests which work it is, confirm, send, and see
/// the check result live. Nothing is sent until the person confirms the work item and location.
struct CheckInView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss

    enum Step { case photos, details, work, result }
    @State private var step: Step = .photos
    @State private var photos: [Data] = []
    @State private var picks: [PhotosPickerItem] = []
    @State private var camera = false
    @State private var note = ""
    @State private var finished = true
    @State private var measuring = false
    @State private var height: Double?
    @State private var suggested: [String] = []
    @State private var copilot: String?
    @State private var workID = ""
    @State private var confirmed = false
    @State private var busy = false
    @State private var error: String?
    @State private var uploadID: String?
    @State private var queued = false
    @StateObject private var location = LocationProvider()

    private var lidar: Bool { ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) }
    private var items: [CrewItem] { model.snapshot?.state.items ?? [] }
    private var item: CrewItem? { items.first { $0.id == workID } }

    var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .photos: photosStep
                case .details: detailsStep
                case .work: workStep
                case .result: resultStep
                }
            }
            .navigationTitle("Daily check-in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(step == .result ? "Done" : "Cancel") { dismiss() }
                }
            }
            .sheet(isPresented: $camera) { CameraPicker { if let d = ImageUtil.jpeg($0), photos.count < 6 { photos.append(d) } } }
            .fullScreenCover(isPresented: $measuring) {
                HeightMeasureView(lidar: lidar) { value in
                    height = value.map(MeasurementMath.rounded)
                    measuring = false
                }
            }
            .onChange(of: picks) { _, picked in Task { await load(picked) } }
            .onAppear {
                location.request()
                if photos.isEmpty, UIImagePickerController.isSourceTypeAvailable(.camera) { camera = true }
            }
        }
    }

    // MARK: Steps

    private var photosStep: some View {
        VStack(spacing: 16) {
            if photos.isEmpty {
                ContentUnavailableView("Take a photo of today's work", systemImage: "camera",
                                       description: Text("A wide shot of the area and a close-up of the work."))
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 104))], spacing: 8) {
                        ForEach(Array(photos.enumerated()), id: \.offset) { index, data in
                            ZStack(alignment: .topTrailing) {
                                if let image = UIImage(data: data) {
                                    Image(uiImage: image).resizable().scaledToFill().frame(height: 104).clipped()
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                }
                                Button { photos.remove(at: index) } label: {
                                    Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(.white, .black.opacity(0.6))
                                }
                                .accessibilityLabel("Remove photo \(index + 1)")
                            }
                        }
                    }
                    .padding(.horizontal)
                }
            }
            HStack {
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button { camera = true } label: { Label(photos.isEmpty ? "Open camera" : "Add photo", systemImage: "camera.fill") }
                        .buttonStyle(.bordered).disabled(photos.count >= 6)
                }
                PhotosPicker(selection: $picks, maxSelectionCount: max(1, 6 - photos.count), matching: .images) {
                    Label("Library", systemImage: "photo.on.rectangle")
                }
                .buttonStyle(.bordered).disabled(photos.count >= 6)
            }
            primary("Next", disabled: photos.isEmpty) { step = .details }
        }
        .padding(.vertical)
    }

    private var detailsStep: some View {
        Form {
            Section("What did you do?") {
                VoiceNoteField(placeholder: "e.g. Rough-in wiring done for the living room outlet", text: $note)
                Toggle("This work is finished", isOn: $finished)
            }
            Section {
                if let height {
                    HStack {
                        Label(String(format: "%.2f m above floor", height), systemImage: "ruler")
                        Spacer()
                        Button("Remove", role: .destructive) { self.height = nil }
                    }
                } else if ARWorldTrackingConfiguration.isSupported {
                    Button { measuring = true } label: { Label("Measure box height", systemImage: "ruler") }
                }
            } header: { Text("Height (optional)") } footer: {
                Text("Point the phone at the outlet or switch box; it finds the floor by itself.")
            }
            Section {
                Button {
                    Task { await findWork() }
                } label: {
                    HStack { Spacer(); if busy { ProgressView() } else { Text("Next").bold() }; Spacer() }
                }
                .disabled(note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
            }
        }
    }

    private var workStep: some View {
        Form {
            if let copilot { Section { Label(copilot, systemImage: "sparkles").font(.subheadline) } }
            Section("Which work is this?") {
                ForEach(orderedItems) { candidate in
                    Button {
                        workID = candidate.id
                        confirmed = false
                    } label: {
                        HStack {
                            Image(systemName: workID == candidate.id ? "largecircle.fill.circle" : "circle")
                            VStack(alignment: .leading) {
                                Text(candidate.title).foregroundStyle(.primary)
                                Text(candidate.location?.label ?? "").font(.caption).foregroundStyle(Theme.secondary)
                            }
                            Spacer()
                            if suggested.first == candidate.id { Text("Suggested").font(.caption2.bold()).foregroundStyle(Theme.accent) }
                        }
                    }
                }
            }
            if let item {
                Section {
                    Toggle("These photos show \(item.title) at \(item.location?.label ?? "this location").", isOn: $confirmed)
                } footer: { Text("Your claim is not approval. The AI checks the photos and height against the approved model.") }
            }
            if let error { Section { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) } }
            Section {
                Button { Task { await send() } } label: {
                    HStack { Spacer(); if busy { ProgressView() } else { Text("Send check-in").bold() }; Spacer() }
                }
                .disabled(item == nil || !confirmed || busy)
            }
        }
    }

    private var resultStep: some View {
        List {
            if let item {
                Section(item.title) {
                    if queued {
                        Label("Saved on this phone. It will send automatically when you're back online.", systemImage: "iphone")
                    } else if let current = items.first(where: { $0.id == item.id }), current.update == uploadID,
                              let ai = model.snapshot?.latestCheck(for: current)?.ai {
                        AICheckView(ai: ai)
                        if ai.status == "completed" { StatusChip(item: current) }
                    } else {
                        HStack { ProgressView(); Text("Received. Checking your photos against the approved model…") }
                    }
                }
            }
        }
        .task(id: uploadID) {
            // Refresh quickly while the check runs; the app model also polls in the background.
            for _ in 0..<40 where !queued {
                await model.refresh()
                if let current = items.first(where: { $0.id == workID }), current.update == uploadID,
                   let status = model.snapshot?.latestCheck(for: current)?.ai?.status,
                   ["completed", "failed", "superseded"].contains(status) { break }
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }

    // MARK: Actions

    private var orderedItems: [CrewItem] {
        suggested.compactMap { id in items.first { $0.id == id } } + items.filter { !suggested.contains($0.id) }
    }

    private func primary(_ title: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) { Text(title).bold().frame(maxWidth: .infinity).padding(.vertical, 6) }
            .buttonStyle(.borderedProminent).disabled(disabled).padding(.horizontal)
    }

    private func load(_ picked: [PhotosPickerItem]) async {
        for pick in picked where photos.count < 6 {
            if let data = try? await pick.loadTransferable(type: Data.self), let image = UIImage(data: data),
               let jpeg = ImageUtil.jpeg(image) { photos.append(jpeg) }
        }
        picks = []
    }

    private func findWork() async {
        busy = true
        defer { busy = false }
        if model.snapshot == nil { await model.refresh() }
        let result = await model.suggestWork(note: note, photoCount: photos.count, selected: nil)
        suggested = result.ids
        copilot = result.message
        workID = suggested.first ?? ""
        step = .work
    }

    private func send() async {
        guard let item else { return }
        busy = true
        defer { busy = false }
        let device = DeviceInfo(model: UIDevice.current.model, os: "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
                                app: "crew-ios-2", lidar: lidar)
        let fix: GeoFix? = { if case .ready(let fix) = location.state { return fix }; return nil }()
        let measurements = height.map { [CrewCore.Measurement(value_m: $0, uncertainty_m: MeasurementMath.nominalUncertainty(lidar: lidar),
                                                               method: lidar ? "arkit_lidar" : "arkit_camera")] } ?? []
        do {
            uploadID = try await model.submit(item: item, note: note.trimmingCharacters(in: .whitespacesAndNewlines),
                                              claim: finished ? "Reported complete" : "", photos: photos,
                                              capture: CaptureMetadata(measurements: measurements, location: fix, device: device))
            queued = uploadID == nil
            step = .result
        } catch {
            self.error = "Couldn't save the check-in on this phone: \(error.localizedDescription)"
        }
    }
}
