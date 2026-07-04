# Provider Local Relay — Design Spec

## Background

Today, `aas enable <slug> --for <target>` (`apps/client-core/src/config/claude.ts`'s `syncItemToClaude` and `codex.ts`'s `syncItemToCodex`) writes a provider's real `apiKey`/`baseUrl` **directly** into Claude Code's `settings.json` or Codex's `config.toml`/`auth.json`. Switching providers means rewriting that target's config file every time, and there's no way to remap model names or otherwise adjust a request in flight.

Per `AGENTS.md`, this design is based directly on two existing reference implementations found on this machine:
- **code-switch-R** (`~/github/phenix3443/code-switch-R`, Go/Wails) — an always-on local HTTP relay; Claude Code/Codex are pointed at it once, and it re-reads the active provider **per request**, so switching providers never touches Claude/Codex's config again.
- **cc-switch** (cloned from `https://github.com/farion1231/cc-switch`, Tauri/Rust) — a strict superset (circuit breakers, failover queues, DB-backed state) that we are **not** copying wholesale, but which contributes one specific idea: `preserveCodexOfficialAuthOnSwitch`, letting a user bounce between a third-party provider and their official ChatGPT login without re-authenticating.

This spec adopts code-switch-R's simpler, declarative architecture as the base, translated to this repo's TypeScript/Bun stack and existing `apps/client-core` module boundaries, plus the one borrowed idea above.

## Scope

**In scope:**
- A local HTTP relay (`apps/client-core/src/relay/`) that Claude Code/Codex talk to instead of the real upstream provider.
- Per-request lookup of the currently-enabled provider (no relay restart needed to switch).
- Auth header injection based on a declared `authType` per provider.
- Model-name rewriting via a declared `modelMapping` table (exact match, then wildcard).
- Idempotent config injection into Claude/Codex settings, with baseline-snapshot-based restore (mirrors `proxystate.go`).
- `aas relay start|stop|status` CLI commands; `aas enable` auto-starts the relay for provider items if it isn't already running.
- Optional `preserveOfficialAuthOnSwitch` flag (Codex only), borrowed from cc-switch.

