import Foundation

let port: UInt16 = 8787
let scale = Scale()
scale.start()

// Keep a strong reference: the server's handlers only hold it weakly.
let server: Server
do {
    server = try Server(scale: scale, port: port)
    server.start()
} catch {
    fputs("Could not start server: \(error)\n", stderr)
    exit(1)
}

print("""
Trackpad scale running on http://localhost:\(port)
  1. Put an empty bowl or a piece of paper on the trackpad (never food directly on the glass).
  2. Rest ONE finger lightly on the pad and keep it there. The scale zeroes itself.
  3. Add food and read the weight below.
Press Enter to zero again. Ctrl+C to quit.

""")

// Live readout in the terminal.
let display = DispatchSource.makeTimerSource(queue: .main)
display.schedule(deadline: .now(), repeating: .milliseconds(150))
display.setEventHandler {
    let r = scale.reading()
    let line: String
    if !r.touching {
        line = "  no finger on trackpad"
    } else {
        line = String(format: "  %7.1f g %@   (raw %.1f, tare %.1f, x%.3f)", r.grams, r.stable ? "stable  " : "settling", r.raw, r.tare, r.factor)
    }
    print("\r\u{1B}[K" + line, terminator: "")
    fflush(stdout)
}
display.resume()

// Enter = tare.
Thread.detachNewThread {
    while readLine() != nil { scale.zero() }
}

dispatchMain()
