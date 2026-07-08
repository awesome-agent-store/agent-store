# Real-agent e2e harness

Proves, in an isolated Docker container, that a package installed through Agent
Store is actually **discovered and used** by the real agents — Claude Code and
Codex — not just written to disk.

## What it does

1. A [fixture server](./fixture-server.ts) serves two deterministic packages via
   the real store API shape:
   - `e2e-probe-skill` — a skill whose body tells the agent to reply `E2E_SKILL_OK`.
   - `e2e-probe-mcp` — a stdio MCP exposing an `e2e_probe` tool that returns `E2E_MCP_OK`.
2. [`verify.ts`](./verify.ts) installs both through the actual `as` CLI (which
   auto-enables them for `claude` and `codex`), configures each agent's provider
   from the mounted keys, then runs:
   - `claude --print …` and `codex exec …` with prompts that force the skill / MCP,
   - asserting the fixed probe tokens appear in the output.

Because the tokens are fixed, the assertions are deterministic even though the
runs make real (cheap, haiku) LLM calls.

## Provider keys

Put one config per line-based `.txt` file in `test/provider/` (git-ignored):

```
base-url: https://…
api-key:  …
model:    claude-haiku-4-5-20251001
```

The endpoint whose `base-url` contains `codex` is used for Codex (OpenAI Responses
API); the other is used for Claude Code (Anthropic-style). Keys are mounted
read-only at runtime and are never copied into the image.

**Model note:** the Codex endpoint (`code.ylsagi.com/codex`) only serves OpenAI
models, so its config must specify a `gpt-*` model (e.g. `gpt-5.4`). The Claude
config uses a claude model (e.g. `claude-haiku-4-5-20251001`).

## Run locally (Docker)

```bash
make e2e-docker          # build the image + run the full matrix
# or step by step:
make e2e-docker-build
docker run --rm -v "$(pwd)/test/provider:/secrets:ro" agent-store-e2e
```

Exit code is non-zero if any of the four checks (`claude:skill`, `claude:mcp`,
`codex:skill`, `codex:mcp`) fails.

## Run in CI (GitHub Actions)

`.github/workflows/e2e.yml` runs the same `verify.ts` directly on the runner (no
Docker — the runner is already isolated). It needs two repo secrets holding the
3-line provider configs:

- `E2E_PROVIDER_CLAUDE` — Anthropic-style endpoint + a claude model
- `E2E_PROVIDER_CODEX` — the `…/codex` endpoint + a `gpt-*` model

`deploy-store` is gated on this workflow: the store only deploys after e2e passes
on `main`.
