#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GUI_DIR="$ROOT_DIR/apps/cli-gui"
TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"

if [[ -z "$TRIPLE" ]]; then
  echo "Could not determine host target triple from rustc -vV" >&2
  exit 1
fi

mkdir -p "$GUI_DIR/src-tauri/binaries"

bun build "$ROOT_DIR/apps/cli/src/index.ts" \
  --compile \
  --outfile "$GUI_DIR/src-tauri/binaries/aas-$TRIPLE"

if [[ "$(uname)" == "Darwin" ]]; then
  # bun --compile emits a Mach-O with a malformed ad-hoc signature on some
  # bun/macOS combinations, which the kernel refuses to execute (SIGKILL).
  # Re-signing ad-hoc fixes this without requiring a real signing identity.
  codesign --remove-signature "$GUI_DIR/src-tauri/binaries/aas-$TRIPLE"
  codesign --force -s - "$GUI_DIR/src-tauri/binaries/aas-$TRIPLE"
fi

echo "Built sidecar: src-tauri/binaries/aas-$TRIPLE"
