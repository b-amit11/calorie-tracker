#!/bin/bash
# Builds TrackpadScale.app (menu-bar app) into dist/. Ad-hoc signed for local use.
# Usage: scripts/build-app.sh [--install]   (--install copies it to /Applications)
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=${VERSION:-0.2.0}
APP=dist/TrackpadScale.app

swift build -c release --product TrackpadScale
BIN_DIR=$(swift build -c release --show-bin-path)

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$APP/Contents/Frameworks"
cp "$BIN_DIR/TrackpadScale" "$APP/Contents/MacOS/TrackpadScale"
# The multitouch wrapper ships as a dynamic framework; embed it and point the binary at it.
cp -R "$BIN_DIR/OpenMultitouchSupportXCF.framework" "$APP/Contents/Frameworks/"
install_name_tool -add_rpath "@executable_path/../Frameworks" "$APP/Contents/MacOS/TrackpadScale"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Trackpad Scale</string>
  <key>CFBundleDisplayName</key><string>Trackpad Scale</string>
  <key>CFBundleIdentifier</key><string>dev.calorietracker.trackpadscale</string>
  <key>CFBundleExecutable</key><string>TrackpadScale</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>15.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

codesign --force --sign - "$APP/Contents/Frameworks/OpenMultitouchSupportXCF.framework"
# Ad-hoc signing for local use. (Distributing it would need a Developer ID, hardened runtime and notarization.)
codesign --force --sign - "$APP"
echo "Built $APP"

if [[ "${1:-}" == "--install" ]]; then
  rm -rf "/Applications/TrackpadScale.app"
  cp -R "$APP" /Applications/
  echo "Installed to /Applications/TrackpadScale.app"
fi
