import Foundation
import Testing
@testable import ScaleCore

@Suite struct HTTPRequestTests {
    @Test func parsesRequestLineQueryAndHeaders() throws {
        let raw = "POST /calibrate?grams=7.5 HTTP/1.1\r\nHost: localhost:8787\r\nOrigin: http://localhost:3000\r\n\r\n"
        let req = try #require(HTTPRequest.parse(Data(raw.utf8)))
        #expect(req.method == "POST")
        #expect(req.path == "/calibrate")
        #expect(req.query == ["grams": "7.5"])
        #expect(req.headers["origin"] == "http://localhost:3000")
    }

    @Test(arguments: [
        "GET /weight HTTP/1.1\r\nHost: x\r\n",           // head not finished yet
        "GET /weight\r\n\r\n",                            // missing version
        "GET /weight HTTP/2\r\n\r\n",                     // not HTTP/1.x
        "GET /weight HTTP/1.1\r\nno colon here\r\n\r\n",  // malformed header
    ])
    func rejectsIncompleteOrMalformed(raw: String) {
        #expect(HTTPRequest.parse(Data(raw.utf8)) == nil)
    }
}

@Suite struct CORSPolicyTests {
    let policy = CORSPolicy(allowedOrigins: ["https://Calories.example.com/"])

    @Test(arguments: ["http://localhost:3000", "http://127.0.0.1:5173", "https://calories.example.com"])
    func allows(origin: String) { #expect(policy.allows(origin)) }

    @Test(arguments: ["https://evil.example", "https://calories.example.com.evil.example", "http://calories.example.com", "null", ""])
    func blocks(origin: String) { #expect(!policy.allows(origin)) }

    @Test func preflightIncludesPrivateNetworkOptIn() {
        let req = HTTPRequest(method: "OPTIONS", path: "/weight", query: [:], headers: [
            "origin": "https://calories.example.com",
            "access-control-request-private-network": "true",
        ])
        let headers = Dictionary(uniqueKeysWithValues: policy.headers(for: req))
        #expect(headers["Access-Control-Allow-Origin"] == "https://calories.example.com")
        #expect(headers["Access-Control-Allow-Private-Network"] == "true")
    }

    @Test func noHeadersForDisallowedOrigins() {
        let req = HTTPRequest(method: "GET", path: "/weight", query: [:], headers: ["origin": "https://evil.example"])
        #expect(policy.headers(for: req).isEmpty)
    }
}

final class FakeScale: ScaleControlling, @unchecked Sendable {
    var current = ScaleReading(grams: 12, touching: true, stable: true, raw: 112, tare: 100, factor: 1)
    var zeroed = 0
    var calibratedWith: Double?

    func reading() -> ScaleReading { current }
    func zero() -> Bool { zeroed += 1; return true }
    func calibrate(knownGrams: Double) -> Bool { calibratedWith = knownGrams; return knownGrams > 0 }
    func resetCalibration() { current.factor = 1 }
}

@Suite struct ScaleAPITests {
    let scale = FakeScale()
    var api: ScaleAPI { ScaleAPI(scale: scale, cors: CORSPolicy()) }

    func request(_ method: String, _ target: String, origin: String? = nil) -> HTTPRequest {
        let url = URLComponents(string: target)!
        var query: [String: String] = [:]
        for item in url.queryItems ?? [] { query[item.name] = item.value }
        return HTTPRequest(method: method, path: url.path, query: query, headers: origin.map { ["origin": $0] } ?? [:])
    }

    func status(_ result: ScaleAPI.Result) -> Int? {
        if case .response(let r) = result { return r.status }
        return nil
    }

    @Test func weightReturnsJSON() throws {
        guard case .response(let res) = api.handle(request("GET", "/weight")) else { Issue.record("expected response"); return }
        let reading = try JSONDecoder().decode(ScaleReading.self, from: res.body)
        #expect(reading.grams == 12)
    }

    @Test func eventsStream() {
        #expect(api.handle(request("GET", "/events")) == .eventStream)
    }

    @Test func tareZeroes() {
        #expect(status(api.handle(request("POST", "/tare"))) == 200)
        #expect(scale.zeroed == 1)
    }

    @Test func calibrateValidatesGrams() {
        #expect(status(api.handle(request("POST", "/calibrate?grams=7.5"))) == 200)
        #expect(scale.calibratedWith == 7.5)
        #expect(status(api.handle(request("POST", "/calibrate"))) == 400)
        #expect(status(api.handle(request("POST", "/calibrate?grams=abc"))) == 400)
    }

    @Test func wrongMethodAndUnknownPaths() {
        #expect(status(api.handle(request("GET", "/tare"))) == 405)
        #expect(status(api.handle(request("GET", "/nope"))) == 404)
    }

    @Test func refusesWritesFromUntrustedPages() {
        #expect(status(api.handle(request("POST", "/tare", origin: "https://evil.example"))) == 403)
        #expect(scale.zeroed == 0)
        #expect(status(api.handle(request("POST", "/tare", origin: "http://localhost:3000"))) == 200)
    }

    @Test func eventFrameFormat() {
        let frame = String(decoding: ScaleAPI.event(.idle), as: UTF8.self)
        #expect(frame.hasPrefix("data: {"))
        #expect(frame.hasSuffix("}\n\n"))
    }

    @Test func serializedResponseHasLengthAndCORS() {
        let data = HTTPResponse.json(["ok": true]).serialized(extraHeaders: [("Access-Control-Allow-Origin", "http://localhost:3000")])
        let text = String(decoding: data, as: UTF8.self)
        #expect(text.hasPrefix("HTTP/1.1 200 OK\r\n"))
        #expect(text.contains("Content-Length: 11\r\n"))
        #expect(text.contains("Access-Control-Allow-Origin: http://localhost:3000\r\n"))
        #expect(text.hasSuffix("\r\n\r\n{\"ok\":true}"))
    }
}
