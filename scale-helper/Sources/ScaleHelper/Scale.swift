import Foundation
import OpenMultitouchSupport

/// Turns raw Force Touch pressure into a smoothed, tared, calibrated weight.
///
/// Workflow (like a kitchen scale): put an empty bowl/paper on the trackpad,
/// rest one finger lightly on the pad, wait for it to auto-zero, then add food.
final class Scale: @unchecked Sendable {
    struct Reading: Codable {
        var grams: Double
        var touching: Bool
        var stable: Bool
        var raw: Double
        var tare: Double
        var factor: Double
    }

    private let lock = NSLock()
    private var window: [Double] = []
    private let windowSize = 40          // ~0.3-0.4s of frames
    private var tare: Double = 0
    private var touching = false
    private var touchStartedAt: Date?
    private var needsAutoTare = false
    private var factor: Double

    private static let factorKey = "calibrationFactor"

    init() {
        let saved = UserDefaults.standard.double(forKey: Self.factorKey)
        factor = saved > 0 ? saved : 1.0
    }

    func start() {
        let manager = OMSManager.shared
        Task.detached { [weak self] in
            for await touches in manager.touchDataStream {
                self?.ingest(touches)
            }
        }
        if !manager.startListening() {
            fputs("Could not start listening to the trackpad.\n", stderr)
        }
    }

    private func ingest(_ touches: [OMSTouchData]) {
        let active = touches.filter { $0.state == .touching || $0.state == .making }
        lock.lock(); defer { lock.unlock() }

        guard !active.isEmpty else {
            touching = false
            touchStartedAt = nil
            window.removeAll()
            return
        }
        if !touching {
            touching = true
            touchStartedAt = Date()
            needsAutoTare = true
            window.removeAll()
        }
        window.append(Double(active.reduce(0) { $0 + $1.pressure }))
        if window.count > windowSize { window.removeFirst(window.count - windowSize) }

        // Auto-zero once the finger has settled for a moment.
        if needsAutoTare, let start = touchStartedAt, Date().timeIntervalSince(start) > 0.6, isStableLocked() {
            tare = medianLocked()
            needsAutoTare = false
        }
    }

    func reading() -> Reading {
        lock.lock(); defer { lock.unlock() }
        let raw = touching ? medianLocked() : 0
        let grams = touching && !needsAutoTare ? max(0, (raw - tare) * factor) : 0
        return Reading(
            grams: (grams * 10).rounded() / 10,
            touching: touching,
            stable: touching && !needsAutoTare && isStableLocked(),
            raw: raw, tare: tare, factor: factor
        )
    }

    func zero() {
        lock.lock(); defer { lock.unlock() }
        guard touching else { return }
        tare = medianLocked()
        needsAutoTare = false
    }

    /// Place a known weight (e.g. a 100 g item) after zeroing, then call this.
    @discardableResult
    func calibrate(knownGrams: Double) -> Bool {
        lock.lock(); defer { lock.unlock() }
        let delta = medianLocked() - tare
        guard touching, knownGrams > 0, delta > 0.5 else { return false }
        factor = knownGrams / delta
        UserDefaults.standard.set(factor, forKey: Self.factorKey)
        return true
    }

    func resetCalibration() {
        lock.lock(); defer { lock.unlock() }
        factor = 1.0
        UserDefaults.standard.removeObject(forKey: Self.factorKey)
    }

    private func medianLocked() -> Double {
        guard !window.isEmpty else { return 0 }
        let sorted = window.sorted()
        return sorted[sorted.count / 2]
    }

    private func isStableLocked() -> Bool {
        guard window.count >= windowSize / 2, let lo = window.min(), let hi = window.max() else { return false }
        return hi - lo < 3
    }
}
