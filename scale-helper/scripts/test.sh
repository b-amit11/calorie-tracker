#!/bin/bash
# Runs the Swift tests. With full Xcode, plain `swift test` works. With only the
# Command Line Tools, Swift Testing is installed but not on the default search paths.
set -euo pipefail
cd "$(dirname "$0")/.."

DEV=$(xcode-select -p)
if [[ "$DEV" == */CommandLineTools ]]; then
  F="$DEV/Library/Developer/Frameworks"
  L="$DEV/Library/Developer/usr/lib"
  exec swift test -Xswiftc -F -Xswiftc "$F" \
    -Xlinker -F -Xlinker "$F" -Xlinker -rpath -Xlinker "$F" -Xlinker -rpath -Xlinker "$L" "$@"
fi
exec swift test "$@"
