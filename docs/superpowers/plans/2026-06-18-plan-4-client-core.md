# apps/client-core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/client-core` — the TypeScript engine library that manages `~/.agents/`, installs/uninstalls AI tools by executing InstallHooks, syncs enabled items to Claude/Codex configs, and exposes the `AASEngine` interface from `@aas/types` for the CLI (Plan 5) to consume.

**Architecture:** Six focused modules — registry (reads/writes `~/.agents/registry.json`), installer (runs `InstallHook.steps` + category post-processing), config/claude and config/codex (sync to tool configs), updater (checks/applies market version updates), and engine (orchestrates everything, implements the `AASEngine` interface). All filesystem paths are overridable via constructor so tests run in isolated `/tmp` directories without touching real user files.

**Tech Stack:** TypeScript, Bun (runtime + test runner), `@aas/types` (shared interfaces), `@aas/sdk` (market API client), `js-yaml` (YAML read/write for Codex config)

## Global Constraints

- Package name `@aas/client-core`; `"private": true`; lives at `apps/client-core/`
- `tsconfig.json` extends `../../tsconfig.base.json`; add `"outDir": "./dist"`, `"composite": true`
- Test runner: `bun test`; test files at `src/**/__tests__/*.test.ts`
- All paths overridable: `AASPaths.aasHome`, `.claudeConfigDir`, `.codexConfigDir` — never hardcode `~/.agents` etc. inside logic
- Tests MUST create isolated tmp dirs via `mkdtemp('/tmp/aas-test-')` and remove them in `afterEach`; never touch real `~/.agents`, `~/.claude`, `~/.codex`
- Category subdirectory names: `providers/`, `skills/`, `mcps/` (plural)
- Manifest file = full market `Item` JSON, saved as `manifest.json` inside the item dir
- Config file = user-supplied values, saved as `config.json` inside the item dir (empty `{}` for provider/mcp initially)
- `registry.json` shape = `RegistryJson` from `@aas/types` (`{ installed: InstalledItem[] }`)
- `@aas/types` and `@aas/sdk` are workspace dependencies; `js-yaml` is a runtime dependency
- `AASEngine` interface is defined in `packages/types/src/engine.ts` — implement every method; no extra public methods

---

## File Map

```
apps/client-core/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # export { AASEngineImpl } + re-export @aas/types public types
    ├── engine.ts             # class AASEngineImpl implements AASEngine
    ├── paths.ts              # resolvePaths(), itemDir() helpers
    ├── api/
    │   └── index.ts          # re-export AASClient from @aas/sdk (thin pass-through)
    ├── registry/
    │   ├── index.ts          # readRegistry, writeRegistry, findEntry, upsertEntry, removeEntry
    │   └── __tests__/
    │       └── index.test.ts
    ├── installer/
    │   ├── hook-runner.ts    # runHook(steps, itemDir), writeManifest(itemDir, item)
    │   ├── provider.ts       # postInstall: write empty config.json if absent
    │   ├── skill.ts          # postInstall: no-op (extension point)
    │   ├── mcp.ts            # postInstall: chmod +x ./server if present
    │   └── __tests__/
    │       ├── hook-runner.test.ts
    │       └── category.test.ts
    ├── config/
    │   ├── claude.ts         # syncItemToClaude(slug, category, aasHome, claudeDir, action)
    │   ├── codex.ts          # syncItemToCodex(slug, category, aasHome, codexDir, action)
    │   └── __tests__/
    │       ├── claude.test.ts
    │       └── codex.test.ts
    └── updater/
        ├── index.ts          # checkUpdates(registry, client, slugs?), applyUpdate(slug, ...)
        └── __tests__/
            └── index.test.ts
```

---

## Task 1: Scaffold + Paths + Registry

**Files:**
- Create: `apps/client-core/package.json`
- Create: `apps/client-core/tsconfig.json`
- Create: `apps/client-core/src/paths.ts`
- Create: `apps/client-core/src/registry/index.ts`
- Create: `apps/client-core/src/registry/__tests__/index.test.ts`

**Interfaces:**
- Produces:
  - `resolvePaths(overrides?: Partial<AASPaths>): Required<AASPaths>` — merges env vars + overrides
  - `itemDir(aasHome, category, slug): string` — returns absolute item directory path
  - `readRegistry(aasHome: string): Promise<RegistryJson>` — returns `{ installed: [] }` when file absent
  - `writeRegistry(aasHome: string, registry: RegistryJson): Promise<void>` — creates dir if needed
  - `findEntry(registry, slug): InstalledItem | undefined`
  - `upsertEntry(registry, entry): RegistryJson` — pure (no mutation)
  - `removeEntry(registry, slug): RegistryJson` — pure (no mutation)

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@aas/client-core",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "type-check": "tsc --noEmit",
    "test": "bun test",
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "dependencies": {
    "@aas/sdk": "workspace:*",
    "@aas/types": "workspace:*",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/js-yaml": "^4.0.9",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "references": [
    { "path": "../../packages/types" },
    { "path": "../../packages/sdk" }
  ],
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd /Users/liushangliang/github/ai-agent-store
pnpm install
```

Expected: `js-yaml` and `@types/js-yaml` added to node_modules.

- [ ] **Step 4: Write `src/paths.ts`**

```typescript
import { homedir } from 'os'
import { join } from 'path'
import type { AASPaths } from '@aas/types'

export function resolvePaths(overrides?: Partial<AASPaths>): Required<AASPaths> {
  const home = homedir()
  return {
    aasHome: overrides?.aasHome ?? process.env['AAS_HOME'] ?? join(home, '.agents'),
    claudeConfigDir: overrides?.claudeConfigDir ?? process.env['CLAUDE_CONFIG_DIR'] ?? join(home, '.claude'),
    codexConfigDir: overrides?.codexConfigDir ?? process.env['CODEX_CONFIG_DIR'] ?? join(home, '.codex'),
  }
}

const CATEGORY_DIR: Record<string, string> = {
  provider: 'providers',
  skill: 'skills',
  mcp: 'mcps',
}

export function itemDir(
  aasHome: string,
  category: 'provider' | 'skill' | 'mcp',
  slug: string
): string {
  return join(aasHome, CATEGORY_DIR[category], slug)
}
```

- [ ] **Step 5: Write the failing registry tests**

```typescript
// src/registry/__tests__/index.test.ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { readRegistry, writeRegistry, findEntry, upsertEntry, removeEntry } from '../index'
import type { InstalledItem } from '@aas/types'

