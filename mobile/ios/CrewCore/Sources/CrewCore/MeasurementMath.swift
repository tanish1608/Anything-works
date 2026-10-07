import Foundation

/// AR measurement maths. ARKit world space is metres, gravity-aligned with +Y up.
public enum MeasurementMath {
    /// Vertical distance from a floor point to the device centre.
    public static func mountingHeight(floor: SIMD3<Double>, device: SIMD3<Double>) -> Double {
        abs(device.y - floor.y)
    }

    /// Nominal, unvalidated uncertainty for a tapped AR point pair. LiDAR depth is tighter than camera-only
    /// plane estimates; both are labelled unvalidated on the server and in the PM view.
    public static func nominalUncertainty(lidar: Bool) -> Double { lidar ? 0.015 : 0.04 }

    /// Rounded to millimetres for display and upload.
    public static func rounded(_ value: Double) -> Double { (value * 1000).rounded() / 1000 }
}
