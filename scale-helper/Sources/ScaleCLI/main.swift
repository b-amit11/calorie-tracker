import Foundation
import ScaleCore
import ScaleKit

// Usage: trackpad-scale [--port 8787] [--allow-origin https://my-app.example]...
var port: UInt16 = 8787
var origins = ScaleSettings.allowedOrigins
var args = CommandLine.arguments.dropFirst()
while let arg = args.popFirst() {
    switch arg {
    case "--port": port = args.popFirst().flatMap(UInt16.init) ?? port
    case "--allow-origin": if let o = args.popFirst() { origins.append(o) }
    default:
        fputs("Unknown argument \(arg)\nUsage: trackpad-scale [--port 8787] [--allow-origin URL]...\n", stderr)
        exit(2)
    }
}

let scale = TrackpadScale()
if !scale.start() { fputs("Could not open the trackpad.\n", stderr) }

let server: ScaleServer
do {
    server = try ScaleServer(api: ScaleAPI(scale: scale, cors: CORSPolicy(allowedOrigins: origins)), port: port)
    server.start { error in
        fputs("Server failed: \(error). Is another copy already running?\n", stderr)
        exit(1)
    }
} catch {
    fputs("Could not start server: \(error)\n", stderr)
    exit(1)
}

print("""
Trackpad scale running on http://localhost:\(port)
  1. Put an empty bowl or a piece of paper on the trackpad.
  2. Rest ONE finger lightly on the pad and keep it there. The scale zeroes itself.
  3. Add food and read the weight below.
Press Enter to zero again. Ctrl+C to quit.

""")

// Live readout, only when attached to a terminal.
let display = DispatchSource.makeTimerSource(queue: .main)
if isatty(STDOUT_FILENO) != 0 {
    display.schedule(deadline: .now(), repeating: .milliseconds(150))
    display.setEventHandler {
        let r = scale.reading()
        let line = r.touching
            ? String(format: "  %7.1f g %@   (raw %.1f, tare %.1f, x%.3f)", r.grams, r.stable ? "stable  " : "settling", r.raw, r.tare, r.factor)
            : "  no finger on trackpad"
        print("\r\u{1B}[K" + line, terminator: "")
        fflush(stdout)
    }
    display.resume()
}

// Enter = tare.
Thread.detachNewThread {
    while readLine() != nil { scale.zero() }
}

dispatchMain()
