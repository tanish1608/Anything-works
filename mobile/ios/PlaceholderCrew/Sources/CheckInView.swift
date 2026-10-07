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
    @State private var located: LocateResult?
    @State private var target: CheckInTarget?
    @State private var title = ""
    @State private var browsing = false
    @State private var locating = false
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
    private var canSend: Bool {
        target != nil && confirmed && !(target?.otherCrew ?? false) && (target?.workTitle != nil || !title.trimmingCharacters(in: .whitespaces).isEmpty)
    }

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
            if locating {
                Section { BeaverSays { HStack { ProgressView(); Text("Finding where this is…") } } }
            } else if let message = located?.message {
                Section { BeaverSays { Text(message).font(.subheadline) } }
            }
            Section {
                ForEach(located?.suggestions ?? []) { s in
                    let option = CheckInTarget(elementID: s.element_id, name: s.name, place: s.label,
                                               workTitle: s.work_title, otherCrew: s.other_crew)
                    Button { choose(option) } label: {
                        HStack {
                            Image(systemName: target?.elementID == s.element_id ? "largecircle.fill.circle" : "circle")
                            VStack(alignment: .leading) {
                                Text(s.name + (s.instances > 1 ? " (\(s.instances) in room)" : "")).foregroundStyle(.primary)
                                Text(s.label).font(.caption).foregroundStyle(Theme.secondary)
                                if let work = s.work_title { Text("Tracked: \(work)").font(.caption).foregroundStyle(Theme.accent) }
                            }
                        }
                    }
                }
                Button { browsing = true } label: { Label("Choose another room or component", systemImage: "building.2") }
                    .disabled(model.catalog == nil)
                    .task { if model.catalog == nil { await model.loadCatalog() } }
            } header: { Text("Where is this?") } footer: {
                if !locating, located?.suggestions.isEmpty ?? true {
                    Text("No confident suggestion. Pick the room, then the fixture or part of the building you worked on.")
                }
            }
            if let target {
                Section {
                    LabeledContent("Logged on", value: "\(target.name) · \(target.place)")
                    if let work = target.workTitle {
                        Text("Adds to tracked work: \(work)").font(.footnote).foregroundStyle(Theme.secondary)
                    } else {
                        TextField("Short title, e.g. Kitchen sink — drain", text: $title)
                    }
                    if target.otherCrew {
                        Label("Another crew tracks this component. Pick a different one or ask your PM.", systemImage: "person.2.slash")
                            .foregroundStyle(.orange)
                    }
                    Toggle("These photos show \(target.name) in \(target.place).", isOn: $confirmed)
                } footer: { Text("Your claim is not approval. The AI checks the photos (and height) against the approved model.") }
            }
            if let error { Section { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) } }
            Section {
                Button { Task { await send() } } label: {
                    HStack { Spacer(); if busy { ProgressView() } else { Text("Send check-in").bold() }; Spacer() }
                }
                .disabled(!canSend || busy)
            }
        }
        .navigationDestination(isPresented: $browsing) {
            if let catalog = model.catalog {
                RoomPicker(catalog: catalog) { picked in
                    choose(picked)
                    browsing = false
                }
            }
        }
    }

    private func choose(_ option: CheckInTarget) {
        target = option
        confirmed = false
        if option.workTitle == nil, title.isEmpty || title == located?.title { title = located?.title ?? option.name }
    }

    private var resultStep: some View {
        List {
            if queued {
                Section(target?.name ?? "Check-in") {
                    Label("Saved on this phone. It will send automatically when you're back online.", systemImage: "iphone")
                }
            } else if let item {
                Section(item.title) {
                    if queued {
                        Label("Saved on this phone. It will send automatically when you're back online.", systemImage: "iphone")
                    } else if let current = items.first(where: { $0.id == item.id }), current.update == uploadID,
                              let ai = model.snapshot?.latestCheck(for: current)?.ai {
                        BeaverSays { AICheckView(ai: ai) }
                        if ai.status == "completed" { StatusChip(item: current) }
                    } else {
                        BeaverSays { HStack { ProgressView(); Text("Got it! Checking your photos against the model…") } }
                    }
                }
            }
        }
        .task(id: uploadID) {
            // Refresh quickly while the check runs; the app model also polls in the background.
            for _ in 0..<40 where !queued && uploadID != nil {
                await model.refresh()
                if let current = items.first(where: { $0.id == workID }), current.update == uploadID,
                   let status = model.snapshot?.latestCheck(for: current)?.ai?.status,
                   ["completed", "failed", "superseded"].contains(status) { break }
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }

    // MARK: Actions

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

    /// Go straight to "Where is this?"; suggestions arrive while the person can already browse rooms.
    private func findWork() async {
        step = .work
        locating = true
        defer { locating = false }
        async let catalogLoad: Void = model.catalog == nil ? model.loadCatalog() : ()
        let result = await model.locate(note: note, photos: photos)
        _ = await catalogLoad
        located = result
        if target == nil, let first = result?.suggestions.first(where: { !$0.other_crew }) {
            choose(CheckInTarget(elementID: first.element_id, name: first.name, place: first.label,
                                 workTitle: first.work_title, otherCrew: first.other_crew))
        }
        if title.isEmpty { title = result?.title ?? "" }
    }

    private func send() async {
        guard let target else { return }
        busy = true
        defer { busy = false }
        let device = DeviceInfo(model: UIDevice.current.model, os: "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
                                app: "crew-ios-3", lidar: lidar)
        let fix: GeoFix? = { if case .ready(let fix) = location.state { return fix }; return nil }()
        let measurements = height.map { [CrewCore.Measurement(value_m: $0, uncertainty_m: MeasurementMath.nominalUncertainty(lidar: lidar),
                                                               method: lidar ? "arkit_lidar" : "arkit_camera")] } ?? []
        do {
            let sent = try await model.submitCheckIn(elementID: target.elementID, title: target.workTitle ?? title.trimmingCharacters(in: .whitespaces),
                                                     note: note.trimmingCharacters(in: .whitespacesAndNewlines),
                                                     claim: finished ? "Reported complete" : "", photos: photos,
                                                     capture: CaptureMetadata(measurements: measurements, location: fix, device: device))
            uploadID = sent.upload
            workID = sent.work ?? ""
            queued = sent.upload == nil
            step = .result
        } catch {
            self.error = "Couldn't save the check-in on this phone: \(error.localizedDescription)"
        }
    }
}
