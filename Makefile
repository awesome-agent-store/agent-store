# Makefile — Local development workflow for agent-store
# Requires: supabase CLI, Docker, pnpm, Bun

.PHONY: setup seed dev dev-api dev-gui build-cli e2e stop status

## One-time setup: install CLI, init, start Supabase, seed data, create .env.local
setup:
	brew install supabase/tap/supabase
	@test -f supabase/config.toml || supabase init
	supabase start
	$(MAKE) seed
	@echo ""
	@echo "Next: create apps/store/.env.local with credentials from 'make status'"
	@echo "Then: make dev"

## Re-apply migrations + seed (resets all local data)
seed:
	supabase db reset

## Start web store test environment: Supabase (if not running) + catalog API on
## :3001 (background) + store on :3000. The store reads its catalog from the API
## server (same source as the CLI) via API_URL; the API reads Supabase creds from
## apps/store/.env.local.
dev:
	supabase start
	set -a; . apps/store/.env.local; set +a; \
	PORT=3001 pnpm --filter=@as/api start & API_PID=$$!; \
	trap "kill $$API_PID 2>/dev/null" EXIT; \
	API_URL=http://127.0.0.1:3001 \
	pnpm --filter=@as/store dev

## Start the standalone catalog API server (apps/api) on :3001.
## Reads Supabase creds from apps/store/.env.local (NEXT_PUBLIC_SUPABASE_* fallback).
## Both the web store and the CLI consume this API — the CLI points at it via AS_STORE_URL.
dev-api:
	supabase start
	set -a; . apps/store/.env.local; set +a; \
	PORT=3001 pnpm --filter=@as/api start

## Start GUI client test environment in isolated /tmp dirs — never touches your
## real ~/.claude, ~/.codex, or ~/.agents. Starts the catalog API (apps/api) in the
## background, then launches the Tauri dev window pointed at it via AS_STORE_URL.
dev-gui:
	@mkdir -p /tmp/as-gui-dev /tmp/claude-gui-dev /tmp/codex-gui-dev
	supabase start
	set -a; . apps/store/.env.local; set +a; \
	PORT=3001 pnpm --filter=@as/api start & API_PID=$$!; \
	trap "kill $$API_PID 2>/dev/null" EXIT; \
	AS_HOME=/tmp/as-gui-dev \
	AS_STORE_URL=http://127.0.0.1:3001 \
	CLAUDE_CONFIG_DIR=/tmp/claude-gui-dev \
	CODEX_CONFIG_DIR=/tmp/codex-gui-dev \
	pnpm --filter=@as/cli-gui tauri:dev

## Compile CLI binary to bin/as
build-cli:
	pnpm --filter=@as/cli build:bin

## Run full E2E test in isolated /tmp dirs (builds CLI first)
e2e: build-cli
	@./scripts/local-e2e.sh

## Stop Supabase local stack
stop:
	supabase stop

## Print local Supabase credentials (URL, anon key, service_role key)
status:
	supabase status
