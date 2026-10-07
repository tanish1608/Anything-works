import ARKit
import CrewCore
import RealityKit
import SwiftUI

/// Two taps in AR: the floor, then the centre of the box. Returns the vertical distance in metres.
/// Uses LiDAR scene depth/mesh when the phone has it; otherwise ARKit's camera plane estimates.
struct LiDARMeasureView: View {
    let lidar: Bool
    let done: (Double?) -> Void
    @State private var points: [SIMD3<Float>] = []
    @State private var hint = "Move the phone slowly to scan the floor and wall."

    private var height: Double? {
        guard points.count == 2 else { return nil }
        return MeasurementMath.mountingHeight(floor: SIMD3<Double>(points[0]), device: SIMD3<Double>(points[1]))
    }

    var body: some View {
        ZStack {
            ARMeasureContainer(lidar: lidar, points: $points, hint: $hint).ignoresSafeArea()
            Image(systemName: "plus").font(.title).foregroundStyle(.white).shadow(radius: 2)
            VStack {
                Text(points.isEmpty ? "1. Tap the floor directly below the box" :
                     points.count == 1 ? "2. Tap the centre of the outlet or switch box" : "Measured")
                    .font(.headline).padding(10).background(.ultraThinMaterial, in: Capsule()).padding(.top, 12)
                Text(hint).font(.footnote).padding(8).background(.ultraThinMaterial, in: Capsule())
                Spacer()
                if let height {
                    Text(String(format: "%.3f m", height)).font(.system(size: 44, weight: .bold, design: .rounded))
                        .padding().background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
                HStack {
                    Button("Cancel") { done(nil) }.buttonStyle(.bordered)
                    Button("Redo") { points = [] }.buttonStyle(.bordered).disabled(points.isEmpty)
                    Button("Use measurement") { done(height) }.buttonStyle(.borderedProminent).disabled(height == nil)
                }
                .padding(.bottom, 24)
            }
        }
    }
}

private struct ARMeasureContainer: UIViewRepresentable {
    let lidar: Bool
    @Binding var points: [SIMD3<Float>]
    @Binding var hint: String

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal, .vertical]
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) { config.sceneReconstruction = .mesh }
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) { config.frameSemantics.insert(.sceneDepth) }
        view.session.run(config)
        let coaching = ARCoachingOverlayView()
        coaching.session = view.session
        coaching.goal = .anyPlane
        coaching.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(coaching)
        view.addGestureRecognizer(UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tap(_:))))
        context.coordinator.view = view
        return view
    }

    func updateUIView(_ view: ARView, context: Context) {
        context.coordinator.parent = self
        if points.isEmpty { context.coordinator.clearMarkers() }
    }

    static func dismantleUIView(_ view: ARView, coordinator: Coordinator) { view.session.pause() }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    @MainActor
    final class Coordinator: NSObject {
        var parent: ARMeasureContainer
        weak var view: ARView?
        private var markers: [AnchorEntity] = []
        init(_ parent: ARMeasureContainer) { self.parent = parent }

        @objc func tap(_ gesture: UITapGestureRecognizer) {
            guard let view, parent.points.count < 2 else { return }
            // Measure at the screen centre (crosshair), which is steadier than the finger position.
            let center = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
            let hit = view.raycast(from: center, allowing: .estimatedPlane, alignment: .any).first
                ?? view.raycast(from: center, allowing: .existingPlaneGeometry, alignment: .any).first
            guard let hit else {
                parent.hint = "No surface found there yet. Keep scanning, then tap again."
                return
            }
            let p = SIMD3<Float>(hit.worldTransform.columns.3.x, hit.worldTransform.columns.3.y, hit.worldTransform.columns.3.z)
            let anchor = AnchorEntity(world: p)
            anchor.addChild(ModelEntity(mesh: .generateSphere(radius: 0.008),
                                        materials: [SimpleMaterial(color: parent.points.isEmpty ? .systemBlue : .systemGreen,
                                                                   isMetallic: false)]))
            view.scene.addAnchor(anchor)
            markers.append(anchor)
            parent.points.append(p)
            parent.hint = parent.lidar ? "LiDAR depth in use." : "Camera estimate (no LiDAR): less precise."
        }

        func clearMarkers() {
            markers.forEach { $0.removeFromParent() }
            markers = []
        }
    }
}
