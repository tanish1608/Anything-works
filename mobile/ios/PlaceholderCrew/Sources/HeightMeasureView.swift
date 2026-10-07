import ARKit
import Combine
import CrewCore
import RealityKit
import SwiftUI

/// One-aim height: ARKit finds the floor by itself; point the crosshair at the box and the height updates live.
struct HeightMeasureView: View {
    let lidar: Bool
    let done: (Double?) -> Void
    @State private var reading: Double?
    @State private var floorFound = false

    var body: some View {
        ZStack {
            HeightARContainer(reading: $reading, floorFound: $floorFound).ignoresSafeArea()
            Image(systemName: "plus.viewfinder").font(.system(size: 44, weight: .light)).foregroundStyle(.white).shadow(radius: 3)
            VStack {
                Text(floorFound ? "Point the crosshair at the centre of the box" : "Point at the floor for a moment so I can find it")
                    .font(.headline).multilineTextAlignment(.center)
                    .padding(12).background(.ultraThinMaterial, in: Capsule()).padding(.top, 16)
                Spacer()
                Text(reading.map { String(format: "%.2f m above floor", $0) } ?? "—")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .padding().background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                Text(lidar ? "LiDAR depth" : "Camera estimate (less precise)").font(.caption).foregroundStyle(.white)
                HStack {
                    Button("Cancel") { done(nil) }.buttonStyle(.bordered)
                    Button("Use this height") { done(reading) }.buttonStyle(.borderedProminent).disabled(reading == nil)
                }
                .padding(.bottom, 28)
            }
        }
    }
}

private struct HeightARContainer: UIViewRepresentable {
    @Binding var reading: Double?
    @Binding var floorFound: Bool

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal, .vertical]
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) { config.sceneReconstruction = .mesh }
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) { config.frameSemantics.insert(.sceneDepth) }
        view.session.run(config)
        context.coordinator.attach(view)
        return view
    }

    func updateUIView(_ view: ARView, context: Context) { context.coordinator.parent = self }
    static func dismantleUIView(_ view: ARView, coordinator: Coordinator) { coordinator.detach(); view.session.pause() }
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    @MainActor
    final class Coordinator {
        var parent: HeightARContainer
        private weak var view: ARView?
        private var updates: Cancellable?
        private var last = Date.distantPast
        private var recent: [Double] = []
        init(_ parent: HeightARContainer) { self.parent = parent }

        func attach(_ view: ARView) {
            self.view = view
            updates = view.scene.subscribe(to: SceneEvents.Update.self) { [weak self] _ in self?.tick() }
        }

        func detach() { updates?.cancel() }

        /// Floor = the plane ARKit classifies as floor (LiDAR phones), else the lowest horizontal plane.
        private func floorY(_ frame: ARFrame) -> Float? {
            let planes = frame.anchors.compactMap { $0 as? ARPlaneAnchor }.filter { $0.alignment == .horizontal }
            let floors = planes.filter { $0.classification == .floor }
            return (floors.isEmpty ? planes : floors).map { $0.transform.columns.3.y }.min()
        }

        private func tick() {
            guard Date().timeIntervalSince(last) > 0.1, let view, let frame = view.session.currentFrame else { return }
            last = Date()
            guard let floor = floorY(frame) else { parent.floorFound = false; parent.reading = nil; return }
            parent.floorFound = true
            let center = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
            guard let hit = view.raycast(from: center, allowing: .estimatedPlane, alignment: .any).first else { return }
            let height = Double(hit.worldTransform.columns.3.y - floor)
            // Light smoothing so the number doesn't flicker while the hand shakes.
            recent = Array((recent + [height]).suffix(6))
            let smoothed = recent.reduce(0, +) / Double(recent.count)
            parent.reading = smoothed > 0.02 ? MeasurementMath.rounded(smoothed) : nil
        }
    }
}
