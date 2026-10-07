import Foundation

/// What the API needs from the scale. Implemented by the real trackpad scale and by test fakes.
public protocol ScaleControlling: AnyObject, Sendable {
    func reading() -> ScaleReading
    @discardableResult func zero() -> Bool
    @discardableResult func calibrate(knownGrams: Double) -> Bool
    func resetCalibration()
}

/// Routes HTTP requests to the scale. Transport-free so it can be tested without sockets.
///
///   GET  /weight                -> current reading
///   GET  /events                -> Server-Sent Events stream of readings
///   POST /tare                  -> zero the scale
///   POST /calibrate?grams=100   -> calibrate with a known weight on the pad
///   POST /calibrate/reset       -> forget calibration
public struct ScaleAPI: Sendable {
    public enum Result: Equatable, Sendable {
        case response(HTTPResponse)
        case eventStream
    }

    public let scale: any ScaleControlling
    public let cors: CORSPolicy

    public init(scale: any ScaleControlling, cors: CORSPolicy) {
        self.scale = scale
        self.cors = cors
    }

    public func handle(_ req: HTTPRequest) -> Result {
        // Browsers send Origin on cross-origin requests. Refuse writes from pages we don't trust,
        // since CORS alone doesn't stop a "simple" POST from being sent.
        if let origin = req.headers["origin"], !cors.allows(origin) {
            return .response(.error(403, "origin not allowed"))
        }

        switch (req.method, req.path) {
        case ("OPTIONS", _):
            return .response(HTTPResponse(status: 204))
        case ("GET", "/weight"):
            return .response(.json(scale.reading()))
        case ("GET", "/events"):
            return .eventStream
        case ("POST", "/tare"):
            scale.zero()
            return .response(.json(scale.reading()))
        case ("POST", "/calibrate"):
            guard let grams = req.query["grams"].flatMap(Double.init), scale.calibrate(knownGrams: grams) else {
                return .response(.error(400, "Keep a finger on the pad, zero it, place a known weight, then pass ?grams="))
            }
            return .response(.json(scale.reading()))
        case ("POST", "/calibrate/reset"):
            scale.resetCalibration()
            return .response(.json(scale.reading()))
        case (_, "/weight"), (_, "/events"), (_, "/tare"), (_, "/calibrate"), (_, "/calibrate/reset"):
            return .response(.error(405, "method not allowed"))
        default:
            return .response(.error(404, "not found"))
        }
    }

    /// One Server-Sent Events frame.
    public static func event(_ reading: ScaleReading) -> Data {
        let json = (try? JSONEncoder().encode(reading)) ?? Data()
        return Data("data: ".utf8) + json + Data("\n\n".utf8)
    }
}
