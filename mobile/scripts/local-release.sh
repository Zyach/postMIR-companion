#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <apk_path> <apk_url> [notes...]" >&2
  exit 1
fi

APK_PATH="$1"
APK_URL="$2"
shift 2
NOTES="${*:-Local release}"

if [[ ! -f "$APK_PATH" ]]; then
  echo "APK not found: $APK_PATH" >&2
  exit 1
fi

SHA256=$(sha256sum "$APK_PATH" | awk '{print $1}')
echo "SHA256=$SHA256"

node scripts/make-update-manifest.mjs "$APK_URL" "$SHA256" "$NOTES" > latest.json
echo "Manifest written to mobile/latest.json"

echo "Next: upload APK and latest.json to your release target (e.g., GitHub Releases)."