const entry: InstalledItem = {
  slug: 'test-provider',
  category: 'provider',
  version: '1.0.0',
  installedAt: '2026-06-18T00:00:00Z',
  updatedAt: '2026-06-18T00:00:00Z',
  compatibleWith: ['claude'],
  enabledFor: { claude: true },
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp('/tmp/aas-test-')
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

test('readRegistry returns empty registry when file absent', async () => {
  const reg = await readRegistry(tmpDir)
  expect(reg).toEqual({ installed: [] })
})

test('writeRegistry creates registry.json and readRegistry reads it back', async () => {
  await writeRegistry(tmpDir, { installed: [entry] })
  const reg = await readRegistry(tmpDir)
  expect(reg.installed).toHaveLength(1)
  expect(reg.installed[0].slug).toBe('test-provider')
})

test('upsertEntry adds new entry', () => {
  const reg = upsertEntry({ installed: [] }, entry)
  expect(reg.installed).toHaveLength(1)
  expect(reg.installed[0].slug).toBe('test-provider')
})

test('upsertEntry updates existing entry without duplicating', () => {
  const initial = { installed: [entry] }
  const updated = upsertEntry(initial, { ...entry, version: '2.0.0' })
  expect(updated.installed).toHaveLength(1)
  expect(updated.installed[0].version).toBe('2.0.0')
})

test('upsertEntry does not mutate the input', () => {
  const original = { installed: [entry] }
  upsertEntry(original, { ...entry, version: '2.0.0' })
  expect(original.installed[0].version).toBe('1.0.0')
})

test('removeEntry removes by slug', () => {
  const reg = removeEntry({ installed: [entry] }, 'test-provider')
  expect(reg.installed).toHaveLength(0)
})

test('removeEntry is a no-op for unknown slug', () => {
  const reg = removeEntry({ installed: [entry] }, 'unknown')
  expect(reg.installed).toHaveLength(1)
})

test('findEntry returns undefined for missing slug', () => {
  expect(findEntry({ installed: [] }, 'missing')).toBeUndefined()
})

test('findEntry returns matching entry', () => {
  expect(findEntry({ installed: [entry] }, 'test-provider')).toEqual(entry)
})
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
cd /Users/liushangliang/github/ai-agent-store/apps/client-core
bun test src/registry/__tests__/index.test.ts
```

Expected: `Cannot find module '../index'`

- [ ] **Step 7: Write `src/registry/index.ts`**

```typescript
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { RegistryJson, InstalledItem } from '@aas/types'

export async function readRegistry(aasHome: string): Promise<RegistryJson> {
  try {
    const raw = await readFile(join(aasHome, 'registry.json'), 'utf-8')
    return JSON.parse(raw) as RegistryJson
  } catch {
    return { installed: [] }
  }
}

export async function writeRegistry(aasHome: string, registry: RegistryJson): Promise<void> {
  await mkdir(aasHome, { recursive: true })
  await writeFile(join(aasHome, 'registry.json'), JSON.stringify(registry, null, 2))
}

export function findEntry(registry: RegistryJson, slug: string): InstalledItem | undefined {
  return registry.installed.find(e => e.slug === slug)
}

export function upsertEntry(registry: RegistryJson, entry: InstalledItem): RegistryJson {
  const idx = registry.installed.findIndex(e => e.slug === entry.slug)
  const installed = [...registry.installed]
  if (idx === -1) {
    installed.push(entry)
  } else {
    installed[idx] = entry
  }
  return { installed }
}

export function removeEntry(registry: RegistryJson, slug: string): RegistryJson {
  return { installed: registry.installed.filter(e => e.slug !== slug) }
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd /Users/liushangliang/github/ai-agent-store/apps/client-core
bun test src/registry/__tests__/index.test.ts
```

Expected: 9/9 tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/client-core/
git commit -m "feat(client-core): scaffold + paths + registry CRUD"
```

---

## Task 2: Installer — Hook Runner + Category Post-Processing

**Files:**
- Create: `apps/client-core/src/installer/hook-runner.ts`
- Create: `apps/client-core/src/installer/provider.ts`
- Create: `apps/client-core/src/installer/skill.ts`
- Create: `apps/client-core/src/installer/mcp.ts`
- Create: `apps/client-core/src/installer/__tests__/hook-runner.test.ts`
- Create: `apps/client-core/src/installer/__tests__/category.test.ts`

**Interfaces:**
- Consumes: `itemDir()` from `../paths`; `Item` from `@aas/types`
- Produces:
  - `runHook(steps: InstallHook['steps'], itemDir: string): Promise<void>`
  - `writeManifest(itemDir: string, item: Item): Promise<void>`
  - `postInstall(itemDir: string): Promise<void>` — one per category file

**Hook step semantics:**
- `file`: fetch URL, write binary to `join(itemDir, step.dest)`; create parent dirs; throw on non-200
- `config`: merge `step.patch` into existing `config.json`; create if absent
- `script`: run `step.command` via `Bun.spawn(['sh', '-c', step.command], { cwd: itemDir })`; throw on non-zero exit

**Category post-processing:**
- `provider.postInstall`: write `{}` to `config.json` only if it doesn't already exist
- `skill.postInstall`: no-op
- `mcp.postInstall`: chmod 0o755 the `server` file if it exists; silently skip if absent

- [ ] **Step 1: Write failing tests for hook-runner**

```typescript
// src/installer/__tests__/hook-runner.test.ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { runHook, writeManifest } from '../hook-runner'
import type { Item } from '@aas/types'

let tmpDir: string
const origFetch = globalThis.fetch

beforeEach(async () => {
  tmpDir = await mkdtemp('/tmp/aas-test-')
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(tmpDir, { recursive: true, force: true })
})

test('config step writes config.json with patch', async () => {
  await runHook([{ type: 'config', patch: { apiKey: '' } }], tmpDir)
  const raw = await readFile(join(tmpDir, 'config.json'), 'utf-8')
  expect(JSON.parse(raw)).toEqual({ apiKey: '' })
})

test('config step merges with existing config.json', async () => {
  await writeFile(join(tmpDir, 'config.json'), JSON.stringify({ existing: true }))
  await runHook([{ type: 'config', patch: { apiKey: '' } }], tmpDir)
  const raw = await readFile(join(tmpDir, 'config.json'), 'utf-8')
  expect(JSON.parse(raw)).toEqual({ existing: true, apiKey: '' })
})

test('script step runs command in itemDir', async () => {
  await runHook([{ type: 'script', command: 'echo hello > output.txt' }], tmpDir)
  const out = await readFile(join(tmpDir, 'output.txt'), 'utf-8')
  expect(out.trim()).toBe('hello')
})

test('script step throws on non-zero exit', async () => {
  await expect(
    runHook([{ type: 'script', command: 'exit 1' }], tmpDir)
  ).rejects.toThrow('exit code 1')
})

test('file step fetches URL and writes to dest', async () => {
  const bytes = new Uint8Array([0x7f, 0x45, 0x4c, 0x46])
  globalThis.fetch = async (_url: string) =>
    new Response(bytes, { status: 200 })

  await runHook([{ type: 'file', url: 'https://example.com/server', dest: 'server' }], tmpDir)

  const content = await readFile(join(tmpDir, 'server'))
  expect(content[0]).toBe(0x7f)
})

test('file step throws on non-200 response', async () => {
  globalThis.fetch = async (_url: string) =>
    new Response('Not Found', { status: 404 })

  await expect(
    runHook([{ type: 'file', url: 'https://example.com/server', dest: 'server' }], tmpDir)
  ).rejects.toThrow('404')
})

test('writeManifest saves full item JSON as manifest.json', async () => {
  const item = { slug: 'test-mcp', category: 'mcp' } as unknown as Item
  await writeManifest(tmpDir, item)
  const raw = await readFile(join(tmpDir, 'manifest.json'), 'utf-8')
  expect(JSON.parse(raw).slug).toBe('test-mcp')
})
```

- [ ] **Step 2: Write failing tests for category post-processing**

```typescript
// src/installer/__tests__/category.test.ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, access, writeFile } from 'fs/promises'
import { join } from 'path'
import { postInstall as providerPostInstall } from '../provider'
import { postInstall as skillPostInstall } from '../skill'
import { postInstall as mcpPostInstall } from '../mcp'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp('/tmp/aas-test-')
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

test('provider postInstall writes empty config.json', async () => {
  await providerPostInstall(tmpDir)
  expect(JSON.parse(await readFile(join(tmpDir, 'config.json'), 'utf-8'))).toEqual({})
})

test('provider postInstall does not overwrite existing config', async () => {
  await writeFile(join(tmpDir, 'config.json'), JSON.stringify({ apiKey: 'sk-existing' }))
  await providerPostInstall(tmpDir)
  const config = JSON.parse(await readFile(join(tmpDir, 'config.json'), 'utf-8'))
  expect(config.apiKey).toBe('sk-existing')
})

test('skill postInstall completes without error', async () => {
  await expect(skillPostInstall(tmpDir)).resolves.toBeUndefined()
})

test('mcp postInstall chmodsx server when present', async () => {
  await writeFile(join(tmpDir, 'server'), '')
  await mcpPostInstall(tmpDir)
  await expect(access(join(tmpDir, 'server'))).resolves.toBeUndefined()
})

test('mcp postInstall does not throw when server absent', async () => {
  await expect(mcpPostInstall(tmpDir)).resolves.toBeUndefined()
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun test src/installer/__tests__/
```

Expected: `Cannot find module '../hook-runner'`

- [ ] **Step 4: Write `src/installer/hook-runner.ts`**

```typescript
import { mkdir, writeFile, readFile, chmod } from 'fs/promises'
import { join, dirname } from 'path'
import type { InstallHook, Item } from '@aas/types'

export async function runHook(steps: InstallHook['steps'], itemDir: string): Promise<void> {
  await mkdir(itemDir, { recursive: true })
  for (const step of steps) {
    if (step.type === 'file') {
      const res = await fetch(step.url)
      if (!res.ok) throw new Error(`Failed to fetch ${step.url}: HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      const dest = join(itemDir, step.dest)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, Buffer.from(buf))
    } else if (step.type === 'config') {
      const configPath = join(itemDir, 'config.json')
      let existing: Record<string, unknown> = {}
      try {
        existing = JSON.parse(await readFile(configPath, 'utf-8')) as Record<string, unknown>
      } catch { /* file may not exist */ }
      await writeFile(configPath, JSON.stringify({ ...existing, ...step.patch }, null, 2))
    } else if (step.type === 'script') {
      const proc = Bun.spawn(['sh', '-c', step.command], { cwd: itemDir })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        throw new Error(`Script failed with exit code ${exitCode}: ${step.command}`)
      }
    }
  }
}

