#!/usr/bin/env bash
# Container entrypoint for the real-agent e2e harness.
set -euo pipefail

export REPO="${REPO:-/work}"
export SECRETS_DIR="${SECRETS_DIR:-/secrets}"

if ! ls "$SECRETS_DIR"/*.txt >/dev/null 2>&1; then
  echo "No provider configs in $SECRETS_DIR — mount them with: -v \"\$(pwd)/test/provider:/secrets:ro\"" >&2
  exit 2
fi

echo "claude: $(claude --version 2>/dev/null || echo '?')  |  codex: $(codex --version 2>/dev/null || echo '?')"
exec bun "$REPO/test/e2e/verify.ts"
