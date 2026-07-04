# Provider Edit Form Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `apps/cli-gui`'s generic configSchema-driven `ProviderEditModal` with the design's fixed three-tier form (必填/更多设置/高级设置), and give the relay two new real behaviors those fields drive: an API-endpoint-path override and a model whitelist gate.

**Architecture:** `ProviderConnection` (the provider's local `config.json` shape) gains six new optional fields. Two of them (`endpoint`, `whitelist`) change relay request-handling behavior; the rest (`homepage`, `upstreamProtocol`, `level`, `healthCheck`) are stored for the UI and future features (see Global Constraints for what's deliberately deferred). The GUI form is rewritten from a dynamic schema-renderer to a fixed field set matching the design mockup exactly, since providers in this app always use the same field set (the per-item `configSchema` mechanism remains for skill/MCP items, unaffected by this plan).

**Tech Stack:** TypeScript, Bun, React, existing `@aas/client-core`/`@aas/cli-gui` packages.

## Global Constraints

- Six new optional `ProviderConnection` fields: `homepage?: string`, `endpoint?: string`, `upstreamProtocol?: string`, `level?: number`, `whitelist?: string[]`, `healthCheck?: boolean`. All parsed defensively (malformed input silently dropped), following the exact pattern already used for `modelMapping`/`pricing` in the same file.
- `endpoint` overrides the path the relay forwards to (default remains `/v1/messages` for claude, `/responses` for codex) — this is a real behavior change, not just stored data.
- `whitelist` is enforced by the relay: non-empty whitelist + a requested model that matches none of its entries → the relay returns `403` without forwarding upstream. Empty/absent whitelist means unrestricted (current behavior, unchanged).
- `upstreamProtocol` and `healthCheck` are stored and rendered in the UI but have **no behavioral effect yet** — real protocol auto-conversion and periodic health-check polling are explicitly out of scope this iteration (see "不做的事" in the design spec). Do not implement conversion/polling logic; do not leave a `TODO` comment either — the field simply isn't read by the relay yet, which is a complete, correct state for this iteration.
- `level` (1-10) is stored but does **not** yet affect routing — the multi-provider priority/failover engine is a separate, later plan. Storing it now means the field survives forward when that plan lands.
- The provider edit form is a **fixed field set**, not driven by the catalog item's `configSchema` — this matches the design (`PROVIDER_FORM` is a hardcoded field list in the mockup, not per-item dynamic). The existing `getConfigSchema`/generic-form code path remains for non-provider categories if any exist elsewhere; this plan only replaces the provider-specific modal.
- The icon-picker field from the design ("图标": 默认/anthropic/openai/google/adobe) is explicitly **not implemented** — this app has no per-provider brand-icon rendering anywhere to consume it; building a picker with no visible effect would be dead UI. Noted as an intentional scope cut, not an oversight.
- `apps/cli-gui`'s existing `bun test` and `tsc --noEmit` must stay green throughout.

---

### Task 1: Extend `ProviderConnection` with the new config fields

**Files:**
- Modify: `apps/client-core/src/config/provider.ts`
- Modify: `apps/client-core/src/config/__tests__/provider.test.ts`

**Interfaces:**
- Produces: `ProviderConnection.homepage?: string`, `.endpoint?: string`, `.upstreamProtocol?: string`, `.level?: number`, `.whitelist?: string[]`, `.healthCheck?: boolean` — consumed by Task 2 (relay enforcement) and Task 3 (GUI form).

- [ ] **Step 1: Read the current file**

```bash
cat apps/client-core/src/config/provider.ts
```

- [ ] **Step 2: Write the failing tests**

Append to `apps/client-core/src/config/__tests__/provider.test.ts`:

