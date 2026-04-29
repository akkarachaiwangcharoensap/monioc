#!/usr/bin/env bash
set -euo pipefail

# Builds, signs, notarizes, and staples a distributable macOS DMG for this Tauri app.
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS." >&2
  exit 1
fi

for cmd in npm node codesign xcrun hdiutil; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

required_vars=(
  APPLE_SIGNING_IDENTITY
  APPLE_ID
  APPLE_APP_SPECIFIC_PASSWORD
  APPLE_TEAM_ID
)

for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "Missing required env var: $var" >&2
    exit 1
  fi
done

APP_NAME="$(node -e "const c=require('./src-tauri/tauri.conf.json'); process.stdout.write(c.productName)")"
APP_VERSION="$(node -e "const c=require('./src-tauri/tauri.conf.json'); process.stdout.write(c.version)")"
APP_PATH="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
DMG_DIR="src-tauri/target/release/bundle/dmg"
DMG_PATH="${DMG_DIR}/${APP_NAME}_${APP_VERSION}_$(uname -m).dmg"
ENTITLEMENTS_PATH="src-tauri/entitlements.mac.plist"

rm -f "$DMG_PATH"

# Build only the .app first so we can sign before packaging.
npm run tauri:build -- --bundles app

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found: $APP_PATH" >&2
  exit 1
fi

codesign --force --deep --options runtime --timestamp --entitlements "$ENTITLEMENTS_PATH" --sign "$APPLE_SIGNING_IDENTITY" "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

mkdir -p "$DMG_DIR"
hdiutil create -volname "$APP_NAME" -srcfolder "$APP_PATH" -ov -format UDZO "$DMG_PATH"

codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$DMG_PATH"
codesign --verify --verbose=2 "$DMG_PATH"

xcrun notarytool submit "$DMG_PATH" --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
xcrun stapler staple "$APP_PATH"
xcrun stapler staple "$DMG_PATH"

spctl -a -vv -t exec "$APP_PATH" || true
spctl -a -vv -t open "$DMG_PATH" || true

echo "\nNotarized DMG ready: $DMG_PATH"
