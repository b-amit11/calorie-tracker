import ScaleCore
import ServiceManagement
import SwiftUI

struct ScaleMenu: View {
    let model: ScaleModel
    @State private var tab = Tab.weigh

    enum Tab: String, CaseIterable { case weigh = "Weigh", calibrate = "Calibrate", settings = "Settings" }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("", selection: $tab) {
                ForEach(Tab.allCases, id: \.self) { Text($0.rawValue) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            switch tab {
            case .weigh: WeighView(model: model)
            case .calibrate: CalibrateView(model: model)
            case .settings: SettingsView(model: model)
            }

            if let error = model.serverError {
                Text(error).font(.caption).foregroundStyle(.red)
            }
            Divider()
            HStack {
                Text("Serving on localhost:8787").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button("Quit") { NSApplication.shared.terminate(nil) }
            }
        }
        .padding(14)
        .frame(width: 300)
    }
}

private struct WeighView: View {
    let model: ScaleModel

    var body: some View {
        let r = model.reading
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(r.touching ? String(format: "%.1f", r.grams) : "—")
                    .font(.system(size: 44, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                Text("g").font(.title2).foregroundStyle(.secondary)
                Spacer()
                StatusBadge(reading: r)
            }
            Text(r.touching
                 ? "Add food. Keep your finger resting lightly."
                 : "Paper or bowl on the trackpad, then rest one finger on it.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button("Zero") { model.scale.zero() }
                .disabled(!r.touching)
                .keyboardShortcut("z")
        }
    }
}

private struct StatusBadge: View {
    let reading: ScaleReading
    var body: some View {
        let (text, color): (String, Color) =
            !reading.touching ? ("no finger", .secondary) : reading.stable ? ("stable", .green) : ("settling", .orange)
        Text(text)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }
}

/// Three-step wizard: zero, place a known weight, enter its true weight.
private struct CalibrateView: View {
    let model: ScaleModel
    @State private var known = ""
    @State private var message: String?

    var body: some View {
        let r = model.reading
        VStack(alignment: .leading, spacing: 10) {
            Step(n: 1, done: r.touching && r.tare != 0, text: "Paper on the pad, rest one finger, then Zero.") {
                Button("Zero") { model.scale.zero() }.disabled(!r.touching)
            }
            Step(n: 2, done: r.grams > 0.5 && r.stable, text: "Place something of known weight. Coins work: US quarter 5.67 g, 1 € coin 7.5 g.") {
                EmptyView()
            }
            Step(n: 3, done: false, text: "Enter its true weight.") {
                HStack {
                    TextField("grams", text: $known).frame(width: 70)
                    Button("Calibrate") {
                        let ok = Double(known).map { model.scale.calibrate(knownGrams: $0) } ?? false
                        message = ok ? String(format: "Calibrated (×%.3f)", model.scale.reading().factor) : "Needs a stable reading above 0.5 g."
                    }
                    .disabled(!r.stable || Double(known) == nil)
                }
            }
            HStack {
                Text(String(format: "Reading: %.1f g · factor ×%.3f", r.grams, r.factor)).font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button("Reset") { model.scale.resetCalibration(); message = "Calibration reset." }.controlSize(.small)
            }
            if let message { Text(message).font(.caption) }
        }
    }
}

private struct Step<Accessory: View>: View {
    let n: Int
    let done: Bool
    let text: String
    @ViewBuilder let accessory: Accessory

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: done ? "checkmark.circle.fill" : "\(n).circle")
                .foregroundStyle(done ? .green : .secondary)
            VStack(alignment: .leading, spacing: 6) {
                Text(text).font(.callout).fixedSize(horizontal: false, vertical: true)
                accessory
            }
        }
    }
}

private struct SettingsView: View {
    let model: ScaleModel
    @State private var originsText = ""
    @State private var launchAtLogin = SMAppService.mainApp.status == .enabled

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Websites allowed to read the scale").font(.callout.weight(.medium))
            Text("Pages on localhost always can. Add your deployed app, one per line.")
                .font(.caption).foregroundStyle(.secondary)
            TextEditor(text: $originsText)
                .font(.system(.caption, design: .monospaced))
                .frame(height: 54)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(.quaternary))
            Button("Save") {
                model.setOrigins(originsText.split(whereSeparator: \.isNewline).map(String.init).filter { !$0.isEmpty })
            }
            Toggle("Launch at login", isOn: $launchAtLogin)
                .onChange(of: launchAtLogin) { _, on in
                    // Only works for the bundled .app (see scripts/build-app.sh).
                    do { try on ? SMAppService.mainApp.register() : SMAppService.mainApp.unregister() }
                    catch { launchAtLogin = !on }
                }
        }
        .onAppear { originsText = model.allowedOrigins.joined(separator: "\n") }
    }
}
