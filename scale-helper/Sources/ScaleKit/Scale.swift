import Foundation
import OpenMultitouchSupport
import ScaleCore

/// The real scale: feeds trackpad frames into a `WeightEstimator` and persists calibration.
public final class TrackpadScale: ScaleControlling, @unchecked Sendable {
    private let lock = NSLock()
    private var estimator: WeightEstimator
    private let defaults: UserDefaults
    private static let factorKey = "calibrationFactor"

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        estimator = WeightEstimator(factor: defaults.double(forKey: Self.factorKey))
    }

    /// Starts reading the trackpad. Returns false if the multitouch device couldn't be opened.
    @discardableResult
    public func start() -> Bool {
        let manager = OMSManager.shared
        Task.detached { [weak self] in
            for await touches in manager.touchDataStream {
                let pressures = touches
                    .filter { $0.state == .touching || $0.state == .making }
                    .map { Double($0.pressure) }
                self?.ingest(pressures)
            }
        }
        return manager.startListening()
    }

    private func ingest(_ pressures: [Double]) {
        lock.withLock { estimator.ingest(pressures: pressures, at: Date()) }
    }

    public func reading() -> ScaleReading {
        lock.withLock { estimator.reading }
    }

    @discardableResult
    public func zero() -> Bool {
        lock.withLock { estimator.zero() }
    }

    @discardableResult
    public func calibrate(knownGrams: Double) -> Bool {
        lock.withLock {
            guard estimator.calibrate(knownGrams: knownGrams) else { return false }
            defaults.set(estimator.factor, forKey: Self.factorKey)
            return true
        }
    }

    public func resetCalibration() {
        lock.withLock {
            estimator.resetCalibration()
            defaults.removeObject(forKey: Self.factorKey)
        }
    }
}
