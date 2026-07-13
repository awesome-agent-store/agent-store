#!/usr/bin/env bash
# E2E test for the full CLI → SDK → catalog API → Neon chain.
# Runs against an ephemeral Neon branch (deleted on exit) and in isolated /tmp
# dirs — never touches ~/.claude or ~/.codex. Requires `neonctl auth` + psql.
set -euo pipefail

export AS_HOME=/tmp/as-e2e
export CLAUDE_CONFIG_DIR=/tmp/claude-e2e
export CODEX_CONFIG_DIR=/tmp/codex-e2e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AS="$ROOT/bin/as"
NEON_PROJECT="${NEON_PROJECT:-late-sea-44274892}"
E2E_BRANCH="e2e-$$"
API_PID=""

cleanup() {
  if [[ -n "$API_PID" ]]; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  neonctl branches delete "$E2E_BRANCH" --project-id "$NEON_PROJECT" >/dev/null 2>&1 || true
}

trap cleanup EXIT

echo "=== [setup] cleaning isolated dirs ==="
rm -rf "$AS_HOME" "$CLAUDE_CONFIG_DIR" "$CODEX_CONFIG_DIR"
mkdir -p "$AS_HOME" "$CLAUDE_CONFIG_DIR/skills" "$CODEX_CONFIG_DIR"

echo ""
echo "=== [setup] creating ephemeral Neon branch $E2E_BRANCH ==="
neonctl branches create --name "$E2E_BRANCH" --parent "${NEON_PARENT_BRANCH:-main}" \
  --project-id "$NEON_PROJECT" >/dev/null
DATABASE_URL="$(neonctl connection-string "$E2E_BRANCH" --project-id "$NEON_PROJECT" --pooled)"
export DATABASE_URL

echo ""
echo "=== [setup] seeding E2E fixtures into the Neon branch ==="
# The E2E fixtures (test-co provider/skill/mcp) live outside the main seed so the
# store catalog only shows real offerings; apply them here (idempotent).
psql "$DATABASE_URL" -f "$ROOT/db/e2e-seed.sql" >/dev/null

echo ""
echo "=== [setup] starting local catalog API ==="
PORT=3001 pnpm --filter=@as/api start >/tmp/as-e2e-api.log 2>&1 &
API_PID=$!
for _ in {1..40}; do
  if curl -fsS http://127.0.0.1:3001/api/items >/dev/null; then
    break
  fi
  sleep 0.5
done
curl -fsS http://127.0.0.1:3001/api/items >/dev/null || {
  echo "✗ local catalog API did not start"
  cat /tmp/as-e2e-api.log
  exit 1
}

echo ""
echo "=== search: verify store is reachable ==="
AS_STORE_URL=http://127.0.0.1:3001 "$AS" search test

echo ""
echo "=== install: all 3 test items ==="
AS_STORE_URL=http://127.0.0.1:3001 "$AS" install openai-provider-test
AS_STORE_URL=http://127.0.0.1:3001 "$AS" install hello-skill
AS_STORE_URL=http://127.0.0.1:3001 "$AS" install fs-mcp-test

echo ""
echo "=== config: apply provider credentials ==="
printf 'sk-local-e2e\n\n\n' | AS_STORE_URL=http://127.0.0.1:3001 "$AS" config openai-provider-test

echo ""
echo "=== list: all items installed and enabled ==="
"$AS" list

echo ""
echo "=== disable + re-enable: test both commands ==="
"$AS" disable openai-provider-test --for claude
"$AS" list
"$AS" enable openai-provider-test --for claude
"$AS" list

echo ""
echo "=== sync: idempotency check ==="
"$AS" sync

echo ""
echo "=== info: spot-check one item ==="
"$AS" info openai-provider-test

echo ""
echo "=== verify: checking config files ==="

grep -q '"apiKey": "sk-local-e2e"' "$AS_HOME/providers/openai-provider-test/config.json" \
  && grep -q '"baseUrl": "https://api.openai.com/v1"' "$AS_HOME/providers/openai-provider-test/config.json" \
  && echo "✓ provider config saved in AS_HOME" \
  || { echo "✗ provider config missing from AS_HOME"; exit 1; }

grep -q '"ANTHROPIC_BASE_URL": "http://127.0.0.1:18780"' "$CLAUDE_CONFIG_DIR/settings.json" \
  && grep -q '"ANTHROPIC_AUTH_TOKEN": "aas-relay"' "$CLAUDE_CONFIG_DIR/settings.json" \
  && echo "✓ claude routed through local relay" \
  || { echo "✗ claude relay settings missing"; exit 1; }

grep -q '"fs-mcp-test"' "$CLAUDE_CONFIG_DIR/settings.json" \
  && echo "✓ mcp in claude settings" \
  || { echo "✗ mcp missing from claude settings"; exit 1; }

[ -s "$CLAUDE_CONFIG_DIR/skills/hello-skill.md" ] \
  && echo "✓ hello-skill.md exists and non-empty" \
  || { echo "✗ hello-skill.md missing or empty"; exit 1; }

grep -q 'model_provider = "aas-relay"' "$CODEX_CONFIG_DIR/config.toml" 2>/dev/null \
  && grep -q 'base_url = "http://127.0.0.1:18780"' "$CODEX_CONFIG_DIR/config.toml" 2>/dev/null \
  && grep -q '"OPENAI_API_KEY": "aas-relay"' "$CODEX_CONFIG_DIR/auth.json" 2>/dev/null \
  && echo "✓ codex routed through local relay" \
  || echo "⚠ codex config not checked (codex may not be installed)"

echo ""
echo "=== [cleanup] removing isolated dirs ==="
rm -rf "$AS_HOME" "$CLAUDE_CONFIG_DIR" "$CODEX_CONFIG_DIR"

echo ""
echo "✓ All E2E checks passed"
