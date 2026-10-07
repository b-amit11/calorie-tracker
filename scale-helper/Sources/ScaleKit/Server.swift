import Foundation
import Network
import ScaleCore

/// Serves `ScaleAPI` over HTTP on the loopback interface only: nothing outside this Mac can connect.
public final class ScaleServer: @unchecked Sendable {
    public let port: UInt16
    private let api: ScaleAPI
    private let listener: NWListener
    private let queue = DispatchQueue(label: "scale.server")

    public init(api: ScaleAPI, port: UInt16 = 8787) throws {
        self.api = api
        self.port = port
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: port)!)
        listener = try NWListener(using: params)
    }

    /// `onFailure` is called if the port can't be bound (e.g. another copy is already running).
    public func start(onFailure: @escaping @Sendable (Error) -> Void = { _ in }) {
        listener.newConnectionHandler = { [weak self] conn in
            guard let self else { conn.cancel(); return }
            conn.start(queue: self.queue)
            self.receive(conn, buffer: Data())
        }
        listener.stateUpdateHandler = { state in
            if case .failed(let error) = state { onFailure(error) }
        }
        listener.start(queue: queue)
    }

    public func stop() {
        listener.cancel()
    }

    private func receive(_ conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, isComplete, error in
            guard let self, error == nil else { conn.cancel(); return }
            let buffer = buffer + (data ?? Data())
            guard let req = HTTPRequest.parse(buffer) else {
                // Wait for the rest of the head, but don't let a client stream junk forever.
                if isComplete || buffer.count > 16_384 { conn.cancel() } else { self.receive(conn, buffer: buffer) }
                return
            }
            let cors = self.api.cors.headers(for: req)
            switch self.api.handle(req) {
            case .response(let res):
                conn.send(content: res.serialized(extraHeaders: cors), completion: .contentProcessed { _ in conn.cancel() })
            case .eventStream:
                self.stream(conn, cors: cors)
            }
        }
    }

    private func stream(_ conn: NWConnection, cors: [(String, String)]) {
        var head = "HTTP/1.1 200 OK\r\n"
        for (k, v) in cors + [("Content-Type", "text/event-stream"), ("Cache-Control", "no-cache"), ("Connection", "keep-alive")] {
            head += "\(k): \(v)\r\n"
        }
        conn.send(content: Data((head + "\r\n").utf8), completion: .contentProcessed { _ in })

        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(100))
        timer.setEventHandler { [weak self] in
            guard let self else { timer.cancel(); return }
            conn.send(content: ScaleAPI.event(self.api.scale.reading()), completion: .contentProcessed { error in
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
}
