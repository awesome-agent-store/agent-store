# Real-agent e2e harness: installs Agent Store packages via the `as` CLI, then
# runs Claude Code and Codex headlessly to prove the packages are actually used.
# Build context is the repo root:  docker build -f test/e2e/Dockerfile .
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl git ca-certificates unzip \
  && rm -rf /var/lib/apt/lists/*

# bun (runs the CLI + fixture server + verify driver) and pnpm (workspace install).
# Install bun to /usr/local so the non-root run user can reach it.
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash
RUN npm install -g pnpm@11.5.0

# The two agent CLIs under test.
RUN npm install -g @anthropic-ai/claude-code @openai/codex

WORKDIR /work
# The @as/* libs are built on the host; their dist/ is copied in (see the note in
# Dockerfile.dockerignore). Run `pnpm --filter='@as/client-core...' run build` on
# the host before building this image.
COPY . .

# Install runtime node_modules + workspace symlinks (the CLI is run from source
# via bun and resolves @as/client-core to its copied-in dist).
RUN pnpm install --frozen-lockfile

# Deps for the fixture MCP server.
RUN cd test/e2e/fixtures && npm install --no-audit --no-fund

# Claude Code refuses --dangerously-skip-permissions as root, and Codex refuses a
# codex_home under /tmp — so run as a non-root user with a real writable home.
RUN useradd -m -u 1001 e2e
ENV HOME=/home/e2e
ENV WORK=/home/e2e/run
ENV REPO=/work
ENV SECRETS_DIR=/secrets
USER e2e
ENTRYPOINT ["bash", "/work/test/e2e/run.sh"]