**Out of scope (deferred, matches code-switch-R's own boundaries where noted):**
- Full Anthropic↔OpenAI protocol/SSE translation (`protocol_adapter.go` in code-switch-R) — only same-protocol providers are relayed in v1.
- Automatic failover, circuit breakers, health-check polling, or a failover queue (both reference apps have this; v1 relays to exactly one "current" provider per target, matching code-switch-R's non-failover mode).
- Request logging / usage tracking storage (both reference apps persist this to SQLite; not needed for v1).
- GUI-specific relay controls beyond a start/stop/status surface — a dedicated relay settings screen in `apps/cli-gui` is a follow-up.

## Architecture

```
Claude Code / Codex
      |
      v  (config points here once; injected + idempotent)
apps/client-core relay — 127.0.0.1:18780, loopback only
      |
      v  (re-reads registry.json's enabledFor per request — no fixed mapping)
real upstream provider (openai / yls-me / ...)
```

Port `18780` is fixed for v1 (chosen to avoid colliding with code-switch-R's real `18100` on this machine); making it configurable is a cheap follow-up, not needed now.

## Components

| File | Mirrors | Responsibility |
|---|---|---|
| `apps/client-core/src/relay/server.ts` | `providerrelay.go` (routing) | `Bun.serve` on `127.0.0.1:18780`. Fixed routes: `POST /v1/messages` (claude), `POST /responses` (codex). On each request, resolves ordered candidate providers for that target via **`relay/provider-order.ts`'s `findOrderedProvidersForTarget`** (registry entries where `category==='provider'`, `compatibleWith` includes the target, `enabledFor[target]===true`, sorted by priority `level`) and fails over across them — no new "current provider" state to maintain. |
| `apps/client-core/src/relay/forward.ts` | `forwardRequest` (providerrelay.go:752-981) | Reads the resolved provider's `config.json` (`readProviderConnection`, already exists), injects the real credential per `authType` (`x-api-key` + `anthropic-version` header, or `Authorization: Bearer`, or a custom header name), forwards to the provider's real `baseUrl`, and streams the response back unmodified (no SSE reconstruction — that's the deferred protocol-adapter territory). |
| `apps/client-core/src/relay/model-mapping.ts` | `ReplaceModelInRequestBody` + `GetEffectiveModel` (providerrelay.go / providerservice.go) | Given a provider's `modelMapping: Record<string, string>` (exact key first, then a simple `*` wildcard suffix match) and a parsed request body, returns the body with `model` replaced if a mapping applies. Since Bun/Node can `JSON.parse`/`JSON.stringify` cheaply (unlike Go, which uses `sjson` to avoid a full reparse), this is a plain parse → mutate `.model` → stringify — no byte-level surgical editing needed. |
| Extend `apps/client-core/src/config/provider.ts` | `Provider` struct (providerservice.go:21-87) | `ProviderConnection` gains `authType?: 'anthropic' | 'bearer' | { header: string }` (default `'bearer'` if absent, preserving current behavior) and `modelMapping?: Record<string, string>`. Both are read straight from the same `config.json` `readProviderConnection` already parses — no new file. |
| Extend `apps/client-core/src/config/claude.ts` / `codex.ts` | `claudesettings.go` / `codexsettings.go` + `proxystate.go` | New `enableRelayForClaude(claudeConfigDir)` / `disableRelayForClaude(claudeConfigDir)` (and Codex equivalents). On first enable, snapshots the pre-existing `env.ANTHROPIC_BASE_URL`/`env.ANTHROPIC_AUTH_TOKEN` (or Codex's `model_provider`/`model_providers`/`auth.json` `OPENAI_API_KEY`) into `~/.agents/relay-state/{claude,codex}.json` — `null` meaning "the key didn't exist before" — **only if no snapshot exists yet**, so repeated enables never clobber the true original. Disable restores exactly those fields (deleting the key if it didn't exist originally) rather than blind-overwriting the file, so any unrelated edits made while the relay was active survive. This is a direct port of `proxystate.go`'s baseline-snapshot pattern. |
| `apps/cli` new command: `relay` (`src/commands/relay.ts`) | N/A (Wails app lifecycle) | `aas relay start` — spawns the relay via `Bun.spawn` with `stdio: 'ignore'` and detaches (`unref`), writes its PID to `~/.agents/relay.pid`; no-ops if already running (checked via PID file + port probe). `aas relay stop` — reads the PID file, sends `SIGTERM`, removes the file; also calls `disableRelayFor{Claude,Codex}` for any target that was pointed at it. `aas relay status` — reports running/stopped + which targets currently point at it. |
| Extend `aas enable` (`apps/client-core/src/engine.ts`) | code-switch-R's implicit "enable = proxy is already running" assumption | When `enable(slug, target)` is called for a `category === 'provider'` item, it now also ensures the relay is running (starts it if not) and calls `enableRelayFor{Claude,Codex}` instead of writing the real credential directly. `disable` calls `disableRelayFor{...}` for that target. Existing behavior (real credential written to config) is unchanged for `skill`/`mcp` categories — this only changes the `provider` path. |

## `preserveOfficialAuthOnSwitch` (borrowed from cc-switch)

A provider-independent boolean on the Codex relay-state file (`~/.agents/relay-state/codex.json`): when the relay swaps which provider is "current" for Codex, it normally doesn't touch `auth.json` at all (the relay handles auth injection itself now, per-request) — this flag only matters for the **restore** path: if `true`, `disableRelayForCodex` restores the official ChatGPT OAuth `auth.json` content captured at snapshot time even if the user had re-run `codex login` while the relay was active; if `false` (default), restore uses whatever `auth.json` looked like at snapshot time as-is. This is a one-field addition to the snapshot/restore logic already being built — no new subsystem.

## Data flow example

1. User runs `aas install openai-provider` then `aas enable openai-provider --for claude`.
2. `engine.ts` sees `category === 'provider'`, ensures the relay is running (spawns it if the PID file is stale/absent), calls `enableRelayForClaude(claudeConfigDir)`.
3. `enableRelayForClaude` snapshots current `env.*` (if no snapshot exists yet), then sets `env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:18780'` and `env.ANTHROPIC_AUTH_TOKEN = 'aas-relay'` (a fixed placeholder, mirroring code-switch-R's `"code-switch-r"` sentinel — the relay ignores this value and injects the real key itself).
4. Claude Code sends a real request to `http://127.0.0.1:18780/v1/messages`.
5. `relay/server.ts` resolves the active provider for `claude` from the registry (`openai-provider`), `relay/model-mapping.ts` rewrites `model` if a mapping applies, `relay/forward.ts` injects the real `apiKey` as an `x-api-key` header and forwards to `openai-provider`'s real `baseUrl`, streaming the response straight back.
6. User later runs `aas enable another-provider --for claude` — `env.*` in `settings.json` is untouched (already pointed at the relay); only the registry's `enabledFor` flips, which the relay picks up on the very next request.

## Testing

- `relay/model-mapping.ts`: unit tests for exact match, wildcard match, no-match passthrough — pure functions, no server needed.
- `relay/forward.ts`: unit tests for each `authType` producing the right header shape, using a fake `fetch`.
- `relay/server.ts`: integration test spinning up the relay on an ephemeral port (not the fixed 18780, to avoid clashing with a real running instance in CI) against a mock upstream, verifying routing + end-to-end header/model rewriting.
- `config/claude.ts` / `codex.ts` extensions: unit tests for snapshot-once semantics (second enable doesn't overwrite snapshot) and restore correctness (field present vs. absent before), using `mkdtemp`-isolated directories — the same pattern `engine.test.ts` already uses.
- `aas relay start/stop/status`: tests using a fake/injectable process-spawn function, not a real subprocess, per existing CLI command test conventions (`makeEngine`-style fakes).
