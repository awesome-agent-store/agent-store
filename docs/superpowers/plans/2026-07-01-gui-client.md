# GUI Client (Tauri) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/cli-gui`, a Tauri desktop app matching `ui/Agent Store.dc.html`'s "CLI 客户端" screen — installed-item management, browse, provider config, settings — that performs real install/enable/config operations via the existing `@aas/client-core` engine.

**Architecture:** The GUI never re-implements engine logic. It shells out to the already-compiled `bin/aas` binary as a **Tauri sidecar**, using one additive internal subcommand (`aas __rpc <method> <jsonArgs>`) added to `apps/cli` that calls `AASEngineImpl` methods directly and prints a single JSON line to stdout. The frontend is React + Vite + Tailwind (reusing the store design tokens from the Web Store plan), talking to the sidecar through `@tauri-apps/plugin-shell`'s `Command.sidecar(...)`. All tests that exercise the real engine (the `__rpc` subcommand's own tests, and any GUI integration check) run against isolated temp directories or the repo's existing Docker fixture — never against the developer's real `~/.claude`, `~/.codex`, or `~/.agents`.

**Tech Stack:** Tauri 2 (Rust shell, no custom Rust business logic beyond the generated scaffold), React 18 + Vite + TypeScript, Tailwind CSS, `@tauri-apps/plugin-shell` + `tauri-plugin-shell`, Bun test + Testing Library (matching `apps/market`/`apps/cli` conventions), the existing `bin/aas` binary (Bun-compiled).

## Global Constraints

- Do not modify the behavior or text output of any existing `apps/cli` command (`search`, `install`, `uninstall`, `enable`, `disable`, `config`, `sync`, `update`, `list`, `info`) — the `__rpc` subcommand is additive only.
- No test in this plan may write to a real `~/.claude`, `~/.codex`, or `~/.agents` directory. Engine-level tests use `mkdtemp`-based isolated paths (the existing pattern in `apps/client-core/src/__tests__/engine.test.ts`); any full end-to-end sidecar check runs inside the repo's existing Docker fixture (`docker/agent-package-fixture.Dockerfile` / `scripts/docker-agent-package-fixture.sh`), which already sets `AAS_HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_CONFIG_DIR` to container-local paths.
- GUI favorites/terminal-log state is local-only (no account sync) — matches the design spec's explicit scope decision. This plan ships the `readLocalState`/`writeLocalState` persistence primitive (Task 10) but does not wire a full favorites list view or persist terminal log history across restarts — the "收藏" nav entry in `Sidebar` (Task 5) has no section content yet. Treat that as explicit follow-up scope, not an oversight, if picking this plan back up later.
- The sidecar is built for the local development host triple only in this pass (`aarch64-apple-darwin`, confirmed via `rustc -Vv` on this machine); multi-platform release builds are out of scope.
- Follow `apps/market`'s testing conventions where they transfer: Bun test + `@testing-library/react`, `happy-dom`, `mock.module(...)` for module mocking.

---

### Task 1: `__rpc` subcommand on `apps/cli`

**Files:**
- Create: `apps/cli/src/commands/rpc.ts`
- Modify: `apps/cli/src/index.ts`
- Test: `apps/cli/src/commands/__tests__/rpc.test.ts`

**Interfaces:**
- Produces: `runRpc(engine: AASEngine, args: string[], out?: (s: string) => void): Promise<number>` — `args = [method, jsonArgs]`. Prints one JSON line: `{"ok":true,"data":...}` on success, `{"ok":false,"error":"..."}` on failure. Returns `0` or `1` as a process exit code.
- Consumes: `AASEngine` from `@aas/types` (same interface every other command file already imports).

- [ ] **Step 1: Write the failing test**

Create `apps/cli/src/commands/__tests__/rpc.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { runRpc } from '../rpc'
import type { AASEngine } from '@aas/types'

function makeEngine(overrides?: Partial<AASEngine>): AASEngine {
  return {
    search: async () => [],
    install: async () => ({ slug: 'openai-provider', version: '1.2.0', installedAt: '2026-06-18T00:00:00Z' }),
    uninstall: async () => undefined,
    enable: async () => undefined,
    disable: async () => undefined,
    getConfigSchema: async () => ({ schema: {}, current: {} }),
    setConfig: async () => undefined,
    sync: async () => ({ synced: [], errors: [] }),
    checkUpdates: async () => [],
    update: async () => [],
    list: async () => [],
    info: async () => {
      throw new Error('not installed')
    },
    ...overrides,
  } as unknown as AASEngine
}

test('runRpc calls install with parsed JSON args and prints ok:true', async () => {
  const lines: string[] = []
  const code = await runRpc(makeEngine(), ['install', '["openai-provider"]'], s => lines.push(s))
  expect(code).toBe(0)
  const parsed = JSON.parse(lines[0])
  expect(parsed.ok).toBe(true)
  expect(parsed.data.slug).toBe('openai-provider')
})

test('runRpc calls enable with two positional args', async () => {
  const enable = async (slug: string, target: string) => {
    expect(slug).toBe('openai-provider')
    expect(target).toBe('claude')
  }
  const lines: string[] = []
  const code = await runRpc(makeEngine({ enable: enable as AASEngine['enable'] }), ['enable', '["openai-provider","claude"]'], s => lines.push(s))
  expect(code).toBe(0)
  expect(JSON.parse(lines[0]).ok).toBe(true)
})

test('runRpc returns ok:false and exit code 1 for an unknown method', async () => {
  const lines: string[] = []
  const code = await runRpc(makeEngine(), ['not-a-method', '[]'], s => lines.push(s))
  expect(code).toBe(1)
  const parsed = JSON.parse(lines[0])
  expect(parsed.ok).toBe(false)
  expect(parsed.error).toContain('not-a-method')
})

test('runRpc returns ok:false and exit code 1 for invalid JSON args', async () => {
  const lines: string[] = []
  const code = await runRpc(makeEngine(), ['install', 'not-json'], s => lines.push(s))
  expect(code).toBe(1)
  expect(JSON.parse(lines[0]).ok).toBe(false)
})

test('runRpc returns ok:false and exit code 1 when the engine call throws', async () => {
  const lines: string[] = []
  const code = await runRpc(makeEngine(), ['info', '["missing-slug"]'], s => lines.push(s))
  expect(code).toBe(1)
  const parsed = JSON.parse(lines[0])
  expect(parsed.ok).toBe(false)
  expect(parsed.error).toBe('not installed')
})

test('runRpc defaults to empty args array when jsonArgs is omitted', async () => {
  const lines: string[] = []
  const code = await runRpc(makeEngine(), ['list'], s => lines.push(s))
  expect(code).toBe(0)
  expect(JSON.parse(lines[0]).data).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/commands/__tests__/rpc.test.ts`
Expected: FAIL — `Cannot find module '../rpc'`

- [ ] **Step 3: Implement `apps/cli/src/commands/rpc.ts`**

