import Foundation
import Testing
@testable import ScaleCore

/// Drives the estimator with synthetic frames at 100 Hz.
struct Sim {
    var estimator = WeightEstimator()
    var now = Date(timeIntervalSince1970: 0)

    mutating func feed(_ pressure: Double, seconds: Double = 1, jitter: Double = 0) {
        for i in 0..<Int(seconds * 100) {
            let noise = jitter == 0 ? 0 : (i.isMultiple(of: 2) ? jitter : -jitter)
            estimator.ingest(pressures: [pressure + noise], at: now)
            now += 0.01
        }
    }

    mutating func lift() {
        estimator.ingest(pressures: [], at: now)
        now += 0.01
    }

    var reading: ScaleReading { estimator.reading }
}

@Suite struct WeightEstimatorTests {
    @Test func reportsNothingWithoutAFinger() {
        let sim = Sim()
        #expect(sim.reading == .idle)
    }

    @Test func autoZeroesOnceTheFingerSettles() {
        var sim = Sim()
        sim.feed(120, seconds: 0.3)
        #expect(sim.reading.touching)
        #expect(!sim.reading.stable, "not ready before the settle time")
        #expect(sim.reading.grams == 0)

        sim.feed(120, seconds: 0.5)
        #expect(sim.reading.stable)
        #expect(sim.reading.tare == 120)
        #expect(sim.reading.grams == 0)
    }

    @Test func measuresWeightAddedAfterZeroing() {
        var sim = Sim()
        sim.feed(120)
        sim.feed(145.5)
        #expect(sim.reading.grams == 25.5)
        #expect(sim.reading.stable)
    }

    @Test func medianIgnoresSpikes() {
        var sim = Sim()
        sim.feed(100)
        sim.feed(110, seconds: 0.5)
        sim.estimator.ingest(pressures: [900], at: sim.now) // one-frame spike
        #expect(sim.reading.grams == 10)
    }

    @Test func noisySignalIsNotStable() {
        var sim = Sim()
        sim.feed(100)
        sim.feed(110, seconds: 0.5, jitter: 4)
        #expect(sim.reading.touching)
        #expect(!sim.reading.stable)
    }

    @Test func doesNotAutoZeroWhileSignalIsNoisy() {
        var sim = Sim()
        sim.feed(100, seconds: 1, jitter: 4)
        #expect(sim.reading.tare == 0)
        #expect(!sim.reading.stable)
    }

    @Test func neverReportsNegativeWeight() {
        var sim = Sim()
        sim.feed(120)
        sim.feed(100) // finger pressing lighter than at tare
        #expect(sim.reading.grams == 0)
    }

    @Test func liftingAndTouchingAgainZeroesAgain() {
        var sim = Sim()
        sim.feed(100)
        sim.feed(130)
        #expect(sim.reading.grams == 30)
        sim.lift()
        #expect(!sim.reading.touching)
        sim.feed(140)
        #expect(sim.reading.tare == 140)
        #expect(sim.reading.grams == 0)
    }

    @Test func sumsMultipleTouches() {
        var sim = Sim()
        for _ in 0..<100 { sim.estimator.ingest(pressures: [60, 40], at: sim.now); sim.now += 0.01 }
        #expect(sim.reading.tare == 100)
    }

    @Test func manualZero() {
        var sim = Sim()
        let result1 = sim.estimator.zero()
        #expect(!result1, "can't zero without a finger")
        sim.feed(100)
        sim.feed(150)
        let result2 = sim.estimator.zero()
        #expect(result2)
        #expect(sim.reading.grams == 0)
    }

    @Test func calibrationScalesReadings() {
        var sim = Sim()
        sim.feed(100)
        sim.feed(108) // a 10 g weight reads as 8
        let result3 = sim.estimator.calibrate(knownGrams: 10)
        #expect(result3)
        #expect(abs(sim.reading.factor - 1.25) < 1e-9)
        #expect(sim.reading.grams == 10)

        sim.estimator.resetCalibration()
        #expect(sim.reading.grams == 8)
    }

    @Test(arguments: [0.0, -5, .nan, .infinity])
    func calibrationRejectsBadInput(grams: Double) {
        var sim = Sim()
        sim.feed(100)
        sim.feed(110)
        let result4 = sim.estimator.calibrate(knownGrams: grams)
        #expect(!result4)
    }

    @Test func calibrationNeedsSomethingOnThePad() {
        var sim = Sim()
        sim.feed(100)
        let result5 = sim.estimator.calibrate(knownGrams: 10)
        #expect(!result5)
    }

    @Test func savedFactorIsRestored() {
        #expect(WeightEstimator(factor: 1.2).factor == 1.2)
        #expect(WeightEstimator(factor: 0).factor == 1, "missing/invalid saved factor falls back to 1")
    }
}
