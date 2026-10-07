import Foundation

/// User-editable settings shared by the menu-bar app and the CLI.
public enum ScaleSettings {
    private static let originsKey = "allowedOrigins"

    /// Extra web origins (besides localhost) allowed to read the scale, e.g. a deployed copy of the app.
    public static var allowedOrigins: [String] {
        get { UserDefaults.standard.stringArray(forKey: originsKey) ?? [] }
        set { UserDefaults.standard.set(newValue, forKey: originsKey) }
    }
}