```ts
import type { AASEngine, ListOptions, SearchOptions, ToolTarget } from '@aas/types'

type RpcHandler = (engine: AASEngine, args: unknown[]) => Promise<unknown>

const RPC_METHODS: Record<string, RpcHandler> = {
  search: (e, a) => e.search(a[0] as string, a[1] as SearchOptions | undefined),
  install: (e, a) => e.install(a[0] as string),
  uninstall: (e, a) => e.uninstall(a[0] as string),
  enable: (e, a) => e.enable(a[0] as string, a[1] as ToolTarget),
  disable: (e, a) => e.disable(a[0] as string, a[1] as ToolTarget),
  getConfigSchema: (e, a) => e.getConfigSchema(a[0] as string),
  setConfig: (e, a) => e.setConfig(a[0] as string, a[1] as Record<string, unknown>),
  sync: (e, a) => e.sync(a[0] as ToolTarget[] | undefined),
  checkUpdates: (e, a) => e.checkUpdates(a[0] as string[] | undefined),
  update: (e, a) => e.update(a[0] as string | undefined),
  list: (e, a) => e.list(a[0] as ListOptions | undefined),
  info: (e, a) => e.info(a[0] as string),
}

export async function runRpc(
  engine: AASEngine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<number> {
  const [method, jsonArgs] = args
  const handler = method ? RPC_METHODS[method] : undefined

  if (!handler) {
    out(JSON.stringify({ ok: false, error: `Unknown RPC method: ${method}` }))
    return 1
  }

  let parsedArgs: unknown[]
  try {
    parsedArgs = jsonArgs ? (JSON.parse(jsonArgs) as unknown[]) : []
  } catch {
    out(JSON.stringify({ ok: false, error: 'Invalid JSON arguments' }))
    return 1
  }

  try {
    const data = await handler(engine, parsedArgs)
    out(JSON.stringify({ ok: true, data: data ?? null }))
    return 0
  } catch (err) {
    out(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
    return 1
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/commands/__tests__/rpc.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Wire `__rpc` into `apps/cli/src/index.ts`**

Edit `apps/cli/src/index.ts` — add the import and a case that exits with the returned code (every other case currently ignores exit code; this is the first one that needs a non-default exit code, so handle it explicitly):

```ts
import { runRpc } from './commands/rpc'
```

```ts
    case '__rpc': {
      const code = await runRpc(engine, rest)
      process.exit(code)
    }
```

Insert this case in the `switch (command)` block (any position — order doesn't matter for a switch). Leave the `USAGE` string unchanged; `__rpc` is intentionally undocumented (internal/sidecar-only).

- [ ] **Step 6: Run the full `apps/cli` suite + type-check**

Run: `cd apps/cli && bun test && bun run type-check`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/cli/src/commands/rpc.ts apps/cli/src/commands/__tests__/rpc.test.ts apps/cli/src/index.ts
git commit -m "feat(cli): add internal __rpc subcommand for GUI sidecar use"
```

---

### Task 2: Scaffold `apps/cli-gui` (Tauri + React + Vite + Tailwind)

**Files:**
- Create: `apps/cli-gui/package.json`
- Create: `apps/cli-gui/vite.config.ts`
- Create: `apps/cli-gui/tsconfig.json`
- Create: `apps/cli-gui/tailwind.config.ts`
- Create: `apps/cli-gui/postcss.config.js`
- Create: `apps/cli-gui/index.html`
- Create: `apps/cli-gui/src/main.tsx`
- Create: `apps/cli-gui/src/App.tsx`
- Create: `apps/cli-gui/src/globals.css`
- Create: `apps/cli-gui/src-tauri/Cargo.toml`
- Create: `apps/cli-gui/src-tauri/tauri.conf.json`
- Create: `apps/cli-gui/src-tauri/src/main.rs`
- Create: `apps/cli-gui/src-tauri/capabilities/default.json`
- Create: `apps/cli-gui/src-tauri/build.rs`
- Modify: `turbo.json`

**Interfaces:**
- Produces: a running Tauri dev shell (`cargo tauri dev`) rendering `App.tsx`'s placeholder content, wired into the pnpm workspace (already covered by the `apps/*` glob in `pnpm-workspace.yaml`).

- [ ] **Step 1: Install the Tauri CLI**

Run: `pnpm add -Dw @tauri-apps/cli@^2` (workspace-root dev dependency, matches how a Rust-backed tool is invoked across a JS monorepo)
Expected: `node_modules/.bin/tauri` exists; `pnpm exec tauri --version` prints a `2.x` version.

- [ ] **Step 2: Create `apps/cli-gui/package.json`**

```json
{
  "name": "@aas/cli-gui",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "type-check": "tsc --noEmit",
    "test": "bun test",
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "dependencies": {
    "@aas/types": "workspace:*",
    "@tauri-apps/api": "^2.1.1",
    "@tauri-apps/plugin-shell": "^2.0.1",
    "lucide-react": "^0.400.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@happy-dom/global-registrator": "^20.10.5",
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@types/bun": "latest",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5",
    "vite": "^5.3.1"
  }
}
```

- [ ] **Step 3: Create Vite + TS + Tailwind config**

Create `apps/cli-gui/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
})
```

Create `apps/cli-gui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "types": ["bun"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "src-tauri"]
}
```

Create `apps/cli-gui/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        store: {
          wall: 'var(--wall)',
          win: 'var(--win)',
          sidebar: 'var(--sidebar)',
          content: 'var(--content)',
          chrome: 'var(--chrome)',
          panel: 'var(--panel)',
          'panel-2': 'var(--panel-2)',
          border: 'var(--border)',
          'border-strong': 'var(--border-strong)',
          text: 'var(--text)',
          'text-2': 'var(--text-2)',
          'text-3': 'var(--text-3)',
          accent: 'var(--accent)',
          'accent-soft': 'var(--accent-soft)',
          green: 'var(--green)',
          amber: 'var(--amber)',
          red: 'var(--red)',
        },
      },
    },
  },
  plugins: [],
}

export default config
```

Create `apps/cli-gui/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

Create `apps/cli-gui/src/globals.css` (same design tokens as the Web Store plan's `apps/market/app/globals.css` Task 2 — copy verbatim so both surfaces share one visual language):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --wall: radial-gradient(130% 120% at 26% -12%, #2c2647 0%, #16161c 52%, #0b0b0f 100%);
  --win: #17171b;
  --sidebar: #1e1e24;
  --content: #141417;
  --chrome: #1e1e24;
  --panel: #23232a;
  --panel-2: #2b2b32;
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.15);
  --text: #edeef1;
  --text-2: #9a9aa6;
  --text-3: #64646e;
  --accent: #7c82ff;
  --accent-soft: rgba(124, 130, 255, 0.16);
  --green: #3ad29f;
  --amber: #f0b34a;
  --red: #f3675f;
}

body {
  margin: 0;
  background: var(--wall);
}
```

- [ ] **Step 4: Create the React entry point and placeholder App**

Create `apps/cli-gui/index.html`:

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <title>Agent Store CLI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/cli-gui/src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

Create `apps/cli-gui/src/App.tsx`:

```tsx
export function App() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-store-win text-store-text">
      <p className="font-mono text-sm text-store-text-2">Agent Store CLI — scaffold ready</p>
    </div>
  )
}
```

- [ ] **Step 5: Scaffold the Tauri (Rust) side**

Run from `apps/cli-gui/`: `pnpm exec tauri init --ci --app-name "Agent Store CLI" --window-title "Agent Store CLI" --frontend-dist ../dist --dev-url http://localhost:5183 --before-dev-command "" --before-build-command ""`

Expected: creates `src-tauri/` with `Cargo.toml`, `tauri.conf.json`, `src/main.rs`, `capabilities/default.json`, `build.rs`, and icon assets.

- [ ] **Step 6: Add `apps/cli-gui` to the turbo pipeline**

`turbo.json` already applies its `build`/`test`/`type-check`/`lint`/`dev` task definitions to every workspace package by task name — no per-package entry is needed since it uses the shared task graph. Verify this by running:

Run: `pnpm turbo run type-check --filter=@aas/cli-gui`
Expected: runs (even if trivially, with 0 files to check yet beyond the scaffold) without an "unknown package" error.

- [ ] **Step 7: Install dependencies and verify the dev shell boots**

Run: `pnpm install` (repo root)
Run: `cd apps/cli-gui && pnpm exec tauri dev` (manual check — requires a display; run locally, not in CI)
Expected: a native window opens showing "Agent Store CLI — scaffold ready". Close the window / Ctrl-C to stop.

- [ ] **Step 8: Commit**

```bash
git add apps/cli-gui pnpm-lock.yaml package.json
git commit -m "feat(cli-gui): scaffold Tauri + React + Vite + Tailwind app"
```

---

### Task 3: Build the sidecar binary and wire it into Tauri

**Files:**
- Create: `apps/cli-gui/scripts/build-sidecar.sh`
- Modify: `apps/cli-gui/src-tauri/tauri.conf.json`
- Create: `apps/cli-gui/src-tauri/capabilities/shell.json`
- Modify: `apps/cli-gui/package.json`

