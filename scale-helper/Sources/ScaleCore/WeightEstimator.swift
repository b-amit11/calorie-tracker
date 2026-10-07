import Foundation

/// What the scale reports to clients.
public struct ScaleReading: Codable, Equatable, Sendable {
    public var grams: Double
    public var touching: Bool
    public var stable: Bool
    public var raw: Double
    public var tare: Double
    public var factor: Double

    public init(grams: Double, touching: Bool, stable: Bool, raw: Double, tare: Double, factor: Double) {
        self.grams = grams
        self.touching = touching
        self.stable = stable
        self.raw = raw
        self.tare = tare
        self.factor = factor
    }

    public static let idle = ScaleReading(grams: 0, touching: false, stable: false, raw: 0, tare: 0, factor: 1)
}

/// Turns raw Force Touch pressure into a smoothed, tared, calibrated weight.
///
/// The trackpad only reports pressure while it detects a finger, so the user keeps
/// one finger resting on the pad. The finger's own pressure becomes part of the tare.
///
/// - Smoothing: median of a sliding window, which ignores single-frame spikes.
/// - Stability: the window's spread (max - min) must be under a threshold.
/// - Auto-tare: shortly after a finger lands and the signal is stable, the current
///   value becomes zero, like pressing "tare" on a kitchen scale.
public struct WeightEstimator: Sendable {
    public var windowSize: Int
    public var settleTime: TimeInterval
    public var stabilityThreshold: Double

    public private(set) var tare: Double = 0
    public private(set) var factor: Double
    public private(set) var touching = false

    private var window: [Double] = []
    private var touchStartedAt: Date?
    private var needsAutoTare = false

    public init(factor: Double = 1, windowSize: Int = 40, settleTime: TimeInterval = 0.6, stabilityThreshold: Double = 3) {
        self.factor = factor > 0 ? factor : 1
        self.windowSize = windowSize
        self.settleTime = settleTime
        self.stabilityThreshold = stabilityThreshold
    }

    /// Feed one frame. `pressures` holds the pressure of each active touch; empty means no finger.
    public mutating func ingest(pressures: [Double], at now: Date) {
        guard !pressures.isEmpty else {
            touching = false
            touchStartedAt = nil
            needsAutoTare = false
            window.removeAll()
            return
        }
        if !touching {
            touching = true
            touchStartedAt = now
            needsAutoTare = true
            window.removeAll()
        }
        window.append(pressures.reduce(0, +))
        if window.count > windowSize { window.removeFirst(window.count - windowSize) }

        if needsAutoTare, let start = touchStartedAt, now.timeIntervalSince(start) >= settleTime, isStable {
            tare = median
            needsAutoTare = false
        }
    }

    public var reading: ScaleReading {
        let raw = touching ? median : 0
        let ready = touching && !needsAutoTare
        let grams = ready ? max(0, (raw - tare) * factor) : 0
        return ScaleReading(
            grams: (grams * 10).rounded() / 10,
            touching: touching,
            stable: ready && isStable,
            raw: raw, tare: tare, factor: factor
        )
    }

    /// Zero the scale at the current value. Returns false if no finger is on the pad.
    @discardableResult
    public mutating func zero() -> Bool {
        guard touching, !window.isEmpty else { return false }
        tare = median
        needsAutoTare = false
        return true
    }

    /// With a known weight on the pad (after zeroing), derive the correction factor.
    /// Returns false when the reading is too small to calibrate against.
    @discardableResult
    public mutating func calibrate(knownGrams: Double) -> Bool {
        let delta = median - tare
        guard touching, knownGrams > 0, knownGrams.isFinite, delta > 0.5 else { return false }
        factor = knownGrams / delta
        return true
    }

    public mutating func resetCalibration() {
        factor = 1
    }

    var median: Double {
        guard !window.isEmpty else { return 0 }
        let sorted = window.sorted()
        let mid = sorted.count / 2
        return sorted.count.isMultiple(of: 2) ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    }

    var isStable: Bool {
        guard window.count >= windowSize / 2, let lo = window.min(), let hi = window.max() else { return false }
        return hi - lo < stabilityThreshold
    }
}