```ts
test('readProviderConnection reads homepage, endpoint, upstreamProtocol, level, whitelist, healthCheck', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({
    apiKey: 'k',
    homepage: 'https://docs.example.com',
    endpoint: '/v1/chat/completions',
    upstreamProtocol: 'openai_chat',
    level: 2,
    whitelist: ['claude-*', 'gpt-4o'],
    healthCheck: true,
  }))
  const conn = await readProviderConnection(dir)
  expect(conn.homepage).toBe('https://docs.example.com')
  expect(conn.endpoint).toBe('/v1/chat/completions')
  expect(conn.upstreamProtocol).toBe('openai_chat')
  expect(conn.level).toBe(2)
  expect(conn.whitelist).toEqual(['claude-*', 'gpt-4o'])
  expect(conn.healthCheck).toBe(true)
})

test('readProviderConnection returns undefined for absent new fields', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k' }))
  const conn = await readProviderConnection(dir)
  expect(conn.homepage).toBeUndefined()
  expect(conn.endpoint).toBeUndefined()
  expect(conn.upstreamProtocol).toBeUndefined()
  expect(conn.level).toBeUndefined()
  expect(conn.whitelist).toBeUndefined()
  expect(conn.healthCheck).toBeUndefined()
})

test('readProviderConnection ignores a non-numeric level', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', level: 'high' }))
  const conn = await readProviderConnection(dir)
  expect(conn.level).toBeUndefined()
})

test('readProviderConnection ignores a whitelist with a non-string entry', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', whitelist: ['claude-*', 42] }))
  const conn = await readProviderConnection(dir)
  expect(conn.whitelist).toBeUndefined()
})

test('readProviderConnection ignores a non-boolean healthCheck', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', healthCheck: 'yes' }))
  const conn = await readProviderConnection(dir)
  expect(conn.healthCheck).toBeUndefined()
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/client-core && bun test src/config/__tests__/provider.test.ts -t "homepage|absent new fields|non-numeric level|non-string entry|non-boolean healthCheck"`
Expected: FAIL — new fields are `undefined` even when populated in the first test.

- [ ] **Step 4: Implement the new fields**

In `apps/client-core/src/config/provider.ts`, add to the `ProviderConnection` interface:

```ts
export interface ProviderConnection {
  apiKey?: string
  baseUrl?: string
  authType?: ProviderAuthType
  modelMapping?: Record<string, string>
  pricingUrl?: string
  pricing?: Record<string, ModelPricing>
  homepage?: string
  endpoint?: string
  upstreamProtocol?: string
  level?: number
  whitelist?: string[]
  healthCheck?: boolean
}
```

Add these helper functions after `readPricing`:

```ts
function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  if (value.some((entry) => typeof entry !== 'string')) return undefined
  return value as string[]
}
```

In `readProviderConnection`'s returned object, add after `pricing: readPricing(raw['pricing']),`:

```ts
      homepage: readString(raw['homepage']),
      endpoint: readString(raw['endpoint']),
      upstreamProtocol: readString(raw['upstreamProtocol']),
      level: readNumber(raw['level']),
      whitelist: readStringArray(raw['whitelist']),
      healthCheck: readBoolean(raw['healthCheck']),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/client-core && bun test src/config/__tests__/provider.test.ts`
Expected: PASS (full file, old and new tests).

- [ ] **Step 6: Type-check and commit**

Run: `cd apps/client-core && bun run type-check`
Expected: no errors.

```bash
git add apps/client-core/src/config/provider.ts apps/client-core/src/config/__tests__/provider.test.ts
git commit -m "feat(client-core): add homepage/endpoint/upstreamProtocol/level/whitelist/healthCheck to ProviderConnection"
```

---

### Task 2: Relay enforcement — endpoint path override and model whitelist gate

**Files:**
- Create: `apps/client-core/src/relay/model-whitelist.ts`
- Test: `apps/client-core/src/relay/__tests__/model-whitelist.test.ts`
- Modify: `apps/client-core/src/relay/server.ts`
- Test: check `apps/client-core/src/relay/__tests__/` for the existing server test file name first (Step 1)

**Interfaces:**
- Consumes: `ProviderConnection.endpoint`, `.whitelist` (Task 1).
- Produces: `isModelAllowed(model: string, whitelist: string[] | undefined): boolean` — pure function, also usable by a future GUI validation if needed.

- [ ] **Step 1: Read the current relay files**

```bash
cat apps/client-core/src/relay/server.ts
ls apps/client-core/src/relay/__tests__/
```

- [ ] **Step 2: Write the failing test for `isModelAllowed`**

Create `apps/client-core/src/relay/__tests__/model-whitelist.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { isModelAllowed } from '../model-whitelist'

test('isModelAllowed: undefined or empty whitelist allows everything', () => {
  expect(isModelAllowed('claude-sonnet-4-5', undefined)).toBe(true)
  expect(isModelAllowed('claude-sonnet-4-5', [])).toBe(true)
})

test('isModelAllowed: exact match', () => {
  expect(isModelAllowed('gpt-4o', ['gpt-4o'])).toBe(true)
  expect(isModelAllowed('gpt-4o-mini', ['gpt-4o'])).toBe(false)
})

test('isModelAllowed: prefix wildcard match', () => {
  expect(isModelAllowed('claude-sonnet-4-5', ['claude-*'])).toBe(true)
  expect(isModelAllowed('claude-opus-4-8', ['claude-*'])).toBe(true)
  expect(isModelAllowed('gpt-4o', ['claude-*'])).toBe(false)
})

test('isModelAllowed: vendor-prefixed wildcard strips the vendor segment before matching', () => {
  expect(isModelAllowed('claude-sonnet-4-5', ['anthropic/claude-*'])).toBe(true)
  expect(isModelAllowed('gpt-4o', ['anthropic/claude-*'])).toBe(false)
})

test('isModelAllowed: any matching entry in a multi-entry whitelist allows the model', () => {
  expect(isModelAllowed('gpt-4o', ['claude-*', 'gpt-4o'])).toBe(true)
  expect(isModelAllowed('gpt-5', ['claude-*', 'gpt-4o'])).toBe(false)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/relay/__tests__/model-whitelist.test.ts`
