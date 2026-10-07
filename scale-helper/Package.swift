// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "ScaleHelper",
    platforms: [.macOS(.v15)],
    dependencies: [
        .package(url: "https://github.com/Kyome22/OpenMultitouchSupport", from: "4.0.0"),
    ],
    targets: [
        .executableTarget(
            name: "ScaleHelper",
            dependencies: [.product(name: "OpenMultitouchSupport", package: "OpenMultitouchSupport")],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
