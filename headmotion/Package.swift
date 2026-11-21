// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "HeadMotionStreamer",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "HeadMotionStreamer",
            path: "Sources/HeadMotionStreamer",
            exclude: ["Info.plist"],
            linkerSettings: [
                // Embed Info.plist so macOS can show the Motion permission prompt for a CLI binary.
                .unsafeFlags(["-Xlinker", "-sectcreate", "-Xlinker", "__TEXT",
                              "-Xlinker", "__info_plist", "-Xlinker", "Sources/HeadMotionStreamer/Info.plist"])
            ]
        )
    ]
)