**Interfaces:**
- Produces: `apps/cli-gui/src-tauri/binaries/aas-<host-triple>` (a Tauri "external binary" / sidecar), referenced from the frontend as `Command.sidecar('binaries/aas')`.

- [ ] **Step 1: Write the sidecar build script**

Create `apps/cli-gui/scripts/build-sidecar.sh`:

```bash
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

echo "Built sidecar: src-tauri/binaries/aas-$TRIPLE"
```

- [ ] **Step 2: Make it executable and run it**

```bash
chmod +x apps/cli-gui/scripts/build-sidecar.sh
./apps/cli-gui/scripts/build-sidecar.sh
```

Expected: prints `Built sidecar: src-tauri/binaries/aas-aarch64-apple-darwin` (or the matching triple for the machine running this), and the file exists.

- [ ] **Step 3: Register the sidecar in `tauri.conf.json`**

Edit `apps/cli-gui/src-tauri/tauri.conf.json` — add under the top-level `bundle` key (created by `tauri init` in Task 2):

```json
  "bundle": {
    "externalBin": ["binaries/aas"]
  },
```

(Merge with whatever `bundle` keys `tauri init` already generated — don't replace the whole object, add `externalBin` alongside them.)

- [ ] **Step 4: Grant shell-execute permission for the sidecar**

Create `apps/cli-gui/src-tauri/capabilities/shell.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "shell-sidecar",
  "description": "Allow executing the bundled aas CLI sidecar",
  "windows": ["main"],
  "permissions": [
    {
      "identifier": "shell:allow-execute",
      "allow": [{ "name": "binaries/aas", "sidecar": true }]
    }
  ]
}
```

- [ ] **Step 5: Add the `tauri-plugin-shell` Rust dependency**

Edit `apps/cli-gui/src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
tauri-plugin-shell = "2"
```

Edit `apps/cli-gui/src-tauri/src/main.rs` — register the plugin (merge into whatever `tauri::Builder::default()` chain `tauri init` scaffolded):

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 6: Add a `build:sidecar` script and wire it before dev/build**

Edit `apps/cli-gui/package.json`, add to `"scripts"`:

```json
    "build:sidecar": "bash scripts/build-sidecar.sh",
```

Update `"tauri:dev"` and `"tauri:build"` to depend on it:

```json
    "tauri:dev": "bun run build:sidecar && tauri dev",
    "tauri:build": "bun run build:sidecar && tauri build",
```

- [ ] **Step 7: Manual verification**

Run: `cd apps/cli-gui && pnpm exec tauri dev`
Expected: window opens as in Task 2 (the sidecar isn't called by the UI yet — that's Task 4 — this step just confirms the build+bundle wiring doesn't break the dev shell).

- [ ] **Step 8: Commit**

```bash
git add apps/cli-gui/scripts apps/cli-gui/src-tauri/tauri.conf.json apps/cli-gui/src-tauri/capabilities/shell.json \
  apps/cli-gui/src-tauri/Cargo.toml apps/cli-gui/src-tauri/src/main.rs apps/cli-gui/package.json
git commit -m "feat(cli-gui): bundle bin/aas as a Tauri sidecar with shell-execute permission"
```

---

### Task 4: Frontend RPC client

**Files:**
- Create: `apps/cli-gui/src/lib/rpc.ts`
- Test: `apps/cli-gui/src/lib/__tests__/rpc.test.ts`
- Create: `apps/cli-gui/bunfig.toml`
- Create: `apps/cli-gui/test-setup.ts`

**Interfaces:**
- Produces: `callRpc<T>(method: string, args?: unknown[]): Promise<T>` — throws an `Error` with the sidecar's error message on `{ok:false}`, otherwise resolves to `data`.
- Consumes: `Command` from `@tauri-apps/plugin-shell`.

- [ ] **Step 1: Add the Bun test environment config (mirrors `apps/market`)**

Create `apps/cli-gui/bunfig.toml`:

```toml
[test]
environment = "happy-dom"
preload = ["./test-setup.ts"]
```

Create `apps/cli-gui/test-setup.ts`:

```ts
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import '@testing-library/jest-dom'

GlobalRegistrator.register()
```

- [ ] **Step 2: Write the failing test**

Create `apps/cli-gui/src/lib/__tests__/rpc.test.ts`:

```ts
import { test, expect, mock, afterEach } from 'bun:test'

afterEach(() => { mock.restore() })

function mockSidecar(stdout: string, code = 0) {
  mock.module('@tauri-apps/plugin-shell', () => ({
    Command: {
      sidecar: () => ({
        execute: async () => ({ code, stdout, stderr: '' }),
      }),
    },
  }))
}

test('callRpc resolves data on ok:true', async () => {
  mockSidecar(JSON.stringify({ ok: true, data: { slug: 'openai-provider' } }))
  const { callRpc } = await import('../rpc')
  const result = await callRpc<{ slug: string }>('install', ['openai-provider'])
  expect(result.slug).toBe('openai-provider')
})

test('callRpc rejects with the sidecar error message on ok:false', async () => {
  mockSidecar(JSON.stringify({ ok: false, error: 'Item not installed: foo' }))
  const { callRpc } = await import('../rpc')
  await expect(callRpc('info', ['foo'])).rejects.toThrow('Item not installed: foo')
})

test('callRpc rejects when sidecar stdout is not valid JSON', async () => {
  mockSidecar('not json')
  const { callRpc } = await import('../rpc')
  await expect(callRpc('list')).rejects.toThrow()
})

test('callRpc defaults args to an empty array', async () => {
  let capturedArgs: string[] = []
  mock.module('@tauri-apps/plugin-shell', () => ({
    Command: {
      sidecar: (_bin: string, args: string[]) => {
        capturedArgs = args
        return { execute: async () => ({ code: 0, stdout: JSON.stringify({ ok: true, data: [] }), stderr: '' }) }
      },
    },
  }))
  const { callRpc } = await import('../rpc')
  await callRpc('list')
  expect(capturedArgs).toEqual(['__rpc', 'list', '[]'])
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/lib/__tests__/rpc.test.ts`
Expected: FAIL — `Cannot find module '../rpc'`

- [ ] **Step 4: Implement `apps/cli-gui/src/lib/rpc.ts`**

```ts
import { Command } from '@tauri-apps/plugin-shell'

interface RpcSuccess<T> {
  ok: true
  data: T
}

interface RpcFailure {
  ok: false
  error: string
}

type RpcEnvelope<T> = RpcSuccess<T> | RpcFailure

export async function callRpc<T>(method: string, args: unknown[] = []): Promise<T> {
  const command = Command.sidecar('binaries/aas', ['__rpc', method, JSON.stringify(args)])
  const output = await command.execute()

  let envelope: RpcEnvelope<T>
  try {
    envelope = JSON.parse(output.stdout) as RpcEnvelope<T>
  } catch {
    throw new Error(`Malformed RPC response for ${method}: ${output.stdout || output.stderr}`)
  }

  if (!envelope.ok) throw new Error(envelope.error)
  return envelope.data
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/cli-gui && bun test src/lib/__tests__/rpc.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/cli-gui/bunfig.toml apps/cli-gui/test-setup.ts apps/cli-gui/src/lib
git commit -m "feat(cli-gui): add frontend RPC client wrapping the aas sidecar"
```

---

### Task 5: App shell — TitleBar + Sidebar + agent-app switcher

**Files:**
- Create: `apps/cli-gui/src/components/TitleBar.tsx`
- Create: `apps/cli-gui/src/components/Sidebar.tsx`
- Create: `apps/cli-gui/src/state/AppState.tsx`
- Test: `apps/cli-gui/src/components/__tests__/Sidebar.test.tsx`
- Modify: `apps/cli-gui/src/App.tsx`

**Interfaces:**
- Produces:
  - `AppStateProvider` / `useAppState()` — `{ section: 'installed' | 'browse' | 'updates' | 'favorites', setSection, agentApp: 'claude' | 'codex', setAgentApp }`.
  - `TitleBar` — renders the macOS-style bar with centered "Agent Store CLI" title.
  - `Sidebar` — nav buttons for the four sections + agent-app switcher buttons for Claude Code / Codex.

- [ ] **Step 1: Implement `AppState.tsx`** (no test — trivial context, exercised indirectly by `Sidebar.test.tsx`)

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react'

export type Section = 'installed' | 'browse' | 'updates' | 'favorites'
export type AgentApp = 'claude' | 'codex'

interface AppStateValue {
  section: Section
  setSection: (s: Section) => void
  agentApp: AgentApp
  setAgentApp: (a: AgentApp) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [section, setSection] = useState<Section>('installed')
  const [agentApp, setAgentApp] = useState<AgentApp>('claude')

  return (
    <AppStateContext.Provider value={{ section, setSection, agentApp, setAgentApp }}>
      {children}
    </AppStateContext.Provider>
  )
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
```

- [ ] **Step 2: Write the failing test for `Sidebar`**

Create `apps/cli-gui/src/components/__tests__/Sidebar.test.tsx`:

```tsx
import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { Sidebar } from '../Sidebar'

afterEach(() => { cleanup() })

function SectionProbe() {
  const { section, agentApp } = useAppState()
  return <span data-testid="probe">{section}:{agentApp}</span>
}

function renderSidebar() {
  return render(
    <AppStateProvider>
      <Sidebar />
      <SectionProbe />
    </AppStateProvider>
  )
}

test('defaults to installed section and claude app', () => {
  renderSidebar()
  expect(screen.getByTestId('probe').textContent).toBe('installed:claude')
})

test('clicking 浏览 switches to the browse section', () => {
  renderSidebar()
  fireEvent.click(screen.getByText('浏览'))
  expect(screen.getByTestId('probe').textContent).toBe('browse:claude')
})

test('clicking Codex switches the agent-app switcher', () => {
  renderSidebar()
  fireEvent.click(screen.getByText('Codex'))
  expect(screen.getByTestId('probe').textContent).toBe('installed:codex')
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Sidebar.test.tsx`
Expected: FAIL — `Cannot find module '../Sidebar'`

- [ ] **Step 4: Implement `Sidebar.tsx`**

```tsx
import { Download, Compass, RefreshCw, Heart } from 'lucide-react'
import { useAppState, type Section } from '../state/AppState'

const SECTIONS: { value: Section; label: string; icon: typeof Download }[] = [
  { value: 'installed', label: '已安装', icon: Download },
  { value: 'browse', label: '浏览', icon: Compass },
  { value: 'updates', label: '更新', icon: RefreshCw },
  { value: 'favorites', label: '收藏', icon: Heart },
]

export function Sidebar() {
  const { section, setSection, agentApp, setAgentApp } = useAppState()

  return (
    <aside className="flex w-56 flex-col gap-4 border-r border-store-border bg-store-sidebar p-4">
      <nav className="flex flex-col gap-1">
        {SECTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setSection(value)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              section === value ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2 hover:text-store-text'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex gap-1 rounded-lg border border-store-border bg-store-panel p-1">
        <button
          type="button"
          onClick={() => setAgentApp('claude')}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs ${
            agentApp === 'claude' ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'
          }`}
        >
          Claude Code
        </button>
        <button
          type="button"
          onClick={() => setAgentApp('codex')}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs ${
            agentApp === 'codex' ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'
          }`}
        >
          Codex
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 5: Implement `TitleBar.tsx`**

```tsx
export function TitleBar() {
  return (
    <div className="relative flex h-10 shrink-0 items-center border-b border-store-border bg-store-chrome px-4">
      <div className="flex gap-2">
        <span className="h-3 w-3 rounded-full bg-store-red" />
        <span className="h-3 w-3 rounded-full bg-store-amber" />
        <span className="h-3 w-3 rounded-full bg-store-green" />
      </div>
      <p className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold text-store-text-2">
        Agent Store CLI
      </p>
    </div>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Sidebar.test.tsx`
Expected: all tests PASS.

- [ ] **Step 7: Wire the shell into `App.tsx`**

```tsx
import { AppStateProvider } from './state/AppState'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'

export function App() {
  return (
    <AppStateProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-store-border-strong bg-store-win text-store-text">
        <TitleBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6">
            <p className="font-mono text-sm text-store-text-2">section content goes here (Task 6+)</p>
          </main>
        </div>
      </div>
    </AppStateProvider>
  )
}
```

- [ ] **Step 8: Run the full suite + type-check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add apps/cli-gui/src/state apps/cli-gui/src/components/TitleBar.tsx apps/cli-gui/src/components/Sidebar.tsx \
  apps/cli-gui/src/components/__tests__/Sidebar.test.tsx apps/cli-gui/src/App.tsx
git commit -m "feat(cli-gui): add TitleBar, Sidebar, and app state (section + agent-app switcher)"
```

---

### Task 6: Terminal log store + `TerminalPane`

**Files:**
- Create: `apps/cli-gui/src/state/TerminalLog.tsx`
- Create: `apps/cli-gui/src/components/TerminalPane.tsx`
- Test: `apps/cli-gui/src/state/__tests__/TerminalLog.test.tsx`
- Test: `apps/cli-gui/src/components/__tests__/TerminalPane.test.tsx`

**Interfaces:**
- Produces:
  - `TerminalLogProvider` / `useTerminalLog()` — `{ lines: { text: string; color: 'default' | 'green' | 'red' }[], appendLine: (text: string, color?: 'default' | 'green' | 'red') => void }`.
  - `TerminalPane` — renders `lines` in a monospace scroll pane, color-coded.

- [ ] **Step 1: Write the failing test for `TerminalLog`**

Create `apps/cli-gui/src/state/__tests__/TerminalLog.test.tsx`:

```tsx
import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TerminalLogProvider, useTerminalLog } from '../TerminalLog'

afterEach(() => { cleanup() })

function Probe() {
  const { lines, appendLine } = useTerminalLog()
  return (
    <div>
      <button onClick={() => appendLine('$ aas install openai-provider')}>cmd</button>
      <button onClick={() => appendLine('✓ 已安装', 'green')}>ok</button>
      <ul>
        {lines.map((l, i) => <li key={i} data-color={l.color}>{l.text}</li>)}
      </ul>
    </div>
  )
}

test('appendLine adds a line with default color', () => {
  render(<TerminalLogProvider><Probe /></TerminalLogProvider>)
  fireEvent.click(screen.getByText('cmd'))
  expect(screen.getByText('$ aas install openai-provider')).toBeInTheDocument()
})

test('appendLine supports a color override', () => {
  render(<TerminalLogProvider><Probe /></TerminalLogProvider>)
  fireEvent.click(screen.getByText('ok'))
  expect(screen.getByText('✓ 已安装').getAttribute('data-color')).toBe('green')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/state/__tests__/TerminalLog.test.tsx`
Expected: FAIL — `Cannot find module '../TerminalLog'`

- [ ] **Step 3: Implement `TerminalLog.tsx`**

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react'

export type LineColor = 'default' | 'green' | 'red'

export interface TerminalLine {
  text: string
  color: LineColor
}

interface TerminalLogValue {
  lines: TerminalLine[]
  appendLine: (text: string, color?: LineColor) => void
}

const TerminalLogContext = createContext<TerminalLogValue | null>(null)

export function TerminalLogProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<TerminalLine[]>([])

  function appendLine(text: string, color: LineColor = 'default') {
    setLines((prev) => [...prev, { text, color }])
  }

  return (
    <TerminalLogContext.Provider value={{ lines, appendLine }}>
      {children}
    </TerminalLogContext.Provider>
  )
}

export function useTerminalLog(): TerminalLogValue {
  const ctx = useContext(TerminalLogContext)
  if (!ctx) throw new Error('useTerminalLog must be used within TerminalLogProvider')
  return ctx
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/cli-gui && bun test src/state/__tests__/TerminalLog.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Write the failing test for `TerminalPane`**

Create `apps/cli-gui/src/components/__tests__/TerminalPane.test.tsx`:

```tsx
import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { TerminalLogProvider, useTerminalLog } from '../../state/TerminalLog'
import { TerminalPane } from '../TerminalPane'

afterEach(() => { cleanup() })

function Seed({ children }: { children: React.ReactNode }) {
  const { appendLine } = useTerminalLog()
  appendLine('$ aas install openai-provider')
  appendLine('✓ 已安装 openai-provider 1.2.0', 'green')
  return <>{children}</>
}

test('renders all appended lines', () => {
  render(
    <TerminalLogProvider>
      <Seed>
        <TerminalPane />
      </Seed>
    </TerminalLogProvider>
  )
  expect(screen.getByText('$ aas install openai-provider')).toBeInTheDocument()
  expect(screen.getByText('✓ 已安装 openai-provider 1.2.0')).toBeInTheDocument()
})

test('renders an empty pane with no lines', () => {
  const { container } = render(
    <TerminalLogProvider>
      <TerminalPane />
    </TerminalLogProvider>
  )
  expect(container.querySelectorAll('[data-terminal-line]')).toHaveLength(0)
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/TerminalPane.test.tsx`
Expected: FAIL — `Cannot find module '../TerminalPane'`

- [ ] **Step 7: Implement `TerminalPane.tsx`**

```tsx
import { useTerminalLog, type LineColor } from '../state/TerminalLog'

const COLOR_CLASS: Record<LineColor, string> = {
  default: 'text-store-text-2',
  green: 'text-store-green',
  red: 'text-store-red',
}

export function TerminalPane() {
  const { lines } = useTerminalLog()

  return (
    <div className="h-40 shrink-0 overflow-y-auto border-t border-store-border bg-black p-3 font-mono text-xs">
      {lines.map((line, i) => (
        <div key={i} data-terminal-line className={COLOR_CLASS[line.color]}>
          {line.text}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/cli-gui && bun test src/components/__tests__/TerminalPane.test.tsx`
Expected: all tests PASS.

- [ ] **Step 9: Wire `TerminalLogProvider` + `TerminalPane` into `App.tsx`**

```tsx
import { TerminalLogProvider } from './state/TerminalLog'
import { TerminalPane } from './components/TerminalPane'
```

```tsx
    <AppStateProvider>
      <TerminalLogProvider>
        <div className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-store-border-strong bg-store-win text-store-text">
          <TitleBar />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-6">
              <p className="font-mono text-sm text-store-text-2">section content goes here (Task 7+)</p>
            </main>
          </div>
          <TerminalPane />
        </div>
      </TerminalLogProvider>
    </AppStateProvider>
```

- [ ] **Step 10: Run the full suite + type-check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add apps/cli-gui/src/state/TerminalLog.tsx apps/cli-gui/src/state/__tests__/TerminalLog.test.tsx \
  apps/cli-gui/src/components/TerminalPane.tsx apps/cli-gui/src/components/__tests__/TerminalPane.test.tsx apps/cli-gui/src/App.tsx
git commit -m "feat(cli-gui): add terminal log store and TerminalPane"
```

---

### Task 7: `InstalledList` (list / enable / disable / uninstall via RPC)

**Files:**
- Create: `apps/cli-gui/src/components/InstalledList.tsx`
- Test: `apps/cli-gui/src/components/__tests__/InstalledList.test.tsx`
- Modify: `apps/cli-gui/src/App.tsx`

**Interfaces:**
- Consumes: `callRpc` (Task 4), `useAppState()` (Task 5, for `agentApp`), `useTerminalLog()` (Task 6).
- Produces: `InstalledList` — fetches `list` on mount, renders rows with an enable/disable toggle for the current `agentApp` and an uninstall button; every action appends a terminal log line.

- [ ] **Step 1: Write the failing test**

Create `apps/cli-gui/src/components/__tests__/InstalledList.test.tsx`:

```tsx
import { test, expect, afterEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AppStateProvider } from '../../state/AppState'
import { TerminalLogProvider, useTerminalLog } from '../../state/TerminalLog'

afterEach(() => { cleanup(); mock.restore() })

const listResult = [
  {
    slug: 'openai-provider', category: 'provider', version: '1.2.0',
    installedAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
    compatibleWith: ['claude', 'codex'], enabledFor: { claude: true, codex: false },
  },
]

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  mock.module('../../lib/rpc', () => ({
    callRpc: async (method: string, args: unknown[] = []) => handlers[method]?.(...args),
  }))
}

function TerminalProbe() {
  const { lines } = useTerminalLog()
  return <div data-testid="log-count">{lines.length}</div>
}

async function renderList() {
  const { InstalledList } = await import('../InstalledList')
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <InstalledList />
        <TerminalProbe />
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

test('fetches and renders installed items on mount', async () => {
  mockRpc({ list: () => listResult })
  await renderList()
  await waitFor(() => expect(screen.getByText('openai-provider')).toBeInTheDocument())
  expect(screen.getByText('1.2.0')).toBeInTheDocument()
})

test('clicking uninstall calls the uninstall RPC and logs a line', async () => {
  const uninstall = mock(() => undefined)
  mockRpc({ list: () => listResult, uninstall })
  await renderList()
  await waitFor(() => screen.getByText('openai-provider'))
  fireEvent.click(screen.getByText('卸载'))
  await waitFor(() => expect(uninstall).toHaveBeenCalledWith('openai-provider'))
  expect(screen.getByTestId('log-count').textContent).not.toBe('0')
})

test('toggling enable for the active agent app calls enable/disable', async () => {
  const disable = mock(() => undefined)
  mockRpc({ list: () => listResult, disable })
  await renderList()
  await waitFor(() => screen.getByText('openai-provider'))
  fireEvent.click(screen.getByLabelText('为 claude 禁用 openai-provider'))
  await waitFor(() => expect(disable).toHaveBeenCalledWith('openai-provider', 'claude'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/InstalledList.test.tsx`
Expected: FAIL — `Cannot find module '../InstalledList'`

- [ ] **Step 3: Implement `InstalledList.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { InstalledItem, ToolTarget } from '@aas/types'
import { callRpc } from '../lib/rpc'
import { useAppState } from '../state/AppState'
import { useTerminalLog } from '../state/TerminalLog'

export function InstalledList() {
  const { agentApp } = useAppState()
  const { appendLine } = useTerminalLog()
  const [items, setItems] = useState<InstalledItem[]>([])

  async function refresh() {
    const result = await callRpc<InstalledItem[]>('list')
    setItems(result)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggleEnabled(item: InstalledItem, target: ToolTarget) {
    const isEnabled = !!item.enabledFor[target]
    appendLine(`$ aas ${isEnabled ? 'disable' : 'enable'} ${item.slug} --for ${target}`)
    try {
      await callRpc(isEnabled ? 'disable' : 'enable', [item.slug, target])
      appendLine(`✓ ${item.slug} ${isEnabled ? '已禁用' : '已启用'} (${target})`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    refresh()
  }

  async function uninstall(item: InstalledItem) {
    appendLine(`$ aas uninstall ${item.slug}`)
    try {
      await callRpc('uninstall', [item.slug])
      appendLine(`✓ 已卸载 ${item.slug}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const enabled = !!item.enabledFor[agentApp]
        return (
          <div
            key={item.slug}
            className="flex items-center justify-between rounded-lg border border-store-border bg-store-panel px-3 py-2"
          >
            <div>
              <p className="text-sm text-store-text">{item.slug}</p>
              <p className="text-xs text-store-text-3">{item.version}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label={`为 ${agentApp} ${enabled ? '禁用' : '启用'} ${item.slug}`}
                onClick={() => toggleEnabled(item, agentApp)}
                className={`rounded-md px-2 py-1 text-xs ${
                  enabled ? 'bg-store-green/10 text-store-green' : 'bg-store-panel-2 text-store-text-2'
                }`}
              >
                {enabled ? '已启用' : '已禁用'}
              </button>
              <button
                type="button"
                onClick={() => uninstall(item)}
                className="text-xs text-store-red hover:opacity-80"
              >
                卸载
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/cli-gui && bun test src/components/__tests__/InstalledList.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Render `InstalledList` when `section === 'installed'` in `App.tsx`**

```tsx
import { useAppState } from './state/AppState'
import { InstalledList } from './components/InstalledList'
```

Replace the placeholder `<main>` content with:

```tsx
            <main className="flex-1 overflow-y-auto p-6">
              <SectionContent />
            </main>
```

Add the small dispatcher (in the same file, above `App`):

```tsx
function SectionContent() {
  const { section } = useAppState()
  if (section === 'installed') return <InstalledList />
  return <p className="font-mono text-sm text-store-text-2">section content goes here (Task 8+)</p>
}
```

- [ ] **Step 6: Run the full suite + type-check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/cli-gui/src/components/InstalledList.tsx apps/cli-gui/src/components/__tests__/InstalledList.test.tsx apps/cli-gui/src/App.tsx
git commit -m "feat(cli-gui): add InstalledList wired to list/enable/disable/uninstall RPCs"
```

---

### Task 8: `BrowseList` + seed data alignment with the Web Store mock catalog

**Files:**
- Create: `apps/cli-gui/src/components/BrowseList.tsx`
- Test: `apps/cli-gui/src/components/__tests__/BrowseList.test.tsx`
- Modify: `supabase/seed.sql`
- Modify: `apps/cli-gui/src/App.tsx`

**Interfaces:**
- Consumes: `callRpc('search', [query])` → `Item[]` (from `@aas/types`, via the real `AASClient` → market API → Supabase path).
- Produces: `BrowseList` — a search box + result list, each row with an "安装" button calling `callRpc('install', [slug])`.

- [ ] **Step 1: Write the failing test**

Create `apps/cli-gui/src/components/__tests__/BrowseList.test.tsx`:

```tsx
import { test, expect, afterEach, mock, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { TerminalLogProvider } from '../../state/TerminalLog'

beforeEach(() => { mock.restore() })
afterEach(() => { cleanup() })

const searchResult = [{
  id: 'item-1', slug: 'openai-provider', name: 'OpenAI Provider', description: 'GPT-4o',
  readmeUrl: '', icon: '', category: 'provider', version: '1.2.0',
  publisher: { id: 'p', slug: 'openai', name: 'OpenAI', avatarUrl: '', tier: 'official' },
  compatibleWith: ['claude'], tags: [], downloads: 10, rating: 4.5,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  configSchema: {}, supportedModels: ['gpt-4o'],
}]

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  mock.module('../../lib/rpc', () => ({
    callRpc: async (method: string, args: unknown[] = []) => handlers[method]?.(...args),
  }))
}

async function renderBrowse() {
  const { BrowseList } = await import('../BrowseList')
  return render(
    <TerminalLogProvider>
      <BrowseList />
    </TerminalLogProvider>
  )
}

test('searching renders matching results', async () => {
  mockRpc({ search: () => searchResult })
  await renderBrowse()
  fireEvent.change(screen.getByPlaceholderText('搜索资源…'), { target: { value: 'openai' } })
  fireEvent.submit(screen.getByRole('search'))
  await waitFor(() => expect(screen.getByText('OpenAI Provider')).toBeInTheDocument())
})

test('clicking install calls the install RPC', async () => {
  const install = mock(() => ({ slug: 'openai-provider', version: '1.2.0', installedAt: '2026-01-01T00:00:00Z' }))
  mockRpc({ search: () => searchResult, install })
  await renderBrowse()
  fireEvent.change(screen.getByPlaceholderText('搜索资源…'), { target: { value: 'openai' } })
  fireEvent.submit(screen.getByRole('search'))
  await waitFor(() => screen.getByText('OpenAI Provider'))
  fireEvent.click(screen.getByText('安装'))
  await waitFor(() => expect(install).toHaveBeenCalledWith('openai-provider'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/BrowseList.test.tsx`
Expected: FAIL — `Cannot find module '../BrowseList'`

- [ ] **Step 3: Implement `BrowseList.tsx`**

```tsx
import { useState, type FormEvent } from 'react'
import type { Item } from '@aas/types'
import { callRpc } from '../lib/rpc'
import { useTerminalLog } from '../state/TerminalLog'

export function BrowseList() {
  const { appendLine } = useTerminalLog()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Item[]>([])

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    const items = await callRpc<Item[]>('search', [query])
    setResults(items)
  }

  async function install(item: Item) {
    appendLine(`$ aas install ${item.slug}`)
    try {
      const result = await callRpc<{ version: string }>('install', [item.slug])
      appendLine(`✓ 已安装 ${item.slug} ${result.version}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form role="search" onSubmit={handleSearch}>
        <input
          type="search"
          placeholder="搜索资源…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
        />
      </form>

      <div className="flex flex-col gap-2">
        {results.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-store-border bg-store-panel px-3 py-2"
          >
            <div>
              <p className="text-sm text-store-text">{item.name}</p>
              <p className="text-xs text-store-text-3">{item.description}</p>
            </div>
            <button
              type="button"
              onClick={() => install(item)}
              className="rounded-md bg-store-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              安装
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/cli-gui && bun test src/components/__tests__/BrowseList.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Align `supabase/seed.sql` with the Web Store mock catalog**

Read `supabase/seed.sql` first to match its existing `INSERT` style (publishers/items tables, column names, JSONB metadata shape from `apps/market/lib/db-types.ts`'s `DBItem`/`DBPublisher`). Add or replace rows so the seeded catalog's `slug`/`name`/`description`/`category` values match `apps/market/lib/mock/items.ts`'s `MOCK_ITEMS` (Web Store plan Task 3) one-for-one — same publishers, same 7 items, same `configSchema`/`supportedModels`/`transport`/`serverCommand`/`url` metadata per category. This keeps the GUI's "浏览" results (which hit the real seeded Supabase instance through `search`) visually consistent with what the Web Store shows from its static mock module.

- [ ] **Step 6: Render `BrowseList` when `section === 'browse'`**

Edit `apps/cli-gui/src/App.tsx`:

```tsx
import { BrowseList } from './components/BrowseList'
```

```tsx
function SectionContent() {
  const { section } = useAppState()
  if (section === 'installed') return <InstalledList />
  if (section === 'browse') return <BrowseList />
  return <p className="font-mono text-sm text-store-text-2">section content goes here (Task 9+)</p>
}
```

- [ ] **Step 7: Run the full suite + type-check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/cli-gui/src/components/BrowseList.tsx apps/cli-gui/src/components/__tests__/BrowseList.test.tsx \
  apps/cli-gui/src/App.tsx supabase/seed.sql
git commit -m "feat(cli-gui): add BrowseList, align seed data with Web Store mock catalog"
```

---

### Task 9: `ProviderEditModal`

**Files:**
- Create: `apps/cli-gui/src/components/ProviderEditModal.tsx`
- Test: `apps/cli-gui/src/components/__tests__/ProviderEditModal.test.tsx`
- Modify: `apps/cli-gui/src/components/InstalledList.tsx`
- Modify: `apps/cli-gui/package.json`

**Interfaces:**
- Consumes: `callRpc('getConfigSchema', [slug])` → `{ schema: JsonSchema; current: Record<string, unknown> }`; `callRpc('setConfig', [slug, values])`.
- Produces: `ProviderEditModal({ slug: string, open: boolean, onOpenChange: (open: boolean) => void })` — renders one text input per schema property, pre-filled from `current`, saves via `setConfig` on submit.

- [ ] **Step 1: Add `@radix-ui/react-dialog` to `apps/cli-gui/package.json`**

```json
    "@radix-ui/react-dialog": "^1.1.1",
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

Create `apps/cli-gui/src/components/__tests__/ProviderEditModal.test.tsx`:

```tsx
import { test, expect, afterEach, beforeEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

beforeEach(() => { mock.restore() })
afterEach(() => { cleanup() })

const schema = {
  properties: {
    apiKey: { type: 'string', description: 'API Key' },
    baseUrl: { type: 'string', description: 'Base URL', default: 'https://api.openai.com' },
  },
  required: ['apiKey'],
}

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  mock.module('../../lib/rpc', () => ({
    callRpc: async (method: string, args: unknown[] = []) => handlers[method]?.(...args),
  }))
}

async function renderModal(onOpenChange = () => {}) {
  const { ProviderEditModal } = await import('../ProviderEditModal')
  return render(<ProviderEditModal slug="openai-provider" open onOpenChange={onOpenChange} />)
}

test('renders one field per schema property, pre-filled from current config', async () => {
  mockRpc({ getConfigSchema: () => ({ schema, current: { apiKey: 'sk-test' } }) })
  await renderModal()
  await waitFor(() => expect(screen.getByLabelText('API Key')).toBeInTheDocument())
  expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe('sk-test')
  expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe('https://api.openai.com')
})

test('saving calls setConfig with the edited values and closes', async () => {
  const setConfig = mock(() => undefined)
  mockRpc({ getConfigSchema: () => ({ schema, current: { apiKey: 'sk-test' } }), setConfig })
  const onOpenChange = mock(() => {})
  await renderModal(onOpenChange)
  await waitFor(() => screen.getByLabelText('API Key'))
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-new' } })
  fireEvent.click(screen.getByText('保存'))
  await waitFor(() => expect(setConfig).toHaveBeenCalledWith('openai-provider', {
    apiKey: 'sk-new',
    baseUrl: 'https://api.openai.com',
  }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/ProviderEditModal.test.tsx`
Expected: FAIL — `Cannot find module '../ProviderEditModal'`

- [ ] **Step 4: Implement `ProviderEditModal.tsx`**

```tsx
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import type { JsonSchema } from '@aas/types'
import { X } from 'lucide-react'
import { callRpc } from '../lib/rpc'

interface ProviderEditModalProps {
  slug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SchemaProperty {
  type?: string
  description?: string
  default?: unknown
}

export function ProviderEditModal({ slug, open, onOpenChange }: ProviderEditModalProps) {
  const [properties, setProperties] = useState<Record<string, SchemaProperty>>({})
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    callRpc<{ schema: JsonSchema; current: Record<string, unknown> }>('getConfigSchema', [slug]).then(
      ({ schema, current }) => {
        const props = (schema as { properties?: Record<string, SchemaProperty> }).properties ?? {}
        setProperties(props)
        const initial: Record<string, string> = {}
        for (const [key, prop] of Object.entries(props)) {
          initial[key] = String(current[key] ?? prop.default ?? '')
        }
        setValues(initial)
      }
    )
  }, [open, slug])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    await callRpc('setConfig', [slug, values])
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-store-border bg-store-content p-6">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-store-text">编辑 {slug}</Dialog.Title>
            <Dialog.Close aria-label="关闭" className="text-store-text-2 hover:text-store-text">
              <X size={18} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSave} className="flex flex-col gap-3">
            {Object.entries(properties).map(([key, prop]) => (
              <div key={key}>
                <label htmlFor={`provider-${key}`} className="mb-1 block text-xs font-medium text-store-text-2">
                  {prop.description ?? key}
                </label>
                <input
                  id={`provider-${key}`}
                  value={values[key] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                />
              </div>
            ))}

            <button
              type="submit"
              className="mt-2 rounded-lg bg-store-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              保存
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/cli-gui && bun test src/components/__tests__/ProviderEditModal.test.tsx`
Expected: all tests PASS.

- [ ] **Step 6: Add a "配置" trigger button to `InstalledList` for provider items**

Edit `apps/cli-gui/src/components/InstalledList.tsx`:

```tsx
import { useState } from 'react'
import { ProviderEditModal } from './ProviderEditModal'
```

Add state and a button, only for `item.category === 'provider'`:

```tsx
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
```

Inside the row's button group, before the uninstall button:

```tsx
              {item.category === 'provider' && (
                <button
                  type="button"
                  onClick={() => setEditingSlug(item.slug)}
                  className="text-xs text-store-text-2 hover:text-store-text"
                >
                  配置
                </button>
              )}
```

After the `.map(...)` closing, render the modal once:

```tsx
      {editingSlug && (
        <ProviderEditModal slug={editingSlug} open onOpenChange={(open) => { if (!open) setEditingSlug(null) }} />
      )}
```

- [ ] **Step 7: Run the full suite + type-check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/cli-gui/package.json apps/cli-gui/src/components/ProviderEditModal.tsx \
  apps/cli-gui/src/components/__tests__/ProviderEditModal.test.tsx apps/cli-gui/src/components/InstalledList.tsx
git commit -m "feat(cli-gui): add ProviderEditModal wired to getConfigSchema/setConfig RPCs"
```

---

### Task 10: `SettingsModal` + local-only favorites/log persistence

**Files:**
- Create: `apps/cli-gui/src/components/SettingsModal.tsx`
- Create: `apps/cli-gui/src/state/LocalPersistence.ts`
- Test: `apps/cli-gui/src/components/__tests__/SettingsModal.test.tsx`
- Test: `apps/cli-gui/src/state/__tests__/LocalPersistence.test.ts`
- Modify: `apps/cli-gui/src/App.tsx`
- Modify: `apps/cli-gui/package.json`

**Interfaces:**
- Produces:
  - `SettingsModal({ open, onOpenChange })` — tabs "account" (static logged-in-state display, no auth calls) and "language" (zh/en enabled, ja/ko/es shown disabled).
  - `readLocalState<T>(key: string, fallback: T): Promise<T>` / `writeLocalState<T>(key: string, value: T): Promise<void>` — thin wrapper over `@tauri-apps/plugin-fs`'s app-data-dir JSON file, used for favorites (added to `InstalledList`'s data model is out of scope here — this task only ships the persistence primitive + settings UI, per the spec's "local-only state" section).

- [ ] **Step 1: Add `@tauri-apps/plugin-fs` to `apps/cli-gui/package.json`**

```json
    "@tauri-apps/plugin-fs": "^2.0.1",
```

Add the matching Rust crate to `apps/cli-gui/src-tauri/Cargo.toml`:

```toml
tauri-plugin-fs = "2"
```

Register it in `apps/cli-gui/src-tauri/src/main.rs`, alongside the shell plugin:

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
```

Add a filesystem capability, create `apps/cli-gui/src-tauri/capabilities/fs.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "fs-appdata",
  "description": "Allow reading/writing the app's local state file",
  "windows": ["main"],
  "permissions": [
    "fs:allow-app-write-recursive",
    "fs:allow-app-read-recursive"
  ]
}
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test for `LocalPersistence`**

Create `apps/cli-gui/src/state/__tests__/LocalPersistence.test.ts`:

```ts
import { test, expect, mock, afterEach } from 'bun:test'

afterEach(() => { mock.restore() })

function mockFs(existingContent: string | null) {
  const written: { path: string; content: string }[] = []
  mock.module('@tauri-apps/plugin-fs', () => ({
    exists: async () => existingContent !== null,
    readTextFile: async () => existingContent as string,
    writeTextFile: async (path: string, content: string) => {
      written.push({ path, content })
    },
    mkdir: async () => undefined,
    BaseDirectory: { AppData: 'AppData' },
  }))
  return written
}

test('readLocalState returns the fallback when no file exists', async () => {
  mockFs(null)
  const { readLocalState } = await import('../LocalPersistence')
  const result = await readLocalState('favorites', {})
  expect(result).toEqual({})
})

test('readLocalState parses existing JSON content', async () => {
  mockFs(JSON.stringify({ 'item-1': true }))
  const { readLocalState } = await import('../LocalPersistence')
  const result = await readLocalState<Record<string, boolean>>('favorites', {})
  expect(result).toEqual({ 'item-1': true })
})

test('writeLocalState serializes the value to JSON', async () => {
  const written = mockFs(null)
  const { writeLocalState } = await import('../LocalPersistence')
  await writeLocalState('favorites', { 'item-1': true })
  expect(written).toHaveLength(1)
  expect(JSON.parse(written[0].content)).toEqual({ 'item-1': true })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/state/__tests__/LocalPersistence.test.ts`
Expected: FAIL — `Cannot find module '../LocalPersistence'`

- [ ] **Step 4: Implement `LocalPersistence.ts`**

```ts
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

const STATE_DIR = 'agent-store-cli'

function fileName(key: string): string {
  return `${STATE_DIR}/${key}.json`
}

export async function readLocalState<T>(key: string, fallback: T): Promise<T> {
  const path = fileName(key)
  const fileExists = await exists(path, { baseDir: BaseDirectory.AppData })
  if (!fileExists) return fallback
  const content = await readTextFile(path, { baseDir: BaseDirectory.AppData })
  return JSON.parse(content) as T
}

export async function writeLocalState<T>(key: string, value: T): Promise<void> {
  await mkdir(STATE_DIR, { baseDir: BaseDirectory.AppData, recursive: true })
  await writeTextFile(fileName(key), JSON.stringify(value), { baseDir: BaseDirectory.AppData })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/cli-gui && bun test src/state/__tests__/LocalPersistence.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Write the failing test for `SettingsModal`**

Create `apps/cli-gui/src/components/__tests__/SettingsModal.test.tsx`:

```tsx
import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SettingsModal } from '../SettingsModal'

afterEach(() => { cleanup() })

test('defaults to the account tab', () => {
  render(<SettingsModal open onOpenChange={() => {}} />)
  expect(screen.getByText('未登录')).toBeInTheDocument()
})

test('switching to the language tab shows zh/en enabled and others disabled', () => {
  render(<SettingsModal open onOpenChange={() => {}} />)
  fireEvent.click(screen.getByText('语言'))
  expect(screen.getByText('中文')).toBeInTheDocument()
  expect(screen.getByText('English')).toBeInTheDocument()
  const japaneseOption = screen.getByText('日本語（即将支持）')
  expect(japaneseOption.closest('button')).toBeDisabled()
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/SettingsModal.test.tsx`
Expected: FAIL — `Cannot find module '../SettingsModal'`

- [ ] **Step 8: Implement `SettingsModal.tsx`**

```tsx
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { X } from 'lucide-react'

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Tab = 'account' | 'language'

const LANGUAGES = [
  { code: 'zh', label: '中文', enabled: true },
  { code: 'en', label: 'English', enabled: true },
  { code: 'ja', label: '日本語（即将支持）', enabled: false },
  { code: 'ko', label: '한국어（即将支持）', enabled: false },
  { code: 'es', label: 'Español（即将支持）', enabled: false },
]

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('account')

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-store-border bg-store-content p-6">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-store-text">设置</Dialog.Title>
            <Dialog.Close aria-label="关闭" className="text-store-text-2 hover:text-store-text">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setTab('account')}
              className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'account' ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'}`}
            >
              账户
            </button>
            <button
              type="button"
              onClick={() => setTab('language')}
              className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'language' ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'}`}
            >
              语言
            </button>
          </div>

          {tab === 'account' && <p className="text-sm text-store-text-2">未登录</p>}

          {tab === 'language' && (
            <div className="flex flex-col gap-1">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  disabled={!lang.enabled}
                  className="rounded-lg px-3 py-2 text-left text-sm text-store-text disabled:cursor-not-allowed disabled:text-store-text-3"
                >
                  {lang.label}
                </button>
              ))}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd apps/cli-gui && bun test src/components/__tests__/SettingsModal.test.tsx`
Expected: all tests PASS.

- [ ] **Step 10: Wire a settings trigger into `Sidebar.tsx`**

Edit `apps/cli-gui/src/components/Sidebar.tsx` — add state and a bottom "设置" button, and render `SettingsModal`:

```tsx
import { useState } from 'react'
import { SettingsModal } from './SettingsModal'
```

```tsx
  const [settingsOpen, setSettingsOpen] = useState(false)
```

Add below the agent-app switcher `div`, still inside `<aside>`:

```tsx
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="rounded-lg px-3 py-2 text-left text-sm text-store-text-2 hover:text-store-text"
      >
        设置
      </button>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
```

- [ ] **Step 11: Run the full suite + type-check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add apps/cli-gui/package.json apps/cli-gui/src-tauri/Cargo.toml apps/cli-gui/src-tauri/src/main.rs \
  apps/cli-gui/src-tauri/capabilities/fs.json apps/cli-gui/src/state/LocalPersistence.ts \
  apps/cli-gui/src/state/__tests__/LocalPersistence.test.ts apps/cli-gui/src/components/SettingsModal.tsx \
  apps/cli-gui/src/components/__tests__/SettingsModal.test.tsx apps/cli-gui/src/components/Sidebar.tsx
git commit -m "feat(cli-gui): add SettingsModal (account/language) and local JSON persistence primitive"
```

---

### Task 11: Final integration pass — isolated-environment verification

**Files:** none created — verification only.

**Interfaces:** none new.

- [ ] **Step 1: Run every workspace test suite**

Run (repo root): `pnpm turbo run test`
Expected: all packages pass, including the new `apps/cli` `__rpc` tests and all `apps/cli-gui` component tests.

- [ ] **Step 2: Type-check and lint everything**

Run: `pnpm turbo run type-check lint`
Expected: no errors.

- [ ] **Step 3: Build the sidecar and the Tauri app**

Run: `cd apps/cli-gui && bun run build:sidecar && pnpm exec tauri build --debug`
Expected: produces a debug app bundle without errors (release signing/notarization is out of scope for local verification).

- [ ] **Step 4: Verify the `__rpc` subcommand against a real, isolated engine (no Docker needed — mirrors the existing `engine.test.ts` pattern)**

Run this from the repo root to exercise the compiled sidecar binary end-to-end against throwaway directories instead of `~/.claude`/`~/.codex`/`~/.agents`:

```bash
export AAS_HOME="$(mktemp -d)"
export CLAUDE_CONFIG_DIR="$(mktemp -d)"
export CODEX_CONFIG_DIR="$(mktemp -d)"
./apps/cli-gui/src-tauri/binaries/aas-$(rustc -vV | sed -n 's/^host: //p') __rpc list '[]'
```

Expected: prints `{"ok":true,"data":[]}` — confirms the sidecar binary runs standalone and never touches the real home directory (the exported env vars point at throwaway `mktemp -d` paths, which are safe to delete afterward).

- [ ] **Step 5: Optional full end-to-end check via the existing Docker fixture**

If a deeper check against a real Claude/Codex config layout is wanted (not required for this plan to be considered complete), extend `scripts/docker-agent-package-fixture.sh` / `docker/agent-package-fixture.Dockerfile` with an additional `RUN`/`CMD` step that copies the built sidecar binary into the image and runs the same `__rpc list` check inside the container — the Dockerfile already sets `AAS_HOME=/root/.aas`, `CLAUDE_CONFIG_DIR=/root/.claude`, `CODEX_CONFIG_DIR=/root/.codex` as container-local paths, so nothing on the host machine is touched. This is a manual, on-demand check — not part of the automated test suite.

- [ ] **Step 6: Manual smoke test of the GUI**

Run: `cd apps/cli-gui && pnpm exec tauri dev`
With the env vars from Step 4 still exported in the same shell (so the dev-mode sidecar also stays isolated from the real home directory), confirm: the window opens with TitleBar/Sidebar/TerminalPane; clicking "浏览", searching, and clicking "安装" on a result logs lines to the terminal pane and the item appears under "已安装" after switching sections; clicking "配置" on a provider item opens `ProviderEditModal` with fields from its schema; clicking "设置" opens `SettingsModal` with disabled non-zh/en languages.

- [ ] **Step 7: Commit any fixes found during verification**

```bash
git add -A
git commit -m "fix(cli-gui): address findings from isolated-environment integration verification"
```
