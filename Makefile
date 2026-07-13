# Makefile — Local development workflow for agent-store
# Requires: neonctl (run `neonctl auth` once), pnpm, Bun, psql, Docker (e2e-docker only)
#
# Local dev/e2e run against ephemeral Neon branches — copy-on-write clones of the
# test project's `main` branch that inherit its schema + data. No local Postgres.

.PHONY: setup seed dev dev-api dev-gui build-cli e2e e2e-docker-build e2e-docker stop status

NEON_PROJECT ?= late-sea-44274892
NEON_DEV_BRANCH ?= dev-$(shell whoami)

## One-time setup: install Neon CLI, authenticate, create .env.local
setup:
	@command -v neonctl >/dev/null || npm i -g neonctl
	neonctl auth
	@test -f apps/store/.env.local || cp apps/store/.env.local.example apps/store/.env.local
	@echo ""
	@echo "Next: fill apps/store/.env.local (Neon Auth creds), then: make dev"
	@echo "Your dev branch ($(NEON_DEV_BRANCH)) is created on first 'make dev'."

## Reset your Neon dev branch to the test project's main (drops local changes,
## re-inherits the current test schema + data)
seed:
	neonctl branches reset $(NEON_DEV_BRANCH) --project-id $(NEON_PROJECT)

## Start web store test environment: catalog API on :3001 (background) + store on
## :3000. The store reads its catalog from the API server (same source as the CLI)
## via API_URL; the API reads its Neon branch DATABASE_URL from
## scripts/neon-dev-branch.sh and Neon Auth creds from apps/store/.env.local.
dev:
	DATABASE_URL="$$(scripts/neon-dev-branch.sh $(NEON_DEV_BRANCH))"; export DATABASE_URL; \
	set -a; . apps/store/.env.local; set +a; \
	PORT=3001 pnpm --filter=@as/api start & API_PID=$$!; \
	trap "kill $$API_PID 2>/dev/null" EXIT; \
	API_URL=http://127.0.0.1:3001 \
	pnpm --filter=@as/store dev

## Start the standalone catalog API server (apps/api) on :3001, pointed at your
## Neon dev branch. Both the web store and the CLI consume this API — the CLI
## points at it via AS_STORE_URL.
dev-api:
	DATABASE_URL="$$(scripts/neon-dev-branch.sh $(NEON_DEV_BRANCH))"; export DATABASE_URL; \
	set -a; . apps/store/.env.local; set +a; \
	PORT=3001 pnpm --filter=@as/api start

## Start GUI client test environment in isolated /tmp dirs — never touches your
## real ~/.claude, ~/.codex, or ~/.agents. Starts the catalog API (apps/api) in the
## background, then launches the Tauri dev window pointed at it via AS_STORE_URL.
dev-gui:
	@mkdir -p /tmp/as-gui-dev /tmp/claude-gui-dev /tmp/codex-gui-dev
	DATABASE_URL="$$(scripts/neon-dev-branch.sh $(NEON_DEV_BRANCH))"; export DATABASE_URL; \
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

## Build the real-agent e2e image (claude + codex CLIs, the `as` CLI, fixtures).
## Builds the @as/* libs on the host first — their dist/ is copied into the image.
e2e-docker-build:
	pnpm --filter='@as/client-core...' run build
	docker build -f test/e2e/Dockerfile -t agent-store-e2e .

## Run the real-agent e2e: installs packages, then drives claude & codex against them.
## Needs provider keys in test/provider/*.txt (mounted read-only, never baked into the image).
e2e-docker: e2e-docker-build
	docker run --rm -v "$(PWD)/test/provider:/secrets:ro" agent-store-e2e

## Delete your Neon dev branch (tear down the ephemeral clone)
stop:
	neonctl branches delete $(NEON_DEV_BRANCH) --project-id $(NEON_PROJECT)

## Print your Neon dev branch details + pooled connection string
status:
	neonctl branches get $(NEON_DEV_BRANCH) --project-id $(NEON_PROJECT)
	@neonctl connection-string $(NEON_DEV_BRANCH) --project-id $(NEON_PROJECT) --pooled
