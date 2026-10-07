import ARKit
import CrewCore
import PhotosUI
import SwiftUI

/// Daily update: photos, an optional LiDAR mounting-height measurement, the GPS fix and a short note.
struct CaptureView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let item: CrewItem

    @State private var photos: [Data] = []
    @State private var picks: [PhotosPickerItem] = []
    @State private var camera = false
    @State private var measuring = false
    @State private var measurement: CrewCore.Measurement?
    @State private var note = ""
    @State private var finished = false
    @State private var confirmed = false
    @State private var sending = false
    @State private var error: String?
    @StateObject private var location = LocationProvider()

    private var lidar: Bool { ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label(item.location?.label ?? "Unknown location", systemImage: "mappin.and.ellipse")
                    if let guidance = item.captureGuidance { Text(guidance).font(.footnote).foregroundStyle(Theme.secondary) }
                } header: { Text(item.title) }

                Section("Photos (\(photos.count)/6)") {
                    if !photos.isEmpty {
                        ScrollView(.horizontal) {
                            HStack {
                                ForEach(Array(photos.enumerated()), id: \.offset) { index, data in
                                    ZStack(alignment: .topTrailing) {
                                        if let image = UIImage(data: data) {
                                            Image(uiImage: image).resizable().scaledToFill().frame(width: 96, height: 96).clipped()
                                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                        }
                                        Button { photos.remove(at: index) } label: {
                                            Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(.white, .black.opacity(0.6))
                                        }
                                        .accessibilityLabel("Remove photo \(index + 1)")
                                    }
                                }
                            }
                        }
                    }
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button { camera = true } label: { Label("Take photo", systemImage: "camera") }.disabled(photos.count >= 6)
                    }
                    PhotosPicker(selection: $picks, maxSelectionCount: max(1, 6 - photos.count), matching: .images) {
                        Label("Choose from library", systemImage: "photo.on.rectangle")
                    }
                    .disabled(photos.count >= 6)
                }

                Section {
                    if let m = measurement {
                        HStack {
                            Label(String(format: "Mounting height %.3f m (±%.0f mm)", m.value_m, m.uncertainty_m * 1000),
                                  systemImage: "ruler")
                            Spacer()
                            Button("Remove", role: .destructive) { measurement = nil }
                        }
                    } else if ARWorldTrackingConfiguration.isSupported {
                        Button { measuring = true } label: {
                            Label(lidar ? "Measure height with LiDAR" : "Measure height with the camera", systemImage: "ruler")
                        }
                    } else {
                        Text("AR measurement isn't available on this device.").foregroundStyle(Theme.secondary)
                    }
                } header: { Text("Measurement (optional)") } footer: {
                    Text("Point the phone at the box; it finds the floor itself. The server compares the height with the approved model; phone measurements are not validated instruments.")
                }

                Section("Location") {
                    switch location.state {
                    case .ready(let fix): Label(String(format: "GPS fix ±%.0f m", fix.accuracy_m), systemImage: "location.fill")
                    case .denied: Label("Location is off. The update can still be sent.", systemImage: "location.slash")
                    case .locating: HStack { ProgressView(); Text("Getting GPS fix…") }
                    }
                }

                Section("What changed today?") {
                    VoiceNoteField(placeholder: "e.g. Rough-in wiring done; box set at the marked height", text: $note)
                    Toggle("I believe this work is finished", isOn: $finished)
                }

                Section {
                    Toggle(isOn: $confirmed) {
                        Text("These photos show \(item.title) at \(item.location?.label ?? "this location").")
                    }
                } footer: {
                    Text("Your claim is not approval. The AI checks the photos and measurement; a project manager can review or reopen.")
                }

                if let error { Section { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) } }
            }
            .navigationTitle(item.issue != nil ? "Correction" : "Daily update")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(sending ? "Sending…" : "Submit") { Task { await submit() } }
                        .disabled(photos.isEmpty || note.trimmingCharacters(in: .whitespaces).isEmpty || !confirmed || sending)
                }
            }
            .onAppear { location.request() }
            .onChange(of: picks) { _, items in Task { await load(items) } }
            .sheet(isPresented: $camera) { CameraPicker { if let data = ImageUtil.jpeg($0) { photos.append(data) } } }
            .fullScreenCover(isPresented: $measuring) {
                HeightMeasureView(lidar: lidar) { value in
                    if let value {
                        measurement = CrewCore.Measurement(value_m: MeasurementMath.rounded(value),
                                                           uncertainty_m: MeasurementMath.nominalUncertainty(lidar: lidar),
                                                           method: lidar ? "arkit_lidar" : "arkit_camera")
                    }
                    measuring = false
                }
            }
        }
    }

    private func load(_ items: [PhotosPickerItem]) async {
        for pick in items where photos.count < 6 {
            if let data = try? await pick.loadTransferable(type: Data.self), let image = UIImage(data: data),
               let jpeg = ImageUtil.jpeg(image) {
                photos.append(jpeg)
            } else {
                error = "One photo couldn't be read. Try another or take a new one."
            }
        }
        picks = []
    }

    private func submit() async {
        sending = true
        defer { sending = false }
        let device = DeviceInfo(model: UIDevice.current.model, os: "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
                                app: "crew-ios-1", lidar: lidar)
        let fix: GeoFix? = { if case .ready(let fix) = location.state { return fix }; return nil }()
        let capture = CaptureMetadata(measurements: measurement.map { [$0] } ?? [], location: fix, device: device)
        do {
            try await model.submit(item: item, note: note.trimmingCharacters(in: .whitespacesAndNewlines),
                                   claim: finished ? "Reported complete" : "", photos: photos, capture: capture)
            dismiss()
        } catch {
            self.error = "Couldn't save the update on this phone: \(error.localizedDescription)"
        }
    }
}

enum ImageUtil {
    /// Upright JPEG, longest edge ≤ 2048 px, to keep uploads small on site connections.
    static func jpeg(_ image: UIImage, maxSide: CGFloat = 2048) -> Data? {
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: 0.85)
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}
