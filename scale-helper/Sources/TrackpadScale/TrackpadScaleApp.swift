import AppKit
import ScaleCore
import ScaleKit
import SwiftUI

@main
struct TrackpadScaleApp: App {
    @State private var model = ScaleModel()

    init() {
        // Menu-bar only: no Dock icon (Info.plist's LSUIElement does the same when bundled).
        NSApplication.shared.setActivationPolicy(.accessory)
    }

    var body: some Scene {
        MenuBarExtra {
            ScaleMenu(model: model)
        } label: {
            Text(model.menuBarTitle).monospacedDigit()
        }
        .menuBarExtraStyle(.window)
    }
}

/// Polls the scale ~10x/sec for the UI and owns the HTTP server.
@MainActor
@Observable
final class ScaleModel {
    private(set) var reading = ScaleReading.idle
    private(set) var serverError: String?
    var allowedOrigins: [String] = ScaleSettings.allowedOrigins

    let scale = TrackpadScale()
    private var server: ScaleServer?
    private var timer: Timer?

    init() {
        scale.start()
        restartServer()
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                let next = self.scale.reading()
                if next != self.reading { self.reading = next } // avoid redrawing when nothing changed
            }
        }
    }

    var menuBarTitle: String {
        reading.touching ? String(format: "%.0f g", reading.grams) : "⚖︎"
    }

    func restartServer() {
        server?.stop()
        serverError = nil
        do {
            let s = try ScaleServer(api: ScaleAPI(scale: scale, cors: CORSPolicy(allowedOrigins: allowedOrigins)))
            s.start { error in
                Task { @MainActor in self.serverError = "Port 8787 is busy. Is another copy running? (\(error))" }
            }
            server = s
        } catch {
            serverError = error.localizedDescription
        }
    }

    func setOrigins(_ origins: [String]) {
        allowedOrigins = origins
        ScaleSettings.allowedOrigins = origins
        restartServer()
    }
}
