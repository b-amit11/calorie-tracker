import Foundation
import Network

/// Tiny localhost-only HTTP server so the web app can read the scale.
///
///   GET  /weight                  -> current reading as JSON
///   GET  /events                  -> Server-Sent Events, ~10 readings/sec
///   POST /tare                    -> zero the scale
///   POST /calibrate?grams=100     -> calibrate with a known weight on the pad
///   POST /calibrate/reset         -> forget calibration
final class Server: @unchecked Sendable {
    private let scale: Scale
    private let listener: NWListener
    private let queue = DispatchQueue(label: "scale.server")

    init(scale: Scale, port: UInt16) throws {
        self.scale = scale
        let params = NWParameters.tcp
        // Bind to loopback only: nothing outside this Mac can reach the scale.
        params.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: port)!)
        listener = try NWListener(using: params)
    }

    func start() {
        listener.newConnectionHandler = { [weak self] conn in
            conn.start(queue: self?.queue ?? .main)
            self?.receive(on: conn)
        }
        listener.stateUpdateHandler = { state in
            if case .failed(let error) = state {
                fputs("Server failed: \(error)\n", stderr)
                exit(1)
            }
        }
        listener.start(queue: queue)
    }

    private func receive(on conn: NWConnection) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, _, error in
            guard let self, let data, error == nil,
                  let text = String(data: data, encoding: .utf8),
                  let requestLine = text.split(separator: "\r\n").first else {
                conn.cancel(); return
            }
            let parts = requestLine.split(separator: " ")
            guard parts.count >= 2 else { conn.cancel(); return }
            let origin = Self.header("Origin", in: text)
            self.route(method: String(parts[0]), target: String(parts[1]), origin: origin, conn: conn)
        }
    }

    private func route(method: String, target: String, origin: String?, conn: NWConnection) {
        let url = URLComponents(string: target)
        let path = url?.path ?? target
        let cors = Self.corsHeaders(for: origin)

        switch (method, path) {
        case ("OPTIONS", _):
            send(conn, status: "204 No Content", headers: cors + [("Access-Control-Allow-Methods", "GET, POST"), ("Access-Control-Allow-Headers", "Content-Type")], body: Data())
        case ("GET", "/weight"):
            sendJSON(conn, scale.reading(), cors: cors)
        case ("POST", "/tare"):
            scale.zero()
            sendJSON(conn, scale.reading(), cors: cors)
        case ("POST", "/calibrate"):
            let grams = url?.queryItems?.first(where: { $0.name == "grams" })?.value.flatMap(Double.init) ?? 0
            if scale.calibrate(knownGrams: grams) {
                sendJSON(conn, scale.reading(), cors: cors)
            } else {
                send(conn, status: "400 Bad Request", headers: cors + [("Content-Type", "application/json")],
                     body: Data(#"{"error":"Keep a finger on the pad, zero it, place a known weight, then pass ?grams="}"#.utf8))
            }
        case ("POST", "/calibrate/reset"):
            scale.resetCalibration()
            sendJSON(conn, scale.reading(), cors: cors)
        case ("GET", "/events"):
            stream(conn, cors: cors)
        default:
            send(conn, status: "404 Not Found", headers: cors, body: Data("not found".utf8))
        }
    }

    private func stream(_ conn: NWConnection, cors: [(String, String)]) {
        let head = Self.head(status: "200 OK", headers: cors + [
            ("Content-Type", "text/event-stream"), ("Cache-Control", "no-cache"), ("Connection", "keep-alive"),
        ])
        conn.send(content: head, completion: .contentProcessed { _ in })
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(100))
        timer.setEventHandler { [weak self] in
            guard let self, let json = try? JSONEncoder().encode(self.scale.reading()) else { return }
            var chunk = Data("data: ".utf8); chunk.append(json); chunk.append(Data("\n\n".utf8))
            conn.send(content: chunk, completion: .contentProcessed { error in
                if error != nil { timer.cancel(); conn.cancel() }
            })
        }
        conn.stateUpdateHandler = { state in
            switch state {
            case .failed, .cancelled: timer.cancel()
            default: break
            }
        }
        timer.resume()
    }

    private func sendJSON(_ conn: NWConnection, _ reading: Scale.Reading, cors: [(String, String)]) {
        let body = (try? JSONEncoder().encode(reading)) ?? Data()
        send(conn, status: "200 OK", headers: cors + [("Content-Type", "application/json")], body: body)
    }

    private func send(_ conn: NWConnection, status: String, headers: [(String, String)], body: Data) {
        var data = Self.head(status: status, headers: headers + [("Content-Length", "\(body.count)"), ("Connection", "close")])
        data.append(body)
        conn.send(content: data, completion: .contentProcessed { _ in conn.cancel() })
    }

    private static func head(status: String, headers: [(String, String)]) -> Data {
        var s = "HTTP/1.1 \(status)\r\n"
        for (k, v) in headers { s += "\(k): \(v)\r\n" }
        return Data((s + "\r\n").utf8)
    }

    private static func header(_ name: String, in request: String) -> String? {
        for line in request.split(separator: "\r\n").dropFirst() {
            let pair = line.split(separator: ":", maxSplits: 1)
            if pair.count == 2, pair[0].lowercased() == name.lowercased() {
                return pair[1].trimmingCharacters(in: .whitespaces)
            }
        }
        return nil
    }

    /// Only pages served from this Mac (localhost / 127.0.0.1, any port) may call the scale.
    private static func corsHeaders(for origin: String?) -> [(String, String)] {
        guard let origin, let host = URLComponents(string: origin)?.host,
              host == "localhost" || host == "127.0.0.1" else { return [] }
        return [("Access-Control-Allow-Origin", origin), ("Vary", "Origin")]
    }
}
