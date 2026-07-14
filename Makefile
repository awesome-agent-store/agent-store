# Makefile — Local development workflow for agent-store
# Requires: neonctl (run `neonctl auth` once), pnpm, Bun, psql, Docker (e2e-docker only)
#
# Local dev/e2e run against ephemeral Neon branches — copy-on-write clones of the
# test project's `main` branch that inherit its schema + data. No local Postgres.

.PHONY: setup seed dev-env dev-api dev-store dev-client build-cli e2e e2e-docker-build e2e-docker stop status

NEON_PROJECT ?= late-sea-44274892
NEON_DEV_BRANCH ?= dev-$(shell whoami)

# Dev-server ports. `make dev-env` picks the first free ports at/above these
# (see scripts/dev-ports.sh) and passes them to the sub-targets, so a stale
# previous run doesn't cause EADDRINUSE. Standalone sub-targets use these defaults.
API_PORT ?= 3001
STORE_PORT ?= 3000

## One-time setup: install Neon CLI, authenticate, create .env.local
setup:
	@command -v neonctl >/dev/null || npm i -g neonctl
	neonctl auth
	@test -f apps/store/.env.local || cp apps/store/.env.local.example apps/store/.env.local
	@echo ""
	@echo "Next: fill apps/store/.env.local (Neon Auth creds), then: make dev-env"
	@echo "Your dev branch ($(NEON_DEV_BRANCH)) is created on first 'make dev-env'."

## Reset your Neon dev branch to the test project's main (drops local changes,
## re-inherits the current test schema + data)
seed:
	neonctl branches reset $(NEON_DEV_BRANCH) --project-id $(NEON_PROJECT)

## Start ALL THREE components locally against your Neon dev branch for full
## integration testing — catalog API, web store, and the Tauri desktop client —
## run in parallel as the three sub-targets below. Ports are chosen dynamically
## (first free at/above 3001 for the API, 3000 for the store) and passed to all
## three so a stale previous run doesn't collide. Ctrl-C tears all three down.
## Only dev-api resolves/creates the Neon dev branch, so there is no first-run race.
dev-env:
	@ports=$$(scripts/dev-ports.sh); echo "▸ dev-env $$ports"; \
	$(MAKE) --no-print-directory -j3 dev-api dev-store dev-client $$ports

## Catalog API server (apps/api) on :3001, pointed at your Neon dev branch (reads
## DATABASE_URL from scripts/neon-dev-branch.sh, Neon Auth creds from
## apps/store/.env.local). Both the web store and the CLI consume this API. Also a
## building block of `make dev-env`.
dev-api:
	DATABASE_URL="$$(scripts/neon-dev-branch.sh $(NEON_DEV_BRANCH))"; export DATABASE_URL; \
	set -a; . apps/store/.env.local; set +a; \
	PORT=$(API_PORT) pnpm --filter=@as/api start

## Web store (apps/store) on :3000. Reads its catalog from the local API via
## API_URL and Neon Auth creds from apps/store/.env.local; it has no direct DB
## access. Building block of `make dev-env`.
dev-store:
	set -a; . apps/store/.env.local; set +a; \
	PORT=$(STORE_PORT) API_URL=http://127.0.0.1:$(API_PORT) \
	pnpm --filter=@as/store dev

## Desktop client for local dev, in isolated /tmp dirs — never touches your real
## ~/.claude, ~/.codex, or ~/.agents. Built and run as a packaged debug .app with a
## dev-only identity (com.aas.cli-gui.dev + agent-store-dev://) so macOS routes the
## OAuth deep-link back to the running window — `tauri dev`'s unbundled binary does
## not receive it. Reads the catalog from the local API (AS_STORE_URL) and points
## its OAuth relay at the LOCAL store (VITE_STORE_URL) so sign-in stays local.
## Trade-off: no frontend hot-reload — re-run `make dev-env` to pick up UI changes.
## Building block of `make dev-env`. (See apps/cli-gui/scripts/dev-app.sh.)
dev-client:
	@mkdir -p /tmp/as-gui-dev /tmp/claude-gui-dev /tmp/codex-gui-dev
	AS_HOME=/tmp/as-gui-dev \
	AS_STORE_URL=http://127.0.0.1:$(API_PORT) \
	VITE_STORE_URL=http://localhost:$(STORE_PORT) \
	CLAUDE_CONFIG_DIR=/tmp/claude-gui-dev \
	CODEX_CONFIG_DIR=/tmp/codex-gui-dev \
	bash apps/cli-gui/scripts/dev-app.sh

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
