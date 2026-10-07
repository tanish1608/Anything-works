// swift-tools-version:5.9
import PackageDescription

// Platform-independent crew logic (API contract, offline outbox, multipart, measurements).
// Tests run on macOS with `swift test`; the iOS app links this package.
let package = Package(
    name: "CrewCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "CrewCore", targets: ["CrewCore"])],
    targets: [
        .target(name: "CrewCore"),
        .testTarget(name: "CrewCoreTests", dependencies: ["CrewCore"]),
    ]
)