export async function writeManifest(itemDir: string, item: Item): Promise<void> {
  await mkdir(itemDir, { recursive: true })
  await writeFile(join(itemDir, 'manifest.json'), JSON.stringify(item, null, 2))
}
```

- [ ] **Step 5: Write `src/installer/provider.ts`**

```typescript
import { access, writeFile } from 'fs/promises'
import { join } from 'path'

export async function postInstall(itemDir: string): Promise<void> {
  const configPath = join(itemDir, 'config.json')
  try {
    await access(configPath)
  } catch {
    await writeFile(configPath, '{}')
  }
}
```

- [ ] **Step 6: Write `src/installer/skill.ts`**

```typescript
export async function postInstall(_itemDir: string): Promise<void> {
  // No extra setup needed for skill items
}
```

- [ ] **Step 7: Write `src/installer/mcp.ts`**

```typescript
import { access, chmod } from 'fs/promises'
import { join } from 'path'

export async function postInstall(itemDir: string): Promise<void> {
  const serverPath = join(itemDir, 'server')
  try {
    await access(serverPath)
    await chmod(serverPath, 0o755)
  } catch {
    // server file may not exist for all MCP items (e.g. SSE/HTTP transport)
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
bun test src/installer/__tests__/
```

Expected: 12/12 tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/client-core/src/installer/
git commit -m "feat(client-core): installer — hook runner + category post-processing"
```

---

## Task 3: Config Sync — Claude + Codex

**Files:**
- Create: `apps/client-core/src/config/claude.ts`
- Create: `apps/client-core/src/config/codex.ts`
- Create: `apps/client-core/src/config/__tests__/claude.test.ts`
- Create: `apps/client-core/src/config/__tests__/codex.test.ts`

**Interfaces:**
- Consumes: `itemDir()` from `../paths`; `MCPItem`, `Item` from `@aas/types`; `js-yaml` for codex
- Produces:
  - `syncItemToClaude(slug, category, aasHome, claudeConfigDir, action): Promise<void>`
  - `syncItemToCodex(slug, category, aasHome, codexConfigDir, action): Promise<void>`
  - `action: 'add' | 'remove'`

**Claude sync rules** (writes to `~/.claude/settings.json`):
- `provider` + `add`: read `config.json`, set `settings.providers[slug] = configValues`
- `provider` + `remove`: delete `settings.providers[slug]`
- `skill` + `add`: copy `<itemDir>/skill.md` → `<claudeDir>/skills/<slug>.md`
- `skill` + `remove`: delete `<claudeDir>/skills/<slug>.md` (silently skip if absent)
- `mcp` + `add`: read manifest for `serverCommand`; set `settings.mcpServers[slug] = { command, args }`
- `mcp` + `remove`: delete `settings.mcpServers[slug]`

**MCP command resolution**: split `serverCommand` on first space; if part[0] starts with `./`, join with `itemDir` to get absolute path; remaining parts become `args`. Example: `"./server"` → `{ command: "/home/user/.agents/mcps/my-mcp/server", args: [] }`

**Codex sync rules** (writes to `~/.codex/config.yaml`):
- Same logic as Claude, but targets `config.yaml` with YAML serialization
- `provider` → `config.providers[slug]`
- `skill` → copy to `<codexDir>/skills/<slug>.md`
- `mcp` → `config.mcpServers[slug]`

Both functions: create target config file/directory if absent; deep merge (not replace) the top-level key.

- [ ] **Step 1: Write failing tests for Claude sync**

```typescript
// src/config/__tests__/claude.test.ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { syncItemToClaude } from '../claude'
import type { MCPItem, ProviderItem, SkillItem } from '@aas/types'

let aasHome: string
let claudeDir: string

const publisher = { id: 'p1', slug: 'test', name: 'Test', avatarUrl: '', tier: 'community' as const }
const baseItem = {
  id: 'i1', name: 'Test', description: '', readmeUrl: '', icon: '',
  version: '1.0.0', publisher, compatibleWith: ['claude' as const], tags: [],
  downloads: 0, rating: 0, status: 'published' as const, createdAt: '', updatedAt: '',
  installHook: { steps: [] },
}

const mcpManifest: MCPItem = {
  ...baseItem, slug: 'test-mcp', category: 'mcp',
  transport: 'stdio', serverCommand: './server',
  configSchema: {},
}

const providerManifest: ProviderItem = {
  ...baseItem, slug: 'test-provider', category: 'provider',
  configSchema: {}, supportedModels: ['gpt-4o'],
}

const skillManifest: SkillItem = {
  ...baseItem, slug: 'test-skill', category: 'skill', contentUrl: '',
}

async function setupItem(category: string, slug: string, manifest: object, config?: object) {
  const dir = join(aasHome, `${category}s`, slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest))
  if (config !== undefined) {
    await writeFile(join(dir, 'config.json'), JSON.stringify(config))
  }
}

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-test-home-')
  claudeDir = await mkdtemp('/tmp/aas-test-claude-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
  await rm(claudeDir, { recursive: true, force: true })
})

test('mcp add writes mcpServers entry with absolute command path', async () => {
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToClaude('test-mcp', 'mcp', aasHome, claudeDir, 'add')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  const entry = settings.mcpServers['test-mcp']
  expect(entry).toBeDefined()
  expect(entry.command).toBe(join(aasHome, 'mcps', 'test-mcp', 'server'))
  expect(entry.args).toEqual([])
})

test('mcp remove deletes mcpServers entry', async () => {
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToClaude('test-mcp', 'mcp', aasHome, claudeDir, 'add')
  await syncItemToClaude('test-mcp', 'mcp', aasHome, claudeDir, 'remove')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.mcpServers?.['test-mcp']).toBeUndefined()
})

test('provider add writes providers entry with config values', async () => {
  await setupItem('provider', 'test-provider', providerManifest, { apiKey: 'sk-123' })
  await syncItemToClaude('test-provider', 'provider', aasHome, claudeDir, 'add')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.providers['test-provider'].apiKey).toBe('sk-123')
})

test('provider remove deletes providers entry', async () => {
  await setupItem('provider', 'test-provider', providerManifest, {})
  await syncItemToClaude('test-provider', 'provider', aasHome, claudeDir, 'add')
  await syncItemToClaude('test-provider', 'provider', aasHome, claudeDir, 'remove')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.providers?.['test-provider']).toBeUndefined()
})

test('skill add copies skill.md to claudeDir/skills/', async () => {
  const dir = join(aasHome, 'skills', 'test-skill')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'skill.md'), '# Test Skill')
  await syncItemToClaude('test-skill', 'skill', aasHome, claudeDir, 'add')
  const content = await readFile(join(claudeDir, 'skills', 'test-skill.md'), 'utf-8')
  expect(content).toBe('# Test Skill')
})

test('skill remove deletes skill file', async () => {
  const dir = join(aasHome, 'skills', 'test-skill')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'skill.md'), '# Test Skill')
  await syncItemToClaude('test-skill', 'skill', aasHome, claudeDir, 'add')
  await syncItemToClaude('test-skill', 'skill', aasHome, claudeDir, 'remove')
  await expect(readFile(join(claudeDir, 'skills', 'test-skill.md'), 'utf-8')).rejects.toThrow()
})

test('skill remove does not throw if file absent', async () => {
  await expect(
    syncItemToClaude('test-skill', 'skill', aasHome, claudeDir, 'remove')
  ).resolves.toBeUndefined()
})

test('mcp add preserves existing settings keys', async () => {
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({ model: 'claude-sonnet-4-6' }))
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToClaude('test-mcp', 'mcp', aasHome, claudeDir, 'add')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.model).toBe('claude-sonnet-4-6')
  expect(settings.mcpServers['test-mcp']).toBeDefined()
})
```

- [ ] **Step 2: Write failing tests for Codex sync**

```typescript
// src/config/__tests__/codex.test.ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import yaml from 'js-yaml'
import { syncItemToCodex } from '../codex'
import type { MCPItem, ProviderItem } from '@aas/types'

let aasHome: string
let codexDir: string

const publisher = { id: 'p1', slug: 'test', name: 'Test', avatarUrl: '', tier: 'community' as const }
const baseItem = {
  id: 'i1', name: 'Test', description: '', readmeUrl: '', icon: '',
  version: '1.0.0', publisher, compatibleWith: ['codex' as const], tags: [],
  downloads: 0, rating: 0, status: 'published' as const, createdAt: '', updatedAt: '',
  installHook: { steps: [] },
}

const mcpManifest: MCPItem = {
  ...baseItem, slug: 'test-mcp', category: 'mcp',
  transport: 'stdio', serverCommand: './server', configSchema: {},
}

const providerManifest: ProviderItem = {
  ...baseItem, slug: 'test-provider', category: 'provider',
  configSchema: {}, supportedModels: [],
}

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-test-home-')
  codexDir = await mkdtemp('/tmp/aas-test-codex-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
  await rm(codexDir, { recursive: true, force: true })
})

async function setupItem(category: string, slug: string, manifest: object, config?: object) {
  const dir = join(aasHome, `${category}s`, slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest))
  if (config !== undefined) {
    await writeFile(join(dir, 'config.json'), JSON.stringify(config))
  }
}

async function readConfig(dir: string): Promise<Record<string, unknown>> {
  return yaml.load(await readFile(join(dir, 'config.yaml'), 'utf-8')) as Record<string, unknown>
}

test('mcp add writes mcpServers to config.yaml', async () => {
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'add')
  const config = await readConfig(codexDir)
  const entry = (config.mcpServers as Record<string, unknown>)['test-mcp'] as { command: string }
  expect(entry.command).toBe(join(aasHome, 'mcps', 'test-mcp', 'server'))
})

test('mcp remove deletes mcpServers entry', async () => {
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'add')
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'remove')
  const config = await readConfig(codexDir)
  expect((config.mcpServers as Record<string, unknown>)?.['test-mcp']).toBeUndefined()
})

test('provider add writes providers to config.yaml', async () => {
  await setupItem('provider', 'test-provider', providerManifest, { apiKey: 'key-1' })
  await syncItemToCodex('test-provider', 'provider', aasHome, codexDir, 'add')
  const config = await readConfig(codexDir)
  const prov = (config.providers as Record<string, unknown>)['test-provider'] as { apiKey: string }
  expect(prov.apiKey).toBe('key-1')
})

test('skill add copies skill.md to codexDir/skills/', async () => {
  const dir = join(aasHome, 'skills', 'test-skill')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'skill.md'), '# Skill')
  await syncItemToCodex('test-skill', 'skill', aasHome, codexDir, 'add')
  const content = await readFile(join(codexDir, 'skills', 'test-skill.md'), 'utf-8')
  expect(content).toBe('# Skill')
})

test('mcp add preserves existing config.yaml keys', async () => {
  await writeFile(join(codexDir, 'config.yaml'), yaml.dump({ model: 'codex-mini' }))
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'add')
  const config = await readConfig(codexDir)
  expect(config.model).toBe('codex-mini')
  expect((config.mcpServers as Record<string, unknown>)['test-mcp']).toBeDefined()
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
bun test src/config/__tests__/
```

Expected: `Cannot find module '../claude'`

- [ ] **Step 4: Write `src/config/claude.ts`**

```typescript
import { readFile, writeFile, mkdir, copyFile, unlink } from 'fs/promises'
import { join, dirname } from 'path'
import type { MCPItem } from '@aas/types'

const CATEGORY_DIR: Record<string, string> = {
  provider: 'providers',
  skill: 'skills',
  mcp: 'mcps',
}

function resolveServerCmd(serverCommand: string, itemDir: string): { command: string; args: string[] } {
  const parts = serverCommand.split(' ')
  const cmd = parts[0]
  const resolvedCmd = cmd.startsWith('./') ? join(itemDir, cmd.slice(2)) : cmd
  return { command: resolvedCmd, args: parts.slice(1) }
}

async function readSettings(claudeConfigDir: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(join(claudeConfigDir, 'settings.json'), 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeSettings(claudeConfigDir: string, settings: Record<string, unknown>): Promise<void> {
  await mkdir(claudeConfigDir, { recursive: true })
  await writeFile(join(claudeConfigDir, 'settings.json'), JSON.stringify(settings, null, 2))
}

export async function syncItemToClaude(
  slug: string,
  category: 'provider' | 'skill' | 'mcp',
  aasHome: string,
  claudeConfigDir: string,
  action: 'add' | 'remove'
): Promise<void> {
  const dir = join(aasHome, CATEGORY_DIR[category], slug)
  const settings = await readSettings(claudeConfigDir)

  if (category === 'mcp') {
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as MCPItem
    const mcpServers = (settings['mcpServers'] ?? {}) as Record<string, unknown>
    if (action === 'add') {
      const { command, args } = resolveServerCmd(manifest.serverCommand, dir)
      mcpServers[slug] = { command, args }
    } else {
      delete mcpServers[slug]
    }
    settings['mcpServers'] = mcpServers
    await writeSettings(claudeConfigDir, settings)
  } else if (category === 'skill') {
    const skillsDir = join(claudeConfigDir, 'skills')
    const destPath = join(skillsDir, `${slug}.md`)
    if (action === 'add') {
      await mkdir(skillsDir, { recursive: true })
      await copyFile(join(dir, 'skill.md'), destPath)
    } else {
      try { await unlink(destPath) } catch { /* already absent */ }
    }
  } else if (category === 'provider') {
    let config: Record<string, unknown> = {}
    try {
      config = JSON.parse(await readFile(join(dir, 'config.json'), 'utf-8')) as Record<string, unknown>
    } catch { /* no config yet */ }
    const providers = (settings['providers'] ?? {}) as Record<string, unknown>
    if (action === 'add') {
      providers[slug] = config
    } else {
      delete providers[slug]
    }
    settings['providers'] = providers
    await writeSettings(claudeConfigDir, settings)
  }
}
```

- [ ] **Step 5: Write `src/config/codex.ts`**

```typescript
import { readFile, writeFile, mkdir, copyFile, unlink } from 'fs/promises'
import { join } from 'path'
import yaml from 'js-yaml'
import type { MCPItem } from '@aas/types'

const CATEGORY_DIR: Record<string, string> = {
  provider: 'providers',
  skill: 'skills',
  mcp: 'mcps',
}

function resolveServerCmd(serverCommand: string, itemDir: string): { command: string; args: string[] } {
  const parts = serverCommand.split(' ')
  const cmd = parts[0]
  const resolvedCmd = cmd.startsWith('./') ? join(itemDir, cmd.slice(2)) : cmd
  return { command: resolvedCmd, args: parts.slice(1) }
}

async function readConfig(codexConfigDir: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(join(codexConfigDir, 'config.yaml'), 'utf-8')
    return (yaml.load(raw) as Record<string, unknown>) ?? {}
  } catch {
    return {}
  }
}

async function writeConfig(codexConfigDir: string, config: Record<string, unknown>): Promise<void> {
  await mkdir(codexConfigDir, { recursive: true })
  await writeFile(join(codexConfigDir, 'config.yaml'), yaml.dump(config))
}

export async function syncItemToCodex(
  slug: string,
  category: 'provider' | 'skill' | 'mcp',
  aasHome: string,
  codexConfigDir: string,
  action: 'add' | 'remove'
): Promise<void> {
  const dir = join(aasHome, CATEGORY_DIR[category], slug)
  const config = await readConfig(codexConfigDir)

  if (category === 'mcp') {
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as MCPItem
    const mcpServers = (config['mcpServers'] ?? {}) as Record<string, unknown>
    if (action === 'add') {
      const { command, args } = resolveServerCmd(manifest.serverCommand, dir)
      mcpServers[slug] = { command, args }
    } else {
      delete mcpServers[slug]
    }
    config['mcpServers'] = mcpServers
    await writeConfig(codexConfigDir, config)
  } else if (category === 'skill') {
    const skillsDir = join(codexConfigDir, 'skills')
    const destPath = join(skillsDir, `${slug}.md`)
    if (action === 'add') {
      await mkdir(skillsDir, { recursive: true })
      await copyFile(join(dir, 'skill.md'), destPath)
    } else {
      try { await unlink(destPath) } catch { /* already absent */ }
    }
  } else if (category === 'provider') {
    let itemConfig: Record<string, unknown> = {}
    try {
      itemConfig = JSON.parse(await readFile(join(dir, 'config.json'), 'utf-8')) as Record<string, unknown>
    } catch { /* no config yet */ }
    const providers = (config['providers'] ?? {}) as Record<string, unknown>
    if (action === 'add') {
      providers[slug] = itemConfig
    } else {
      delete providers[slug]
    }
    config['providers'] = providers
    await writeConfig(codexConfigDir, config)
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
bun test src/config/__tests__/
```

Expected: 14/14 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/client-core/src/config/
git commit -m "feat(client-core): config sync for Claude and Codex"
```

---

## Task 4: API Client Module + Updater

**Files:**
- Create: `apps/client-core/src/api/index.ts`
- Create: `apps/client-core/src/updater/index.ts`
- Create: `apps/client-core/src/updater/__tests__/index.test.ts`

**Interfaces:**
- Consumes: `AASClient` from `@aas/sdk`; `RegistryJson`, `InstalledItem`, `UpdateAvailable`, `UpdateResult`, `Item` from `@aas/types`
- Produces:
  - `checkUpdates(registry: RegistryJson, client: AASClient, slugs?: string[]): Promise<UpdateAvailable[]>`
    - Filters by `slugs` if provided; calls `getItemBySlug` per entry; skips on error; skips when versions match
  - `applyUpdate(slug: string, client: AASClient, entry: InstalledItem): Promise<{ latestItem: Item; fromVersion: string }>`
    - Throws `Error` if market item not found; caller (engine) decides whether version actually changed

- [ ] **Step 1: Write `src/api/index.ts`**

```typescript
export { AASClient } from '@aas/sdk'
export type { Result, GetItemsParams, CreateItemBody, PublisherWithItems } from '@aas/sdk'
```

- [ ] **Step 2: Write failing updater tests**

```typescript
// src/updater/__tests__/index.test.ts
import { test, expect } from 'bun:test'
import { checkUpdates, applyUpdate } from '../index'
import type { RegistryJson, Item, InstalledItem } from '@aas/types'
import type { AASClient } from '@aas/sdk'

const installedEntry: InstalledItem = {
  slug: 'openai-provider',
  category: 'provider',
  version: '1.0.0',
  installedAt: '2026-06-18T00:00:00Z',
  updatedAt: '2026-06-18T00:00:00Z',
  compatibleWith: ['claude'],
  enabledFor: { claude: true },
}

const registry: RegistryJson = { installed: [installedEntry] }

const marketItemV2 = { slug: 'openai-provider', version: '2.0.0' } as unknown as Item
const marketItemV1 = { slug: 'openai-provider', version: '1.0.0' } as unknown as Item

function makeClient(item: Item | null, error: string | null = null): AASClient {
  return {
    getItemBySlug: async () =>
      error ? { data: null, error } : { data: item, error: null },
  } as unknown as AASClient
}

test('checkUpdates returns UpdateAvailable when market version is newer', async () => {
  const updates = await checkUpdates(registry, makeClient(marketItemV2))
  expect(updates).toHaveLength(1)
  expect(updates[0]).toEqual({
    slug: 'openai-provider',
    currentVersion: '1.0.0',
    latestVersion: '2.0.0',
  })
})

test('checkUpdates returns empty array when already up to date', async () => {
  const updates = await checkUpdates(registry, makeClient(marketItemV1))
  expect(updates).toHaveLength(0)
})

test('checkUpdates filters to specified slugs', async () => {
  const registry2: RegistryJson = {
    installed: [
      installedEntry,
      { ...installedEntry, slug: 'other-mcp', category: 'mcp' },
    ],
  }
  const updates = await checkUpdates(registry2, makeClient(marketItemV2), ['openai-provider'])
  expect(updates).toHaveLength(1)
  expect(updates[0].slug).toBe('openai-provider')
})

test('checkUpdates skips entries when market returns error', async () => {
  const updates = await checkUpdates(registry, makeClient(null, 'Not found'))
  expect(updates).toHaveLength(0)
})

test('applyUpdate returns latestItem and fromVersion', async () => {
  const result = await applyUpdate('openai-provider', makeClient(marketItemV2), installedEntry)
  expect(result.fromVersion).toBe('1.0.0')
  expect(result.latestItem.version).toBe('2.0.0')
})

test('applyUpdate throws when market returns error', async () => {
  await expect(
    applyUpdate('openai-provider', makeClient(null, 'Not found'), installedEntry)
  ).rejects.toThrow('Not found')
})

test('applyUpdate throws when market returns null without error string', async () => {
  await expect(
    applyUpdate('openai-provider', makeClient(null), installedEntry)
  ).rejects.toThrow('openai-provider')
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun test src/updater/__tests__/index.test.ts
```

Expected: `Cannot find module '../index'`

- [ ] **Step 4: Write `src/updater/index.ts`**

```typescript
import type { RegistryJson, InstalledItem, UpdateAvailable, Item } from '@aas/types'
import type { AASClient } from '@aas/sdk'

export async function checkUpdates(
  registry: RegistryJson,
  client: AASClient,
  slugs?: string[]
): Promise<UpdateAvailable[]> {
  const entries = slugs
    ? registry.installed.filter(e => slugs.includes(e.slug))
    : registry.installed

  const updates: UpdateAvailable[] = []
  for (const entry of entries) {
    const result = await client.getItemBySlug(entry.slug)
    if (result.error || !result.data) continue
    if (result.data.version !== entry.version) {
      updates.push({
        slug: entry.slug,
        currentVersion: entry.version,
        latestVersion: result.data.version,
      })
    }
  }
  return updates
}

export async function applyUpdate(
  slug: string,
  client: AASClient,
  entry: InstalledItem
): Promise<{ latestItem: Item; fromVersion: string }> {
  const result = await client.getItemBySlug(slug)
  if (result.error || !result.data) {
    throw new Error(result.error ?? `Item not found: ${slug}`)
  }
  return { latestItem: result.data, fromVersion: entry.version }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun test src/updater/__tests__/index.test.ts
```

Expected: 7/7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/client-core/src/api/ apps/client-core/src/updater/
git commit -m "feat(client-core): api module + updater (checkUpdates, applyUpdate)"
```

---

## Task 5: AASEngine + Index + Build Verification

**Files:**
- Create: `apps/client-core/src/engine.ts`
- Create: `apps/client-core/src/__tests__/engine.test.ts`
- Create: `apps/client-core/src/index.ts`
- Modify: `apps/client-core/tsconfig.json` — ensure `references` include types + sdk
- Modify: `pnpm-workspace.yaml` — verify `apps/client-core` is included (likely already is)

**Interfaces:**
- Consumes: all modules from Tasks 1–4
- Produces: `class AASEngineImpl implements AASEngine` exported from `src/index.ts`
- Constructor: `constructor(pathOverrides?: Partial<AASPaths>, marketUrl?: string)`

**Method mapping:**
- `search(query, options?)` → `client.getItems({ q: query, ...options })`; returns `[]` on error
- `install(slug)` → fetch item, mkdir, runHook, postInstall by category, writeManifest, upsertEntry; return `InstallResult`
- `uninstall(slug)` → disable from all enabled targets, rm -rf itemDir, removeEntry
- `enable(slug, target)` → syncToTarget 'add', update `enabledFor[target] = true`
- `disable(slug, target)` → syncToTarget 'remove', update `enabledFor[target] = false`
- `getConfigSchema(slug)` → read manifest for `configSchema`; read `config.json` for current values
- `setConfig(slug, values)` → write `config.json`; re-sync all enabled targets
- `sync(targets?)` → for each installed item, for each enabled target in `targets ?? ['claude','codex']`, call syncToTarget 'add'
- `checkUpdates(slugs?)` → delegate to updater module
- `update(slug?)` → for matching entries: applyUpdate, re-run hook if version changed, writeManifest, upsertEntry, re-sync; return array of UpdateResult
- `list(options?)` → filter registry by category + enabledFor
- `info(slug)` → combine registry entry + manifest + config.json

- [ ] **Step 1: Write failing integration tests for AASEngine**

```typescript
// src/__tests__/engine.test.ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { AASEngineImpl } from '../engine'
import type { MCPItem, ProviderItem, SkillItem } from '@aas/types'

const publisher = { id: 'p1', slug: 'pub', name: 'Pub', avatarUrl: '', tier: 'community' as const }
const baseItem = {
  id: 'i1', name: 'Test', description: 'desc', readmeUrl: 'https://r.com', icon: 'https://i.com',
  version: '1.0.0', publisher, compatibleWith: ['claude' as const, 'codex' as const],
  tags: [], downloads: 0, rating: 0, status: 'published' as const,
  createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  installHook: { steps: [] },
}

const mcpItem: MCPItem = {
  ...baseItem, slug: 'test-mcp', category: 'mcp',
  transport: 'stdio', serverCommand: './server', configSchema: { type: 'object' },
}

const providerItem: ProviderItem = {
  ...baseItem, slug: 'test-provider', category: 'provider',
  configSchema: { type: 'object', properties: { apiKey: { type: 'string' } } },
  supportedModels: ['gpt-4o'],
}

const skillItem: SkillItem = {
  ...baseItem, slug: 'test-skill', category: 'skill', contentUrl: 'https://s.com',
  installHook: { steps: [] },
}

let aasHome: string
let claudeDir: string
let codexDir: string
let engine: AASEngineImpl
const origFetch = globalThis.fetch

function mockFetch(items: Record<string, unknown>) {
  globalThis.fetch = async (url: string) => {
    const u = String(url)
    for (const [pattern, body] of Object.entries(items)) {
      if (u.includes(pattern)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    throw new Error(`Unmocked URL: ${u}`)
  }
}

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-test-home-')
  claudeDir = await mkdtemp('/tmp/aas-test-claude-')
  codexDir = await mkdtemp('/tmp/aas-test-codex-')
  engine = new AASEngineImpl(
    { aasHome, claudeConfigDir: claudeDir, codexConfigDir: codexDir },
    'http://localhost:3000'
  )
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(aasHome, { recursive: true, force: true })
  await rm(claudeDir, { recursive: true, force: true })
  await rm(codexDir, { recursive: true, force: true })
})

test('install mcp: creates item dir, manifest, registry entry', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  const result = await engine.install('test-mcp')
  expect(result.slug).toBe('test-mcp')
  expect(result.version).toBe('1.0.0')
  const manifest = JSON.parse(
    await readFile(join(aasHome, 'mcps', 'test-mcp', 'manifest.json'), 'utf-8')
  )
  expect(manifest.slug).toBe('test-mcp')
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].slug).toBe('test-mcp')
  expect(reg.installed[0].enabledFor).toEqual({})
})

test('install throws when market returns error', async () => {
  mockFetch({ '/api/items/unknown': { error: 'not found' } })
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
  await expect(engine.install('unknown')).rejects.toThrow()
})

test('enable mcp: writes mcpServers to claude settings', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.enable('test-mcp', 'claude')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.mcpServers?.['test-mcp']).toBeDefined()
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].enabledFor.claude).toBe(true)
})

test('disable mcp: removes mcpServers entry and sets enabledFor false', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.enable('test-mcp', 'claude')
  await engine.disable('test-mcp', 'claude')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.mcpServers?.['test-mcp']).toBeUndefined()
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].enabledFor.claude).toBe(false)
})

test('uninstall: removes item dir and registry entry', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.uninstall('test-mcp')
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed).toHaveLength(0)
  const { access } = await import('fs/promises')
  await expect(access(join(aasHome, 'mcps', 'test-mcp'))).rejects.toThrow()
})

test('list returns all installed items', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  const items = await engine.list()
  expect(items).toHaveLength(1)
  expect(items[0].slug).toBe('test-mcp')
})

test('list filters by category', async () => {
  mockFetch({
    '/api/items/test-mcp': { item: mcpItem },
    '/api/items/test-provider': { item: providerItem },
  })
  await engine.install('test-mcp')
  await engine.install('test-provider')
  const mcps = await engine.list({ category: 'mcp' })
  expect(mcps).toHaveLength(1)
  expect(mcps[0].slug).toBe('test-mcp')
})

test('info returns ItemDetail with manifest data', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  const detail = await engine.info('test-mcp')
  expect(detail.slug).toBe('test-mcp')
  expect(detail.name).toBe('Test')
  expect(detail.serverCommand).toBe('./server')
})

test('getConfigSchema returns schema and current values', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  await engine.setConfig('test-provider', { apiKey: 'sk-test' })
  const { schema, current } = await engine.getConfigSchema('test-provider')
  expect(schema).toEqual(providerItem.configSchema)
  expect(current.apiKey).toBe('sk-test')
})

test('setConfig writes config.json', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  await engine.setConfig('test-provider', { apiKey: 'sk-test' })
  const config = JSON.parse(
    await readFile(join(aasHome, 'providers', 'test-provider', 'config.json'), 'utf-8')
  )
  expect(config.apiKey).toBe('sk-test')
})

test('sync adds all enabled items to target configs', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.enable('test-mcp', 'claude')
  // Clear settings to verify sync rewrites
  await writeFile(join(claudeDir, 'settings.json'), '{}')
  const result = await engine.sync(['claude'])
  expect(result.errors).toHaveLength(0)
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.mcpServers?.['test-mcp']).toBeDefined()
})

test('checkUpdates returns empty when registry is empty', async () => {
  const updates = await engine.checkUpdates()
  expect(updates).toHaveLength(0)
})

test('enable throws for unknown slug', async () => {
  await expect(engine.enable('nonexistent', 'claude')).rejects.toThrow('not installed')
})

test('uninstall throws for unknown slug', async () => {
  await expect(engine.uninstall('nonexistent')).rejects.toThrow('not installed')
})

test('info throws for unknown slug', async () => {
  await expect(engine.info('nonexistent')).rejects.toThrow('not installed')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/__tests__/engine.test.ts
```

Expected: `Cannot find module '../engine'`

- [ ] **Step 3: Write `src/engine.ts`**

```typescript
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type {
  AASEngine, AASPaths, InstallResult, SyncResult, UpdateAvailable, UpdateResult,
  ListOptions, InstalledItem, ItemDetail, ToolTarget, SearchOptions, Item, JsonSchema,
} from '@aas/types'
import { AASClient } from '@aas/sdk'
import { resolvePaths, itemDir } from './paths'
import { readRegistry, writeRegistry, findEntry, upsertEntry, removeEntry } from './registry/index'
import { runHook, writeManifest } from './installer/hook-runner'
import { postInstall as providerPostInstall } from './installer/provider'
import { postInstall as skillPostInstall } from './installer/skill'
import { postInstall as mcpPostInstall } from './installer/mcp'
import { syncItemToClaude } from './config/claude'
import { syncItemToCodex } from './config/codex'
import { checkUpdates as _checkUpdates, applyUpdate } from './updater/index'

export class AASEngineImpl implements AASEngine {
  private readonly paths: Required<AASPaths>
  private readonly client: AASClient

  constructor(pathOverrides?: Partial<AASPaths>, marketUrl?: string) {
    this.paths = resolvePaths(pathOverrides)
    this.client = new AASClient(marketUrl)
  }

  async search(query: string, options?: SearchOptions): Promise<Item[]> {
    const result = await this.client.getItems({
      q: query,
      category: options?.category,
      limit: options?.limit,
      offset: options?.offset,
    })
    if (result.error) return []
    return result.data
  }

  async install(slug: string): Promise<InstallResult> {
    const itemResult = await this.client.getItemBySlug(slug)
    if (itemResult.error || !itemResult.data) {
      throw new Error(itemResult.error ?? `Item not found: ${slug}`)
    }
    const item = itemResult.data
    const dir = itemDir(this.paths.aasHome, item.category, slug)
    await mkdir(dir, { recursive: true })
    await runHook(item.installHook.steps, dir)
    if (item.category === 'provider') await providerPostInstall(dir)
    else if (item.category === 'skill') await skillPostInstall(dir)
    else if (item.category === 'mcp') await mcpPostInstall(dir)
    await writeManifest(dir, item)
    const registry = await readRegistry(this.paths.aasHome)
    const existing = findEntry(registry, slug)
    const now = new Date().toISOString()
    const entry: InstalledItem = {
      slug,
      category: item.category,
      version: item.version,
      installedAt: existing?.installedAt ?? now,
      updatedAt: now,
      compatibleWith: item.compatibleWith,
      enabledFor: existing?.enabledFor ?? {},
    }
    await writeRegistry(this.paths.aasHome, upsertEntry(registry, entry))
    return { slug, version: item.version, installedAt: entry.installedAt }
  }

  async uninstall(slug: string): Promise<void> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    for (const target of entry.compatibleWith) {
      if (entry.enabledFor[target]) {
        await this._syncToTarget(slug, entry.category, target, 'remove')
      }
    }
    await rm(itemDir(this.paths.aasHome, entry.category, slug), { recursive: true, force: true })
    await writeRegistry(this.paths.aasHome, removeEntry(registry, slug))
  }

  async enable(slug: string, target: ToolTarget): Promise<void> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    await this._syncToTarget(slug, entry.category, target, 'add')
    await writeRegistry(
      this.paths.aasHome,
      upsertEntry(registry, {
        ...entry,
        enabledFor: { ...entry.enabledFor, [target]: true },
        updatedAt: new Date().toISOString(),
      })
    )
  }

  async disable(slug: string, target: ToolTarget): Promise<void> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    await this._syncToTarget(slug, entry.category, target, 'remove')
    await writeRegistry(
      this.paths.aasHome,
      upsertEntry(registry, {
        ...entry,
        enabledFor: { ...entry.enabledFor, [target]: false },
        updatedAt: new Date().toISOString(),
      })
    )
  }

  async getConfigSchema(slug: string): Promise<{ schema: JsonSchema; current: Record<string, unknown> }> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    const dir = itemDir(this.paths.aasHome, entry.category, slug)
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as { configSchema?: JsonSchema }
    let current: Record<string, unknown> = {}
    try {
      current = JSON.parse(await readFile(join(dir, 'config.json'), 'utf-8')) as Record<string, unknown>
    } catch { /* skills have no config.json */ }
    return { schema: manifest.configSchema ?? {}, current }
  }

  async setConfig(slug: string, values: Record<string, unknown>): Promise<void> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    const dir = itemDir(this.paths.aasHome, entry.category, slug)
    await writeFile(join(dir, 'config.json'), JSON.stringify(values, null, 2))
    for (const target of entry.compatibleWith) {
      if (entry.enabledFor[target]) {
        await this._syncToTarget(slug, entry.category, target, 'add')
      }
    }
  }

  async sync(targets?: ToolTarget[]): Promise<SyncResult> {
    const registry = await readRegistry(this.paths.aasHome)
    const effectiveTargets: ToolTarget[] = targets ?? ['claude', 'codex']
    const synced: string[] = []
    const errors: Array<{ slug: string; error: string }> = []
    for (const entry of registry.installed) {
      for (const target of effectiveTargets) {
        if (!entry.enabledFor[target]) continue
        try {
          await this._syncToTarget(entry.slug, entry.category, target, 'add')
          synced.push(`${entry.slug}:${target}`)
        } catch (e) {
          errors.push({ slug: `${entry.slug}:${target}`, error: String(e) })
        }
      }
    }
    return { synced, errors }
  }

  async checkUpdates(slugs?: string[]): Promise<UpdateAvailable[]> {
    const registry = await readRegistry(this.paths.aasHome)
    return _checkUpdates(registry, this.client, slugs)
  }

  async update(slug?: string): Promise<UpdateResult[]> {
    const registry = await readRegistry(this.paths.aasHome)
    const entries = slug
      ? registry.installed.filter(e => e.slug === slug)
      : registry.installed
    const results: UpdateResult[] = []
    for (const entry of entries) {
      try {
        const { latestItem, fromVersion } = await applyUpdate(entry.slug, this.client, entry)
        if (latestItem.version === fromVersion) continue
        const dir = itemDir(this.paths.aasHome, entry.category, entry.slug)
        await runHook(latestItem.installHook.steps, dir)
        if (latestItem.category === 'provider') await providerPostInstall(dir)
        else if (latestItem.category === 'mcp') await mcpPostInstall(dir)
        await writeManifest(dir, latestItem)
        const now = new Date().toISOString()
        await writeRegistry(
          this.paths.aasHome,
          upsertEntry(registry, { ...entry, version: latestItem.version, updatedAt: now })
        )
        for (const target of entry.compatibleWith) {
          if (entry.enabledFor[target]) {
            await this._syncToTarget(entry.slug, entry.category, target, 'add')
          }
        }
        results.push({ slug: entry.slug, fromVersion, toVersion: latestItem.version })
      } catch {
        // Skip failed entries; allow the rest to proceed
      }
    }
    return results
  }

  async list(options?: ListOptions): Promise<InstalledItem[]> {
    const registry = await readRegistry(this.paths.aasHome)
    let items = registry.installed
    if (options?.category) items = items.filter(e => e.category === options.category)
    if (options?.enabledFor) items = items.filter(e => e.enabledFor[options.enabledFor!] === true)
    return items
  }

  async info(slug: string): Promise<ItemDetail> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    const dir = itemDir(this.paths.aasHome, entry.category, slug)
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as {
      name: string; description: string; readmeUrl: string; icon: string
      publisher: import('@aas/types').Publisher; tags: string[]; downloads: number
      configSchema?: import('@aas/types').JsonSchema; supportedModels?: string[]
      transport?: 'stdio' | 'sse' | 'http'; serverCommand?: string; contentUrl?: string
    }
    let currentConfig: Record<string, unknown> | undefined
    try {
      currentConfig = JSON.parse(await readFile(join(dir, 'config.json'), 'utf-8')) as Record<string, unknown>
    } catch { /* skills have no config.json */ }
    return {
      ...entry,
      name: manifest.name,
      description: manifest.description,
      readmeUrl: manifest.readmeUrl,
      icon: manifest.icon,
      publisher: manifest.publisher,
      tags: manifest.tags,
      downloads: manifest.downloads,
      configSchema: manifest.configSchema,
      currentConfig,
      supportedModels: manifest.supportedModels,
      transport: manifest.transport,
      serverCommand: manifest.serverCommand,
      contentUrl: manifest.contentUrl,
    }
  }

  private async _syncToTarget(
    slug: string,
    category: 'provider' | 'skill' | 'mcp',
    target: ToolTarget,
    action: 'add' | 'remove'
  ): Promise<void> {
    if (target === 'claude') {
      await syncItemToClaude(slug, category, this.paths.aasHome, this.paths.claudeConfigDir, action)
    } else if (target === 'codex') {
      await syncItemToCodex(slug, category, this.paths.aasHome, this.paths.codexConfigDir, action)
    }
  }
}
```

- [ ] **Step 4: Write `src/index.ts`**

```typescript
export { AASEngineImpl } from './engine'
export type {
  AASEngine, AASPaths, InstallResult, SyncResult, UpdateAvailable, UpdateResult,
  ListOptions, InstalledItem, ItemDetail, ToolTarget, SearchOptions, Item, JsonSchema,
  RegistryJson, InstallHook,
} from '@aas/types'
```

- [ ] **Step 5: Run all tests to verify they pass**

```bash
cd /Users/liushangliang/github/ai-agent-store/apps/client-core
bun test
```

Expected: all tests pass (9 registry + 12 installer + 14 config + 7 updater + ~17 engine = ~59 tests).

- [ ] **Step 6: Verify type-check passes**

```bash
bun run type-check
```

Expected: no TypeScript errors.

- [ ] **Step 7: Verify Turborepo can build the package**

```bash
cd /Users/liushangliang/github/ai-agent-store
pnpm build --filter=@aas/client-core
```

Expected: `dist/index.js` and `dist/index.d.ts` emitted.

- [ ] **Step 8: Run full monorepo test suite**

```bash
cd /Users/liushangliang/github/ai-agent-store
pnpm test
```

Expected: all tests across types + sdk + market + client-core pass.

- [ ] **Step 9: Commit**

```bash
git add apps/client-core/src/engine.ts apps/client-core/src/index.ts apps/client-core/src/__tests__/
git commit -m "feat(client-core): AASEngineImpl — install, enable, disable, sync, update, list, info"
```
