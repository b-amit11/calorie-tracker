// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "TrackpadScale",
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "TrackpadScale", targets: ["TrackpadScale"]),
        .executable(name: "trackpad-scale", targets: ["ScaleCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/Kyome22/OpenMultitouchSupport", from: "4.0.0"),
    ],
    targets: [
        // Pure logic: weight estimation and the HTTP API. No hardware, fully unit-tested.
        .target(name: "ScaleCore"),
        // Trackpad input + network server.
        .target(
            name: "ScaleKit",
            dependencies: ["ScaleCore", .product(name: "OpenMultitouchSupport", package: "OpenMultitouchSupport")],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        // Menu-bar app.
        .executableTarget(name: "TrackpadScale", dependencies: ["ScaleKit"], swiftSettings: [.swiftLanguageMode(.v5)]),
        // Headless command-line version.
        .executableTarget(name: "ScaleCLI", dependencies: ["ScaleKit"], swiftSettings: [.swiftLanguageMode(.v5)]),
        .testTarget(name: "ScaleCoreTests", dependencies: ["ScaleCore"]),
    ]
)
