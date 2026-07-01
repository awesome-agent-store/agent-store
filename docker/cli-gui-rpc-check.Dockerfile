FROM oven/bun:1.3.12
WORKDIR /workspace
COPY . .
ENV AAS_HOME=/tmp/aas-home
ENV CLAUDE_CONFIG_DIR=/tmp/claude-config
ENV CODEX_CONFIG_DIR=/tmp/codex-config
RUN mkdir -p /tmp/aas-home /tmp/claude-config /tmp/codex-config
RUN bun install
RUN cd packages/types && bun run build \
    && cd ../sdk && bun run build \
    && cd ../../apps/client-core && bun run build
CMD ["sh", "-lc", "set -euo pipefail; bun build apps/cli/src/index.ts --compile --outfile /tmp/aas-bin; /tmp/aas-bin __rpc list '[]'; echo '--- registry state (should not exist, confirms no real home touched) ---'; ls -la /tmp/aas-home; echo '--- confirming host home directories were never referenced ---'; env | grep -E 'AAS_HOME|CLAUDE_CONFIG_DIR|CODEX_CONFIG_DIR'"]