Expected: FAIL — cannot find module `../model-whitelist`.

- [ ] **Step 4: Implement `model-whitelist.ts`**

Create `apps/client-core/src/relay/model-whitelist.ts`:

```ts
function matchesPattern(model: string, pattern: string): boolean {
  const effectivePattern = pattern.includes('/') ? pattern.split('/').pop()! : pattern
  if (effectivePattern.endsWith('*')) {
    return model.startsWith(effectivePattern.slice(0, -1))
  }
  return model === effectivePattern
}

export function isModelAllowed(model: string, whitelist: string[] | undefined): boolean {
  if (!whitelist || whitelist.length === 0) return true
  return whitelist.some((pattern) => matchesPattern(model, pattern))
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/client-core && bun test src/relay/__tests__/model-whitelist.test.ts`
Expected: PASS (5/5).

- [ ] **Step 6: Wire endpoint override and whitelist gating into `server.ts`**

In `apps/client-core/src/relay/server.ts`, add the import:

```ts
import { isModelAllowed } from './model-whitelist'
```

After the existing `const body = await req.json().catch(() => ({}))` line and before `const startedAt = Date.now()`, insert the whitelist check:

```ts
      const requestedModelForGate = typeof (body as Record<string, unknown>)['model'] === 'string'
        ? (body as Record<string, unknown>)['model'] as string
        : undefined
      if (requestedModelForGate && !isModelAllowed(requestedModelForGate, connection.whitelist)) {
        return Response.json(
          { error: `model ${requestedModelForGate} is not in the whitelist for provider ${provider.slug}` },
          { status: 403 }
        )
      }
```

Change the `forwardRequest` call's first argument from `url.pathname` to use the endpoint override when present:

```ts
      const forwardPath = connection.endpoint || url.pathname
      const startedAt = Date.now()
      const upstreamResponse = await forwardRequest(
        forwardPath,
        body,
        {
          baseUrl: connection.baseUrl,
          apiKey: connection.apiKey,
          authType: connection.authType,
          modelMapping: connection.modelMapping,
        },
        fetchImpl
      )
```

Note: `requestedModelForGate` and the later `requestedModel` (used for usage recording, already present in the file) read the same `body['model']` field — this is intentional duplication for clarity at two distinct call sites, not a bug to consolidate; the plan `- [ ]` steps for Task 5 (usage tracking plan, already merged) established `requestedModel` for a different purpose (usage-recording key) and this task's `requestedModelForGate` serves the whitelist gate before that code runs. If you prefer, hoist a single `const requestedModel = ...` above both uses instead of computing it twice — read the current file first (Step 1) to see exactly where the existing `requestedModel` line sits, and reuse it for the gate check instead of introducing a second variable, as long as the gate check happens before `forwardRequest` is called (it must — a rejected model must never reach the upstream call).

- [ ] **Step 7: Write the failing test for the relay's whitelist/endpoint behavior**

`apps/client-core/src/relay/__tests__/server.test.ts` already has an `installProvider(slug, enabledFor, config)` helper (writes the registry entry plus `config.json`) and each test builds its own `fetchImpl` capturing the requested URL — reuse both exactly as-is. Append these two tests to that file:

```ts
test('returns 403 and does not forward when the requested model is not in the whitelist', async () => {
  await installProvider('test-provider', { codex: true }, {
    apiKey: 'sk-test', baseUrl: 'https://upstream.example.com', whitelist: ['claude-*'],
  })

  let called = false
  const fetchImpl = (async () => {
    called = true
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  const res = await fetch(`http://127.0.0.1:${server.port}/responses`, {
    method: 'POST',
    body: JSON.stringify({ model: 'gpt-4o' }),
  })

  expect(res.status).toBe(403)
  expect(called).toBe(false)
})

