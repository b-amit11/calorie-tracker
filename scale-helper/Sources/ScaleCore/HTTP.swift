import Foundation

/// Minimal HTTP/1.1 request, parsed from the head of a request.
public struct HTTPRequest: Equatable, Sendable {
    public var method: String
    public var path: String
    public var query: [String: String]
    /// Header names are lowercased.
    public var headers: [String: String]

    /// Parses the request line and headers. Returns nil until the full head (ending in a blank line) is present.
    public static func parse(_ data: Data) -> HTTPRequest? {
        guard let text = String(data: data, encoding: .utf8), let headEnd = text.range(of: "\r\n\r\n") else { return nil }
        var lines = text[..<headEnd.lowerBound].components(separatedBy: "\r\n")
        let parts = lines.removeFirst().split(separator: " ")
        guard parts.count == 3, parts[2].hasPrefix("HTTP/1."), let url = URLComponents(string: String(parts[1])) else { return nil }

        var headers: [String: String] = [:]
        for line in lines {
            guard let colon = line.firstIndex(of: ":") else { return nil }
            headers[line[..<colon].lowercased()] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        var query: [String: String] = [:]
        for item in url.queryItems ?? [] { query[item.name] = item.value ?? "" }
        return HTTPRequest(method: String(parts[0]), path: url.path, query: query, headers: headers)
    }
}

public struct HTTPResponse: Equatable, Sendable {
    public var status: Int
    public var headers: [(String, String)]
    public var body: Data

    public init(status: Int, headers: [(String, String)] = [], body: Data = Data()) {
        self.status = status
        self.headers = headers
        self.body = body
    }

    public static func json<T: Encodable>(_ value: T, status: Int = 200) -> HTTPResponse {
        let body = (try? JSONEncoder().encode(value)) ?? Data()
        return HTTPResponse(status: status, headers: [("Content-Type", "application/json")], body: body)
    }

    public static func error(_ status: Int, _ message: String) -> HTTPResponse {
        json(["error": message], status: status)
    }

    /// Serialized response, closing the connection afterwards.
    public func serialized(extraHeaders: [(String, String)] = []) -> Data {
        var head = "HTTP/1.1 \(status) \(Self.reason(status))\r\n"
        for (k, v) in headers + extraHeaders + [("Content-Length", "\(body.count)"), ("Connection", "close")] {
            head += "\(k): \(v)\r\n"
        }
        return Data((head + "\r\n").utf8) + body
    }

    static func reason(_ status: Int) -> String {
        switch status {
        case 200: "OK"
        case 204: "No Content"
        case 400: "Bad Request"
        case 403: "Forbidden"
        case 404: "Not Found"
        case 405: "Method Not Allowed"
        default: "Status"
        }
    }

    public static func == (a: HTTPResponse, b: HTTPResponse) -> Bool {
        a.status == b.status && a.body == b.body && a.headers.map { "\($0.0):\($0.1)" } == b.headers.map { "\($0.0):\($0.1)" }
    }
}

/// Which web pages may talk to the scale. Pages on this Mac (localhost) are always allowed;
/// a deployed copy of the app (e.g. https://my-app.vercel.app) can be added explicitly.
public struct CORSPolicy: Sendable {
    public var allowedOrigins: Set<String>

    public init(allowedOrigins: [String] = []) {
        self.allowedOrigins = Set(allowedOrigins.compactMap(CORSPolicy.normalize))
    }

    public func allows(_ origin: String) -> Bool {
        guard let url = URL(string: origin), let host = url.host else { return false }
        if host == "localhost" || host == "127.0.0.1" || host == "[::1]" { return true }
        return CORSPolicy.normalize(origin).map(allowedOrigins.contains) ?? false
    }

    /// CORS headers for a request, or none if the origin isn't allowed.
    /// Includes Chrome's Private Network Access opt-in so public HTTPS pages can reach localhost.
    public func headers(for request: HTTPRequest) -> [(String, String)] {
        guard let origin = request.headers["origin"], allows(origin) else { return [] }
        var h = [("Access-Control-Allow-Origin", origin), ("Vary", "Origin")]
        if request.method == "OPTIONS" {
            h += [("Access-Control-Allow-Methods", "GET, POST"), ("Access-Control-Allow-Headers", "Content-Type"), ("Access-Control-Max-Age", "600")]
            if request.headers["access-control-request-private-network"] == "true" {
                h.append(("Access-Control-Allow-Private-Network", "true"))
            }
        }
        return h
    }

    /// "https://Example.com/" -> "https://example.com"
    static func normalize(_ origin: String) -> String? {
        guard let c = URLComponents(string: origin.trimmingCharacters(in: .whitespaces)),
              let scheme = c.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = c.host?.lowercased(), !host.isEmpty else { return nil }
        return "\(scheme)://\(host)" + (c.port.map { ":\($0)" } ?? "")
    }
}