test('forwards to the endpoint override path instead of the route default when connection.endpoint is set', async () => {
  await installProvider('test-provider', { claude: true }, {
    apiKey: 'sk-test', baseUrl: 'https://upstream.example.com', endpoint: '/v1/chat/completions',
  })

  let capturedUrl: string | undefined
  const fetchImpl = (async (url: string) => {
    capturedUrl = url
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  await fetch(`http://127.0.0.1:${server.port}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'claude-3-5-sonnet' }),
  })

  expect(capturedUrl).toBe('https://upstream.example.com/v1/chat/completions')
})
```

Run them, watch them fail, then confirm Step 6's implementation makes them pass.

- [ ] **Step 8: Run the full relay test suite**

Run: `cd apps/client-core && bun test src/relay`
Expected: all pass, including the two new tests and no regressions in existing ones.

- [ ] **Step 9: Type-check and commit**

Run: `cd apps/client-core && bun run type-check`
Expected: no errors.

```bash
git add apps/client-core/src/relay/model-whitelist.ts apps/client-core/src/relay/__tests__/model-whitelist.test.ts apps/client-core/src/relay/server.ts apps/client-core/src/relay/__tests__/*.test.ts
git commit -m "feat(client-core): enforce provider model whitelist and endpoint path override in the relay"
```

---

### Task 3: Provider edit form rebuild (GUI)

**Files:**
- Modify: `apps/cli-gui/src/components/ProviderEditModal.tsx`
- Modify: `apps/cli-gui/src/components/__tests__/ProviderEditModal.test.tsx`

**Interfaces:**
- Consumes: `callRpc` (`../lib/rpc`), `info`/`setConfig`/`enable`/`disable`/`parsePricingFromUrl` RPC methods (all already exist — `info`, `setConfig`, `enable`, `disable` from the original engine; `parsePricingFromUrl` from the usage-tracking plan, already merged to `main`).
- Produces: `ProviderEditModal` keeps its existing external props (`{ slug: string; open: boolean; onOpenChange: (open: boolean) => void }`) — no change to how `ResourceList.tsx` invokes it.

- [ ] **Step 1: Read the current component and its test file**

```bash
cat apps/cli-gui/src/components/ProviderEditModal.tsx
cat apps/cli-gui/src/components/__tests__/ProviderEditModal.test.tsx
```

- [ ] **Step 2: Write the failing tests**

Replace the full contents of `apps/cli-gui/src/components/__tests__/ProviderEditModal.test.tsx`:

```tsx
import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ProviderEditModal } from '../ProviderEditModal'
import * as rpcModule from '../../lib/rpc'

afterEach(() => { cleanup(); mock.restore() })

const publisher = { id: 'p', slug: 'yls', name: 'yls', avatarUrl: '', tier: 'community' as const }

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) =>
    handlers[method]?.(...args)) as typeof rpcModule.callRpc)
}

function renderModal(handlers?: Record<string, (...args: unknown[]) => unknown>) {
  mockRpc({
    info: () => ({
      slug: 'yls-me', category: 'provider', version: '0.9.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude', 'codex'], enabledFor: { claude: false, codex: true },
      name: 'yls-me', description: 'desc', readmeUrl: '', icon: '', publisher, tags: [], downloads: 0,
      currentConfig: { apiKey: 'sk-real', baseUrl: 'https://code.ylsagi.com/codex', authType: 'bearer', level: 2, whitelist: ['claude-*'], healthCheck: true },
    }),
    setConfig: () => undefined,
    enable: () => undefined,
    disable: () => undefined,
    ...handlers,
  })
  return render(<ProviderEditModal slug="yls-me" open onOpenChange={() => {}} />)
}

test('shows the required fields grid with current values from info()', async () => {
  renderModal()
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  expect(screen.getByText('API 密钥')).toBeInTheDocument()
  expect(screen.getByText('适用客户端')).toBeInTheDocument()
})

test('targets picker reflects enabledFor and toggling calls enable/disable', async () => {
  const enable = mock(() => undefined)
  renderModal({ enable })
  await waitFor(() => screen.getByLabelText('Claude Code'))
  fireEvent.click(screen.getByLabelText('Claude Code'))
  await waitFor(() => expect(enable).toHaveBeenCalledWith('yls-me', 'claude'))
})

test('更多设置 is collapsed by default and expands to show baseUrl/homepage/endpoint/upstreamProtocol/level', async () => {
  renderModal()
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  expect(screen.queryByText('API 地址')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('更多设置'))
  expect(screen.getByText('API 地址')).toBeInTheDocument()
  expect(screen.getByText('官网地址')).toBeInTheDocument()
  expect(screen.getByText('API 端点')).toBeInTheDocument()
  expect(screen.getByText('上游协议')).toBeInTheDocument()
  expect(screen.getByText('优先级分组')).toBeInTheDocument()
})

test('高级设置 is collapsed by default and expands to show whitelist/mapping/healthCheck', async () => {
  renderModal()
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  expect(screen.queryByText('模型白名单')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('高级设置'))
  expect(screen.getByText('模型白名单')).toBeInTheDocument()
  expect(screen.getByText('模型映射')).toBeInTheDocument()
  expect(screen.getByText('可用性监控')).toBeInTheDocument()
  expect(screen.getByText('claude-*')).toBeInTheDocument()
})

test('adding a whitelist entry and saving calls setConfig with the updated whitelist array', async () => {
  const setConfig = mock(() => undefined)
  renderModal({ setConfig })
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.click(screen.getByText('高级设置'))
  fireEvent.change(screen.getByPlaceholderText('输入模型名称，如 claude-*'), { target: { value: 'gpt-4o' } })
  fireEvent.click(screen.getByText('添加'))
  await waitFor(() => expect(setConfig).toHaveBeenCalled())
  const [, values] = setConfig.mock.calls[setConfig.mock.calls.length - 1] as [string, Record<string, unknown>]
  expect(values.whitelist).toEqual(['claude-*', 'gpt-4o'])
})

test('toggling 可用性监控 calls setConfig with healthCheck flipped', async () => {
  const setConfig = mock(() => undefined)
  renderModal({ setConfig })
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.click(screen.getByText('高级设置'))
  fireEvent.click(screen.getByLabelText('可用性监控'))
  await waitFor(() => expect(setConfig).toHaveBeenCalled())
  const [, values] = setConfig.mock.calls[setConfig.mock.calls.length - 1] as [string, Record<string, unknown>]
  expect(values.healthCheck).toBe(false)
})

test('解析定价 button calls parsePricingFromUrl and fills the pricing table for review', async () => {
  const parsePricingFromUrl = mock(() => ({ 'gpt-5-codex': { input: 1.75, output: 14 } }))
  renderModal({ parsePricingFromUrl })
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.click(screen.getByText('更多设置'))
  fireEvent.change(screen.getByPlaceholderText('https://docs.example.com/pricing'), { target: { value: 'https://example.com/pricing' } })
  fireEvent.click(screen.getByText('解析定价'))
  await waitFor(() => expect(parsePricingFromUrl).toHaveBeenCalledWith('https://example.com/pricing'))
  await waitFor(() => screen.getByDisplayValue('gpt-5-codex'))
  expect(screen.getByText('示例数据，请核对后保存')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/ProviderEditModal.test.tsx`
Expected: FAIL — the current component doesn't render most of these labels/fields.

- [ ] **Step 4: Implement the rebuilt `ProviderEditModal.tsx`**

Replace the full contents of `apps/cli-gui/src/components/ProviderEditModal.tsx`:

```tsx
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import type { ItemDetail, ModelPricing, ToolTarget } from '@aas/types'
import { X } from 'lucide-react'
import { callRpc } from '../lib/rpc'

interface ProviderEditModalProps {
  slug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface EditValues {
  apiKey: string
  baseUrl: string
  homepage: string
  endpoint: string
  upstreamProtocol: string
  authType: 'bearer' | 'anthropic' | 'custom'
  customHeader: string
  level: string
  whitelist: string[]
  modelMapping: Array<{ from: string; to: string }>
  healthCheck: boolean
  pricingUrl: string
  pricing: Record<string, ModelPricing>
}

const UPSTREAM_PROTOCOLS = ['自动检测', 'openai_chat', 'claude_messages', 'codex_responses']
const LEVELS = Array.from({ length: 10 }, (_, i) => String(i + 1))

function toEditValues(current: Record<string, unknown> | undefined): EditValues {
  const c = current ?? {}
  const rawAuthType = c['authType']
  const authType: EditValues['authType'] =
    rawAuthType === 'anthropic' ? 'anthropic' : rawAuthType && typeof rawAuthType === 'object' ? 'custom' : 'bearer'
  const customHeader =
    rawAuthType && typeof rawAuthType === 'object' ? String((rawAuthType as Record<string, unknown>)['header'] ?? '') : ''
  const mapping = c['modelMapping']
  const modelMapping =
    mapping && typeof mapping === 'object'
      ? Object.entries(mapping as Record<string, unknown>).map(([from, to]) => ({ from, to: String(to) }))
      : []
  const whitelist = Array.isArray(c['whitelist']) ? (c['whitelist'] as string[]) : []
  const pricing = c['pricing'] && typeof c['pricing'] === 'object' ? (c['pricing'] as Record<string, ModelPricing>) : {}

  return {
    apiKey: String(c['apiKey'] ?? ''),
    baseUrl: String(c['baseUrl'] ?? ''),
    homepage: String(c['homepage'] ?? ''),
    endpoint: String(c['endpoint'] ?? ''),
    upstreamProtocol: String(c['upstreamProtocol'] ?? '自动检测'),
    authType,
    customHeader,
    level: String(c['level'] ?? '1'),
    whitelist,
    modelMapping,
    healthCheck: c['healthCheck'] === true,
    pricingUrl: String(c['pricingUrl'] ?? ''),
    pricing,
  }
}

function toConfigPayload(values: EditValues): Record<string, unknown> {
  const authType =
    values.authType === 'custom' ? { header: values.customHeader } : values.authType

  return {
    apiKey: values.apiKey,
    baseUrl: values.baseUrl,
    homepage: values.homepage,
    endpoint: values.endpoint,
    upstreamProtocol: values.upstreamProtocol,
    authType,
    level: Number(values.level),
    whitelist: values.whitelist,
    modelMapping: Object.fromEntries(values.modelMapping.map((m) => [m.from, m.to])),
    healthCheck: values.healthCheck,
    pricingUrl: values.pricingUrl,
    pricing: values.pricing,
  }
}

export function ProviderEditModal({ slug, open, onOpenChange }: ProviderEditModalProps) {
  const [targets, setTargets] = useState<Partial<Record<ToolTarget, boolean>>>({})
  const [values, setValues] = useState<EditValues>(toEditValues(undefined))
  const [moreOpen, setMoreOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [wlDraft, setWlDraft] = useState('')
  const [mapFromDraft, setMapFromDraft] = useState('')
  const [mapToDraft, setMapToDraft] = useState('')

  useEffect(() => {
    if (!open) return
    callRpc<ItemDetail>('info', [slug]).then((detail) => {
      setTargets(detail.enabledFor)
      setValues(toEditValues(detail.currentConfig))
    })
  }, [open, slug])

  async function persist(next: EditValues) {
    setValues(next)
    await callRpc('setConfig', [slug, toConfigPayload(next)])
  }

  async function toggleTarget(target: ToolTarget) {
    const isEnabled = !!targets[target]
    await callRpc(isEnabled ? 'disable' : 'enable', [slug, target])
    setTargets((prev) => ({ ...prev, [target]: !isEnabled }))
  }

  function addWhitelist() {
    const trimmed = wlDraft.trim()
    if (!trimmed) return
    void persist({ ...values, whitelist: [...values.whitelist, trimmed] })
    setWlDraft('')
  }

  function removeWhitelist(index: number) {
    void persist({ ...values, whitelist: values.whitelist.filter((_, i) => i !== index) })
  }

  function addMapping() {
    if (!mapFromDraft.trim() || !mapToDraft.trim()) return
    void persist({ ...values, modelMapping: [...values.modelMapping, { from: mapFromDraft, to: mapToDraft }] })
    setMapFromDraft('')
    setMapToDraft('')
  }

  function removeMapping(index: number) {
    void persist({ ...values, modelMapping: values.modelMapping.filter((_, i) => i !== index) })
  }

  async function parsePricing() {
    const pricing = await callRpc<Record<string, ModelPricing>>('parsePricingFromUrl', [values.pricingUrl])
    setValues((prev) => ({ ...prev, pricing }))
  }

  function updatePricingRow(model: string, field: keyof ModelPricing, raw: string) {
    const num = Number(raw)
    void persist({
      ...values,
      pricing: { ...values.pricing, [model]: { ...values.pricing[model], [field]: Number.isNaN(num) ? 0 : num } },
    })
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-store-border bg-store-content p-6">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-store-text">编辑 {slug}</Dialog.Title>
            <Dialog.Close aria-label="关闭" className="text-store-text-2 hover:text-store-text">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-store-text-2">适用客户端</label>
              <div className="flex gap-2">
                {(['claude', 'codex'] as const).map((target) => (
                  <button
                    key={target}
                    type="button"
                    aria-label={target === 'claude' ? 'Claude Code' : 'Codex'}
                    aria-pressed={!!targets[target]}
                    onClick={() => toggleTarget(target)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                      targets[target] ? 'border-store-accent bg-store-accent-soft text-store-accent' : 'border-store-border text-store-text-2'
                    }`}
                  >
                    {target === 'claude' ? 'Claude Code' : 'Codex'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="provider-apiKey" className="mb-1 block text-xs font-medium text-store-text-2">
                API 密钥
              </label>
              <input
                id="provider-apiKey"
                value={values.apiKey}
                onChange={(e) => persist({ ...values, apiKey: e.target.value })}
                className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
              />
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-store-border">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-store-text"
            >
              {moreOpen ? '▾' : '▸'} 更多设置
            </button>
            {moreOpen && (
              <div className="flex flex-col gap-3 border-t border-store-border p-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">API 地址</label>
                  <input
                    value={values.baseUrl}
                    onChange={(e) => persist({ ...values, baseUrl: e.target.value })}
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">官网地址</label>
                  <input
                    value={values.homepage}
                    onChange={(e) => persist({ ...values, homepage: e.target.value })}
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">API 端点</label>
                  <input
                    value={values.endpoint}
                    onChange={(e) => persist({ ...values, endpoint: e.target.value })}
                    placeholder="留空使用默认，如 /v1/chat/completions"
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">上游协议</label>
                  <select
                    value={values.upstreamProtocol}
                    onChange={(e) => persist({ ...values, upstreamProtocol: e.target.value })}
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  >
                    {UPSTREAM_PROTOCOLS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">认证方式</label>
                  <select
                    value={values.authType}
                    onChange={(e) => persist({ ...values, authType: e.target.value as EditValues['authType'] })}
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  >
                    <option value="bearer">Bearer</option>
                    <option value="anthropic">X-API-Key</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
                {values.authType === 'custom' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-store-text-2">自定义 Header 名称</label>
                    <input
                      value={values.customHeader}
                      onChange={(e) => persist({ ...values, customHeader: e.target.value })}
                      className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">优先级分组</label>
                  <select
                    value={values.level}
                    onChange={(e) => persist({ ...values, level: e.target.value })}
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">定价页面链接</label>
                  <div className="flex gap-2">
                    <input
                      value={values.pricingUrl}
                      onChange={(e) => persist({ ...values, pricingUrl: e.target.value })}
                      placeholder="https://docs.example.com/pricing"
                      className="flex-1 rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                    />
                    <button
                      type="button"
                      onClick={parsePricing}
                      className="rounded-lg border border-store-border-strong px-3 py-2 text-xs font-medium text-store-text"
                    >
                      解析定价
                    </button>
                  </div>
                  {Object.keys(values.pricing).length > 0 && (
                    <div className="mt-2 flex flex-col gap-2">
                      <p className="text-[10px] text-store-amber">示例数据，请核对后保存</p>
                      {Object.entries(values.pricing).map(([model, rate]) => (
                        <div key={model} className="flex items-center gap-2 text-xs">
                          <input value={model} disabled className="w-32 rounded-md border border-store-border bg-store-panel-2 px-2 py-1 text-store-text-2" />
                          <input
                            value={rate.input}
                            onChange={(e) => updatePricingRow(model, 'input', e.target.value)}
                            className="w-16 rounded-md border border-store-border bg-store-panel px-2 py-1 text-store-text"
                          />
                          <input
                            value={rate.output}
                            onChange={(e) => updatePricingRow(model, 'output', e.target.value)}
                            className="w-16 rounded-md border border-store-border bg-store-panel px-2 py-1 text-store-text"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 rounded-lg border border-store-border">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-store-text"
            >
              {advancedOpen ? '▾' : '▸'} 高级设置
            </button>
            {advancedOpen && (
              <div className="flex flex-col gap-4 border-t border-store-border p-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-store-text-2">模型白名单</p>
                  <div className="flex gap-2">
                    <input
                      value={wlDraft}
                      onChange={(e) => setWlDraft(e.target.value)}
                      placeholder="输入模型名称，如 claude-*"
                      className="flex-1 rounded-lg border border-store-border bg-store-panel px-3 py-2 text-xs text-store-text"
                    />
                    <button type="button" onClick={addWhitelist} className="rounded-lg border border-store-border-strong px-3 py-2 text-xs font-medium text-store-text">
                      添加
                    </button>
                  </div>
                  {values.whitelist.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {values.whitelist.map((w, i) => (
                        <span key={`${w}-${i}`} className="flex items-center gap-1 rounded-md bg-store-panel-2 px-2 py-1 font-mono text-xs text-store-text">
                          {w}
                          <button type="button" onClick={() => removeWhitelist(i)} className="text-store-text-3 hover:text-store-red">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium text-store-text-2">模型映射</p>
                  <div className="flex items-center gap-2">
                    <input
                      value={mapFromDraft}
                      onChange={(e) => setMapFromDraft(e.target.value)}
                      placeholder="CLI 模型（如 claude-*）"
                      className="min-w-0 flex-1 rounded-lg border border-store-border bg-store-panel px-3 py-2 text-xs text-store-text"
                    />
                    <span className="text-store-text-3">→</span>
                    <input
                      value={mapToDraft}
                      onChange={(e) => setMapToDraft(e.target.value)}
                      placeholder="供应商模型（如 kimi-k2）"
                      className="min-w-0 flex-1 rounded-lg border border-store-border bg-store-panel px-3 py-2 text-xs text-store-text"
                    />
                    <button type="button" onClick={addMapping} className="rounded-lg border border-store-border-strong px-3 py-2 text-xs font-medium text-store-text">
                      添加
                    </button>
                  </div>
                  {values.modelMapping.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {values.modelMapping.map((m, i) => (
                        <div key={`${m.from}-${i}`} className="flex items-center gap-2 text-xs text-store-text">
                          <span className="font-mono">{m.from} → {m.to}</span>
                          <button type="button" onClick={() => removeMapping(i)} className="text-store-text-3 hover:text-store-red">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-store-text">可用性监控</p>
                    <p className="text-[10px] text-store-text-3">启用后会定期健康检查，监控此供应商的可用性</p>
                  </div>
                  <button
                    type="button"
                    aria-label="可用性监控"
                    aria-pressed={values.healthCheck}
                    onClick={() => persist({ ...values, healthCheck: !values.healthCheck })}
                    className={`h-6 w-11 rounded-full p-0.5 ${values.healthCheck ? 'bg-store-accent' : 'bg-store-border-strong'}`}
                  >
                    <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${values.healthCheck ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/ProviderEditModal.test.tsx`
Expected: PASS (8/8).

- [ ] **Step 6: Run the full `apps/cli-gui` suite to confirm no regressions**

Run: `cd apps/cli-gui && bun test`
Expected: all pass — `ResourceList.test.tsx` opens `ProviderEditModal` in one of its tests (clicking "编辑"); confirm that test still passes with the rebuilt component (it only asserts the modal opens, not its internal fields, so it should be unaffected, but verify directly rather than assuming).

- [ ] **Step 7: Type-check and commit**

Run: `cd apps/cli-gui && bun run type-check`
Expected: no errors.

```bash
git add apps/cli-gui/src/components/ProviderEditModal.tsx apps/cli-gui/src/components/__tests__/ProviderEditModal.test.tsx
git commit -m "feat(cli-gui): rebuild ProviderEditModal as the design's fixed three-tier form"
```

---

### Task 4: Final integration pass — real environment test

**Files:** None (verification only).

- [ ] **Step 1: Run the full monorepo test suite and type-check**

```bash
npx turbo run test type-check
```
Expected: all tasks pass.

- [ ] **Step 2: Real-environment smoke test — whitelist gate and endpoint override**

```bash
mkdir -p /tmp/aas-form-smoke
export AAS_HOME=/tmp/aas-form-smoke
export CLAUDE_CONFIG_DIR=/tmp/aas-form-smoke/claude
export CODEX_CONFIG_DIR=/tmp/aas-form-smoke/codex
```

Install a provider, enable it for `codex`, then edit its `config.json` directly to set `whitelist: ["claude-*"]` and start the relay. Send a request with `"model": "gpt-4o"` to the relay's codex route and confirm you get a `403` with a whitelist-rejection message, and that no upstream request was made (check your mock/real upstream's logs, or just observe the response came back immediately without network latency to a real endpoint). Then remove the whitelist restriction (or add a matching entry), send the same request again, and confirm it forwards normally.

Separately, set `endpoint: "/v1/chat/completions"` on a provider and confirm (via a real request, or by temporarily logging the forwarded URL) that the relay calls that path instead of the route default.

- [ ] **Step 3: GUI smoke test**

Run `make dev-gui`, open a provider's "编辑" modal, confirm: the required fields (适用客户端/API 密钥) show correctly; 更多设置 and 高级设置 are collapsed by default and expand correctly; adding a whitelist entry and a model mapping row both persist (close and reopen the modal, confirm they're still there); toggling 可用性监控 persists; clicking "解析定价" fills in the mock pricing table with the "示例数据，请核对后保存" notice.

- [ ] **Step 4: Clean up and report**

```bash
rm -rf /tmp/aas-form-smoke
```

No commit for this task — record the smoke-test results in the task report for the final whole-branch review to reference.
