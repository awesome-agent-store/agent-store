# Web Store Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `apps/market`'s browse/detail/publish experience to match `ui/Agent Store.dc.html`'s visual language and drawer/modal interaction model, backed by mock data.

**Architecture:** New design tokens are added to Tailwind (additive, existing `ray-*` tokens stay so untouched pages — `/dashboard`, `/auth/*` — keep working). The store browse page, item/publisher detail, and publish flow are rebuilt as: a real route for the main grid, Radix-Dialog-based drawers/modal rendered via Next.js intercepting + parallel routes (so they're linkable and back-button-friendly), and full-page fallbacks for direct load. All data comes from a new `lib/mock/` module (same shapes as `@aas/types`), not `lib/queries/*`. Client-only state (favorites, install toggle, user-published items, theme, locale) lives in a single React context backed by `localStorage`.

**Tech Stack:** Next.js 14 (App Router), React 18, Tailwind CSS, `@radix-ui/react-dialog`, `lucide-react`, `next-intl` (no URL-prefix routing), Bun test + Testing Library (existing conventions).

## Global Constraints

- All new UI copy is Simplified Chinese by default, with an English translation available via `next-intl` — no third language is enabled (matches `ui/README.md` LANGS: zh/en enabled, ja/ko/es disabled).
- Do not remove or rename existing `ray-*` Tailwind tokens, `lib/queries/*`, `lib/db-types.ts`, or any Supabase-backed API route — they're out of scope and other pages depend on them.
- `/dashboard` and `/auth/*` pages are not touched.
- No real install/uninstall/network side effects from the Web Store UI — Install/Uninstall/Publish only mutate local React/`localStorage` state.
- Follow existing test conventions exactly: Bun test + `@testing-library/react`, `happy-dom` environment (already configured), `mock.module('next/link', ...)` pattern for any test that renders a `next/link`-based component (see `components/__tests__/ItemCard.test.tsx`).
- Exact color/spacing/copy values come from `ui/README.md`'s token tables and `ui/Agent Store.dc.html` — when a step below references "per the README token table," open `ui/README.md` for the literal value before writing the code.

---

### Task 1: Add new dependencies

**Files:**
- Modify: `apps/market/package.json`

**Interfaces:**
- Produces: `@radix-ui/react-dialog`, `lucide-react`, `next-intl` importable from any file in `apps/market`.

- [ ] **Step 1: Add dependencies to package.json**

Edit `apps/market/package.json`, add to `"dependencies"`:

```json
    "@radix-ui/react-dialog": "^1.1.1",
    "lucide-react": "^0.400.0",
    "next-intl": "^3.19.1",
```

(Keep existing entries; insert alphabetically among the current dependency list.)

- [ ] **Step 2: Install**

Run: `pnpm install` (from repo root)
Expected: lockfile updates, no errors; `node_modules/@radix-ui/react-dialog`, `node_modules/lucide-react`, `node_modules/next-intl` exist under `apps/market` or the workspace root.

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd apps/market && bun test`
Expected: all existing tests pass (baseline before any code changes).

- [ ] **Step 4: Commit**

```bash
git add apps/market/package.json pnpm-lock.yaml
git commit -m "chore(market): add radix-dialog, lucide-react, next-intl dependencies"
```

---

### Task 2: Design tokens (Tailwind + CSS variables + theme toggle plumbing)

**Files:**
- Modify: `apps/market/tailwind.config.ts`
- Modify: `apps/market/app/globals.css`

**Interfaces:**
- Produces: Tailwind color tokens `wall`, `win`, `sidebar`, `content`, `chrome`, `panel`, `panel-2`, `border-2` (border-strong), `text`, `text-2`, `text-3`, `accent`, `accentSoft`, `green`, `amber`, `red` — all resolving to `var(--<name>)` — usable as `bg-panel`, `text-text-2`, etc. `data-theme="light"` on `<html>` swaps the CSS variable values.

- [ ] **Step 1: Add CSS custom properties to globals.css**

Add to `apps/market/app/globals.css`, before the existing `@tailwind` directives:

```css
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

[data-theme='light'] {
  --win: #ffffff;
  --sidebar: #f4f4f7;
  --content: #fbfbfc;
  --chrome: #ececf0;
  --panel: #ffffff;
  --panel-2: #f5f5f8;
  --border: rgba(0, 0, 0, 0.09);
  --border-strong: rgba(0, 0, 0, 0.18);
  --text: #191920;
  --text-2: #5d5d68;
  --text-3: #9797a2;
  --accent: #5b54e8;
  --green: #16a06a;
  --red: #e0483f;
}
```

- [ ] **Step 2: Wire tokens into Tailwind config**

Edit `apps/market/tailwind.config.ts`, add a sibling key to `ray` under `theme.extend.colors` (do not remove `ray`):

```ts
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
```

This produces Tailwind utilities like `bg-store-panel`, `text-store-text-2`, `border-store-border` — used by every new component in this plan (kept namespaced under `store-` so they never collide with `ray-*`).

- [ ] **Step 3: Type-check**

Run: `cd apps/market && bun run type-check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/market/tailwind.config.ts apps/market/app/globals.css
git commit -m "feat(market): add store design tokens (dark/light CSS vars + Tailwind)"
```

---

### Task 3: Mock data module

**Files:**
- Create: `apps/market/lib/mock/publishers.ts`
- Create: `apps/market/lib/mock/items.ts`
- Test: `apps/market/lib/mock/__tests__/items.test.ts`

**Interfaces:**
- Produces:
  - `MOCK_PUBLISHERS: Publisher[]` (from `lib/mock/publishers.ts`)
  - `MOCK_ITEMS: Item[]` (from `lib/mock/items.ts`)
  - `getItems(options: { category?: 'provider' | 'skill' | 'mcp' | null; q?: string; sort?: 'downloads' | 'created' | 'rating' }): Item[]`
  - `getItemBySlug(slug: string): Item | null`
  - `getFeaturedItems(): Item[]`
  - `getPublisherBySlug(slug: string): Publisher | null`
  - `getPublisherItems(publisherSlug: string): Item[]`
- Consumes: `Item`, `Publisher` types from `@aas/types`.

- [ ] **Step 1: Write the failing test**

Create `apps/market/lib/mock/__tests__/items.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { MOCK_ITEMS, getItems, getItemBySlug, getFeaturedItems } from '../items'

test('MOCK_ITEMS covers all three categories', () => {
  const categories = new Set(MOCK_ITEMS.map((i) => i.category))
  expect(categories).toEqual(new Set(['provider', 'skill', 'mcp']))
})

test('getItems with no options returns all items', () => {
  expect(getItems({})).toHaveLength(MOCK_ITEMS.length)
})

test('getItems filters by category', () => {
  const result = getItems({ category: 'mcp' })
  expect(result.length).toBeGreaterThan(0)
  expect(result.every((i) => i.category === 'mcp')).toBe(true)
})

test('getItems filters by query across name/description/tags', () => {
  const result = getItems({ q: 'frontend' })
  expect(result.length).toBeGreaterThan(0)
})

test('getItems sorts by downloads descending by default', () => {
  const result = getItems({})
  for (let i = 1; i < result.length; i++) {
    expect(result[i - 1].downloads).toBeGreaterThanOrEqual(result[i].downloads)
  }
})

test('getItemBySlug returns the matching item', () => {
  const first = MOCK_ITEMS[0]
  expect(getItemBySlug(first.slug)?.id).toBe(first.id)
})

test('getItemBySlug returns null for unknown slug', () => {
  expect(getItemBySlug('does-not-exist')).toBeNull()
})

test('getFeaturedItems returns at most 6 items', () => {
  expect(getFeaturedItems().length).toBeLessThanOrEqual(6)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/market && bun test lib/mock/__tests__/items.test.ts`
Expected: FAIL — `Cannot find module '../items'`

- [ ] **Step 3: Write `lib/mock/publishers.ts`**

```ts
import type { Publisher } from '@aas/types'

export const MOCK_PUBLISHERS: Publisher[] = [
  {
    id: 'pub-anthropic',
    slug: 'anthropic',
    name: 'Anthropic',
    avatarUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=anthropic',
    tier: 'official',
    bio: '构建 Claude 与 Claude Code 的团队官方发布。',
  },
  {
    id: 'pub-openai',
    slug: 'openai',
    name: 'OpenAI',
    avatarUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=openai',
    tier: 'official',
    bio: 'GPT 系列模型的官方供应商配置。',
  },
  {
    id: 'pub-yls',
    slug: 'yls-me',
    name: 'YLS.me',
    avatarUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=yls',
    tier: 'verified',
    bio: '已验证的第三方模型中转服务。',
  },
  {
    id: 'pub-community-fox',
    slug: 'devfox',
    name: 'devfox',
    avatarUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=devfox',
    tier: 'community',
    bio: '独立开发者，专注前端工具技能。',
  },
]

export function getPublisherBySlug(slug: string): Publisher | null {
  return MOCK_PUBLISHERS.find((p) => p.slug === slug) ?? null
}
```

- [ ] **Step 4: Write `lib/mock/items.ts`**

```ts
import type { Item } from '@aas/types'
import { MOCK_PUBLISHERS, getPublisherBySlug as getPublisherBySlugImpl } from './publishers'

export { getPublisherBySlugImpl as getPublisherBySlug }

function publisher(slug: string) {
  const p = MOCK_PUBLISHERS.find((pub) => pub.slug === slug)
  if (!p) throw new Error(`Unknown mock publisher slug: ${slug}`)
  return p
}

export const MOCK_ITEMS: Item[] = [
  {
    id: 'item-superpowers',
    slug: 'superpowers',
    name: 'Superpowers',
    description: '一套用于头脑风暴、写计划、TDD 执行的技能合集，覆盖完整开发流程。',
    readmeUrl: 'https://example.com/readme/superpowers.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=superpowers',
    category: 'skill',
    version: '2.4.0',
    publisher: publisher('anthropic'),
    compatibleWith: ['claude', 'codex'],
    tags: ['workflow', 'planning', 'tdd'],
    downloads: 128_000,
    rating: 4.9,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-06-20T00:00:00Z',
    contentUrl: 'https://example.com/content/superpowers.zip',
  },
  {
    id: 'item-pdf-processing',
    slug: 'pdf-processing',
    name: 'PDF Processing',
    description: '读取、生成、审阅 PDF 文件，支持渲染检查与内容抽取。',
    readmeUrl: 'https://example.com/readme/pdf-processing.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=pdf',
    category: 'skill',
    version: '1.3.2',
    publisher: publisher('anthropic'),
    compatibleWith: ['claude', 'codex'],
    tags: ['pdf', 'documents'],
    downloads: 64_500,
    rating: 4.7,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-04-10T00:00:00Z',
    updatedAt: '2026-06-15T00:00:00Z',
    contentUrl: 'https://example.com/content/pdf-processing.zip',
  },
  {
    id: 'item-frontend-design',
    slug: 'frontend-design',
    name: 'Frontend Design',
    description: '为新建或重塑 UI 提供有主见的视觉设计指导，避免千篇一律的默认样式。',
    readmeUrl: 'https://example.com/readme/frontend-design.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=frontend',
    category: 'skill',
    version: '1.0.5',
    publisher: publisher('devfox'),
    compatibleWith: ['claude'],
    tags: ['design', 'frontend', 'ui'],
    downloads: 31_200,
    rating: 4.5,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-25T00:00:00Z',
    contentUrl: 'https://example.com/content/frontend-design.zip',
  },
  {
    id: 'item-openai-provider',
    slug: 'openai-provider',
    name: 'OpenAI Provider',
    description: 'OpenAI 官方模型接入配置，支持 GPT-4o 系列。',
    readmeUrl: 'https://example.com/readme/openai-provider.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=openai-provider',
    category: 'provider',
    version: '1.8.0',
    publisher: publisher('openai'),
    compatibleWith: ['claude', 'codex'],
    tags: ['openai', 'gpt'],
    downloads: 890_000,
    rating: 4.8,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-06-28T00:00:00Z',
    configSchema: {},
    supportedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1'],
  },
  {
    id: 'item-yls-provider',
    slug: 'yls-me',
    name: 'YLS.me 中转',
    description: '已验证的第三方模型中转服务，支持多模型映射与延迟监控。',
    readmeUrl: 'https://example.com/readme/yls-me.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=yls-provider',
    category: 'provider',
    version: '0.9.1',
    publisher: publisher('yls-me'),
    compatibleWith: ['codex'],
    tags: ['relay', 'proxy'],
    downloads: 12_800,
    rating: 4.2,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-03-20T00:00:00Z',
    updatedAt: '2026-06-10T00:00:00Z',
    configSchema: {},
    supportedModels: ['gpt-4o', 'claude-3-7-sonnet'],
  },
  {
    id: 'item-mcp-fs',
    slug: 'filesystem-mcp',
    name: 'Filesystem MCP',
    description: '本地文件系统访问的 MCP 服务，通过 stdio 启动。',
    readmeUrl: 'https://example.com/readme/filesystem-mcp.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=fs-mcp',
    category: 'mcp',
    version: '0.5.3',
    publisher: publisher('anthropic'),
    compatibleWith: ['claude', 'codex'],
    tags: ['mcp', 'filesystem'],
    downloads: 45_600,
    rating: 4.6,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-06-05T00:00:00Z',
    transport: 'stdio',
    serverCommand: 'npx -y @modelcontextprotocol/server-filesystem',
    configSchema: {},
  },
  {
    id: 'item-mcp-search',
    slug: 'web-search-mcp',
    name: 'Web Search MCP',
    description: '远程 HTTP MCP 服务，提供实时网页检索能力。',
    readmeUrl: 'https://example.com/readme/web-search-mcp.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=search-mcp',
    category: 'mcp',
    version: '1.1.0',
    publisher: publisher('devfox'),
    compatibleWith: ['claude'],
    tags: ['mcp', 'search'],
    downloads: 9_400,
    rating: 4.1,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-05-18T00:00:00Z',
    updatedAt: '2026-06-22T00:00:00Z',
    transport: 'http',
    url: 'https://mcp.example.com/web-search',
    configSchema: {},
  },
]

export interface GetMockItemsOptions {
  category?: 'provider' | 'skill' | 'mcp' | null
  q?: string
  sort?: 'downloads' | 'created' | 'rating'
}

function matchesQuery(item: Item, q: string): boolean {
  const needle = q.toLowerCase()
  return (
    item.name.toLowerCase().includes(needle) ||
    item.description.toLowerCase().includes(needle) ||
    item.tags.some((tag) => tag.toLowerCase().includes(needle))
  )
}

export function getItems(options: GetMockItemsOptions): Item[] {
  const { category, q, sort = 'downloads' } = options
  let result = MOCK_ITEMS.slice()

  if (category) result = result.filter((i) => i.category === category)
  if (q) result = result.filter((i) => matchesQuery(i, q))

  result.sort((a, b) => {
    if (sort === 'created') return b.createdAt.localeCompare(a.createdAt)
    if (sort === 'rating') return b.rating - a.rating
    return b.downloads - a.downloads
  })

  return result
}

export function getItemBySlug(slug: string): Item | null {
  return MOCK_ITEMS.find((i) => i.slug === slug) ?? null
}

export function getFeaturedItems(): Item[] {
  return getItems({ sort: 'downloads' }).slice(0, 6)
}

export function getPublisherItems(publisherSlug: string): Item[] {
  return MOCK_ITEMS.filter((i) => i.publisher.slug === publisherSlug)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/market && bun test lib/mock/__tests__/items.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/market/lib/mock
git commit -m "feat(market): add mock catalog data for store redesign"
```

---

### Task 4: Client-side mock state (favorites / installed / published items)

**Files:**
- Create: `apps/market/components/ClientStateProvider.tsx`
- Test: `apps/market/components/__tests__/ClientStateProvider.test.tsx`

**Interfaces:**
- Produces: `ClientStateProvider` (wraps children), `useClientState()` hook returning:
  ```ts
  {
    favorites: Record<string, boolean>
    toggleFavorite: (id: string) => void
    installed: Record<string, boolean>
    toggleInstalled: (id: string) => void
    userItems: Item[]
    addUserItem: (item: Item) => void
  }
  ```
- Consumes: `Item` from `@aas/types`.

- [ ] **Step 1: Write the failing test**

Create `apps/market/components/__tests__/ClientStateProvider.test.tsx`:

```tsx
import { test, expect, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ClientStateProvider, useClientState } from '../ClientStateProvider'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

function Probe() {
  const { favorites, toggleFavorite, installed, toggleInstalled } = useClientState()
  return (
    <div>
      <button onClick={() => toggleFavorite('item-1')}>fav</button>
      <button onClick={() => toggleInstalled('item-1')}>install</button>
      <span data-testid="fav-state">{String(!!favorites['item-1'])}</span>
      <span data-testid="install-state">{String(!!installed['item-1'])}</span>
    </div>
  )
}

test('toggleFavorite flips favorite state', () => {
  render(<ClientStateProvider><Probe /></ClientStateProvider>)
  expect(screen.getByTestId('fav-state').textContent).toBe('false')
  fireEvent.click(screen.getByText('fav'))
  expect(screen.getByTestId('fav-state').textContent).toBe('true')
})

test('toggleInstalled flips installed state', () => {
  render(<ClientStateProvider><Probe /></ClientStateProvider>)
  fireEvent.click(screen.getByText('install'))
  expect(screen.getByTestId('install-state').textContent).toBe('true')
})

test('state persists to localStorage and rehydrates on remount', () => {
  const { unmount } = render(<ClientStateProvider><Probe /></ClientStateProvider>)
  fireEvent.click(screen.getByText('fav'))
  unmount()
  render(<ClientStateProvider><Probe /></ClientStateProvider>)
  expect(screen.getByTestId('fav-state').textContent).toBe('true')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/market && bun test components/__tests__/ClientStateProvider.test.tsx`
Expected: FAIL — `Cannot find module '../ClientStateProvider'`

- [ ] **Step 3: Implement `ClientStateProvider.tsx`**

```tsx
'use client'

import type { Item } from '@aas/types'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'aas-store-client-state'

interface StoredState {
  favorites: Record<string, boolean>
  installed: Record<string, boolean>
  userItems: Item[]
}

const EMPTY_STATE: StoredState = { favorites: {}, installed: {}, userItems: [] }

function readStorage(): StoredState {
  if (typeof window === 'undefined') return EMPTY_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    return { ...EMPTY_STATE, ...(JSON.parse(raw) as Partial<StoredState>) }
  } catch {
    return EMPTY_STATE
  }
}

function writeStorage(state: StoredState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

interface ClientStateValue extends StoredState {
  toggleFavorite: (id: string) => void
  toggleInstalled: (id: string) => void
  addUserItem: (item: Item) => void
}

const ClientStateContext = createContext<ClientStateValue | null>(null)

export function ClientStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredState>(EMPTY_STATE)

  useEffect(() => {
    setState(readStorage())
  }, [])

  function update(updater: (prev: StoredState) => StoredState) {
    setState((prev) => {
      const next = updater(prev)
      writeStorage(next)
      return next
    })
  }

  const value: ClientStateValue = {
    ...state,
    toggleFavorite: (id) =>
      update((prev) => ({ ...prev, favorites: { ...prev.favorites, [id]: !prev.favorites[id] } })),
    toggleInstalled: (id) =>
      update((prev) => ({ ...prev, installed: { ...prev.installed, [id]: !prev.installed[id] } })),
    addUserItem: (item) => update((prev) => ({ ...prev, userItems: [item, ...prev.userItems] })),
  }

  return <ClientStateContext.Provider value={value}>{children}</ClientStateContext.Provider>
}

export function useClientState(): ClientStateValue {
  const ctx = useContext(ClientStateContext)
  if (!ctx) throw new Error('useClientState must be used within ClientStateProvider')
  return ctx
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/market && bun test components/__tests__/ClientStateProvider.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/market/components/ClientStateProvider.tsx apps/market/components/__tests__/ClientStateProvider.test.tsx
git commit -m "feat(market): add ClientStateProvider for favorites/install/publish mock state"
```

---

### Task 5: Theme toggle

**Files:**
- Create: `apps/market/components/ThemeToggle.tsx`
- Test: `apps/market/components/__tests__/ThemeToggle.test.tsx`

**Interfaces:**
- Produces: `ThemeToggle` component (no props) — renders a button that flips `document.documentElement.dataset.theme` between `'dark'` and `'light'` and persists to `localStorage['aas-store-theme']`.

- [ ] **Step 1: Write the failing test**

Create `apps/market/components/__tests__/ThemeToggle.test.tsx`:

```tsx
import { test, expect, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ThemeToggle } from '../ThemeToggle'

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})
afterEach(() => { cleanup() })

test('defaults to dark theme', () => {
  render(<ThemeToggle />)
  expect(document.documentElement.dataset.theme).toBe('dark')
})

test('clicking toggles to light and back to dark', () => {
  render(<ThemeToggle />)
  const button = screen.getByRole('button')
  fireEvent.click(button)
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(localStorage.getItem('aas-store-theme')).toBe('light')
  fireEvent.click(button)
  expect(document.documentElement.dataset.theme).toBe('dark')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/market && bun test components/__tests__/ThemeToggle.test.tsx`
Expected: FAIL — `Cannot find module '../ThemeToggle'`

- [ ] **Step 3: Implement `ThemeToggle.tsx`**

```tsx
'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'aas-store-theme'

type Theme = 'dark' | 'light'

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const stored = (window.localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'dark'
    setTheme(stored)
    applyTheme(stored)
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
      className="flex h-10 w-10 items-center justify-center rounded-lg border border-store-border bg-store-panel text-store-text-2 hover:text-store-text"
    >
      {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/market && bun test components/__tests__/ThemeToggle.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/market/components/ThemeToggle.tsx apps/market/components/__tests__/ThemeToggle.test.tsx
git commit -m "feat(market): add ThemeToggle component"
```

---

### Task 6: i18n setup (next-intl, no URL prefix)

**Files:**
- Create: `apps/market/i18n/request.ts`
- Create: `apps/market/messages/zh.json`
- Create: `apps/market/messages/en.json`
- Create: `apps/market/components/LangSwitcher.tsx`
- Modify: `apps/market/next.config.mjs`
- Modify: `apps/market/app/layout.tsx`
- Test: `apps/market/components/__tests__/LangSwitcher.test.tsx`

**Interfaces:**
- Produces: `messages.store.*` translation keys consumable via `useTranslations('store')` in any client component wrapped by the root layout's `NextIntlClientProvider`. `LangSwitcher` component (no props) reads/writes a `locale` cookie and calls `router.refresh()`.

- [ ] **Step 1: Create message files**

Create `apps/market/messages/zh.json`:

```json
{
  "store": {
    "nav": { "explore": "探索", "docs": "文档", "publish": "发布" },
    "categories": { "all": "探索", "provider": "供应商", "skill": "技能", "mcp": "MCP" },
    "sort": { "all": "全部", "new": "最近新增", "popular": "最流行", "rating": "评分最高" },
    "search": { "placeholder": "搜索资源、标签或描述…" },
    "card": { "install": "安装", "installed": "已安装" },
    "lang": { "zh": "中文", "en": "English" }
  }
}
```

Create `apps/market/messages/en.json`:

```json
{
  "store": {
    "nav": { "explore": "Explore", "docs": "Docs", "publish": "Publish" },
    "categories": { "all": "Explore", "provider": "Providers", "skill": "Skills", "mcp": "MCP" },
    "sort": { "all": "All", "new": "Newest", "popular": "Popular", "rating": "Top rated" },
    "search": { "placeholder": "Search items, tags, or descriptions…" },
    "card": { "install": "Install", "installed": "Installed" },
    "lang": { "zh": "中文", "en": "English" }
  }
}
```

- [ ] **Step 2: Create `i18n/request.ts`**

```ts
import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export const SUPPORTED_LOCALES = ['zh', 'en'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = 'zh'

export function resolveLocale(raw: string | undefined): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as SupportedLocale)
    : DEFAULT_LOCALE
}

export default getRequestConfig(async () => {
  const locale = resolveLocale(cookies().get('locale')?.value)
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
```

- [ ] **Step 3: Wire the next-intl plugin into `next.config.mjs`**

```js
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },
}

export default withNextIntl(nextConfig)
```

- [ ] **Step 4: Wrap the root layout with `NextIntlClientProvider`**

Edit `apps/market/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AI Agent Store',
  description: 'Discover and install AI providers, skills, and MCP servers',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} className={inter.variable} data-theme="dark">
      <body className="min-h-screen bg-ray-surface-0 text-ray-fg antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Write the failing test for `LangSwitcher`**

Create `apps/market/components/__tests__/LangSwitcher.test.tsx`:

```tsx
import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const refresh = mock(() => {})
mock.module('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))
mock.module('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => ({ zh: '中文', en: 'English' }[key.split('.').pop() ?? '']),
}))

beforeEach(() => { document.cookie = 'locale=zh' })
afterEach(() => { cleanup() })

const { LangSwitcher } = await import('../LangSwitcher')

test('renders zh and en options', () => {
  render(<LangSwitcher />)
  expect(screen.getByText('中文')).toBeInTheDocument()
  expect(screen.getByText('English')).toBeInTheDocument()
})

test('selecting English sets the locale cookie and refreshes', () => {
  render(<LangSwitcher />)
  fireEvent.click(screen.getByText('English'))
  expect(document.cookie).toContain('locale=en')
  expect(refresh).toHaveBeenCalled()
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/market && bun test components/__tests__/LangSwitcher.test.tsx`
Expected: FAIL — `Cannot find module '../LangSwitcher'`

- [ ] **Step 7: Implement `LangSwitcher.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n/request'

export function LangSwitcher() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('store.lang')

  function selectLocale(next: SupportedLocale) {
    document.cookie = `locale=${next}; path=/; max-age=31536000`
    router.refresh()
  }

  return (
    <div role="group" aria-label="language" className="flex gap-1 rounded-lg border border-store-border bg-store-panel p-1 text-xs">
      {SUPPORTED_LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => selectLocale(code)}
          aria-current={locale === code}
          className={`rounded-md px-2 py-1 ${
            locale === code ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'
          }`}
        >
          {t(code) || (code === DEFAULT_LOCALE ? '中文' : 'English')}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/market && bun test components/__tests__/LangSwitcher.test.tsx`
Expected: all tests PASS.

- [ ] **Step 9: Run full suite + type-check**

Run: `cd apps/market && bun test && bun run type-check`
Expected: all pass. (`app/__tests__/page.test.tsx` still passes since layout changes don't affect it — it renders `HomePage` directly, not through `RootLayout`.)

- [ ] **Step 10: Commit**

```bash
git add apps/market/i18n apps/market/messages apps/market/components/LangSwitcher.tsx \
  apps/market/components/__tests__/LangSwitcher.test.tsx apps/market/next.config.mjs apps/market/app/layout.tsx
git commit -m "feat(market): add next-intl i18n setup (zh/en, no URL prefix) and LangSwitcher"
```

---

### Task 7: Header component

**Files:**
- Create: `apps/market/components/Header.tsx`
- Test: `apps/market/components/__tests__/Header.test.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` (Task 5), `LangSwitcher` (Task 6).
- Produces: `Header` component — renders logo, nav links (探索/文档), a "发布" button that links to `?publish=1` on the current path, `ThemeToggle`, `LangSwitcher`, and an avatar placeholder linking to `/publisher/me`.

- [ ] **Step 1: Write the failing test**

Create `apps/market/components/__tests__/Header.test.tsx`:

```tsx
import { test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'

mock.module('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))
mock.module('next/navigation', () => ({ usePathname: () => '/store' }))
mock.module('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => ({ explore: '探索', docs: '文档', publish: '发布' }[key.split('.').pop() ?? ''] ?? key),
}))

afterEach(() => { cleanup() })

const { Header } = await import('../Header')

test('renders brand name', () => {
  render(<Header />)
  expect(screen.getByText('Agent Store')).toBeInTheDocument()
})

test('renders nav links', () => {
  render(<Header />)
  expect(screen.getByText('探索')).toBeInTheDocument()
  expect(screen.getByText('文档')).toBeInTheDocument()
})

test('publish button links to ?publish=1', () => {
  render(<Header />)
  const publishLink = screen.getByText('发布').closest('a')
  expect(publishLink?.getAttribute('href')).toBe('/store?publish=1')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/market && bun test components/__tests__/Header.test.tsx`
Expected: FAIL — `Cannot find module '../Header'`

- [ ] **Step 3: Implement `Header.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Box } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { LangSwitcher } from './LangSwitcher'

export function Header() {
  const pathname = usePathname()
  const t = useTranslations('store.nav')

  return (
    <header className="flex h-16 items-center justify-between border-b border-store-border">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-store-accent text-white">
          <Box size={18} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-store-text">Agent Store</p>
          <p className="font-mono text-[10px] text-store-text-3">registry for AI agents</p>
        </div>
      </div>

      <nav className="flex items-center gap-6 text-sm text-store-text-2">
        <Link href="/store" className="hover:text-store-text">{t('explore')}</Link>
        <Link href="/docs" className="hover:text-store-text">{t('docs')}</Link>
      </nav>

      <div className="flex items-center gap-3">
        <Link
          href={`${pathname}?publish=1`}
          className="flex items-center gap-1 rounded-lg bg-store-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={16} />
          {t('publish')}
        </Link>
        <ThemeToggle />
        <LangSwitcher />
        <Link
          href="/publisher/me"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-store-accent to-store-green text-sm font-semibold text-white"
        >
          Y
        </Link>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/market && bun test components/__tests__/Header.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/market/components/Header.tsx apps/market/components/__tests__/Header.test.tsx
git commit -m "feat(market): add store Header component"
```

---

### Task 8: Badge + ItemCard restyle (stars, favorite, install state)

**Files:**
- Modify: `apps/market/components/Badge.tsx`
- Modify: `apps/market/components/ItemCard.tsx`
- Modify: `apps/market/components/__tests__/ItemCard.test.tsx`
- Test: `apps/market/components/__tests__/Badge.test.tsx` (existing — update if variant class names change)

**Interfaces:**
- Consumes: `useClientState()` from `ClientStateProvider` (Task 4).
- Produces: `ItemCard` renders a favorite heart button (`aria-label="收藏"` / `"取消收藏"`) and an install button (`aria-label` = `"安装"` when not installed, text `"已安装"` when installed) alongside existing name/description/downloads. `Badge` gains a `store-*` variant class set alongside the existing `ray-*` one (kept backward compatible — `Badge` is also used by `/dashboard`-adjacent code... actually only by `ItemCard`/detail/publisher pages which are all being restyled in this plan, so it's safe to fully restyle `Badge`).

- [ ] **Step 1: Update `Badge.tsx` to use store tokens**

```tsx
import type { Publisher } from '@aas/types'

type TierVariant = Publisher['tier']
type CategoryVariant = 'provider' | 'skill' | 'mcp'
export type BadgeVariant = TierVariant | CategoryVariant

interface BadgeProps {
  variant: BadgeVariant
  children: React.ReactNode
}

const variantClasses: Record<BadgeVariant, string> = {
  official: 'bg-store-amber/10 text-store-amber border-store-amber/30',
  verified: 'bg-[#58a6f0]/10 text-[#58a6f0] border-[#58a6f0]/30',
  community: 'bg-store-text-3/10 text-store-text-2 border-store-text-3/30',
  provider: 'bg-[#58a6f0]/10 text-[#58a6f0] border-[#58a6f0]/30',
  skill: 'bg-store-green/10 text-store-green border-store-green/30',
  mcp: 'bg-store-amber/10 text-store-amber border-store-amber/30',
}

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  )
}
```

- [ ] **Step 2: Run existing Badge test**

Run: `cd apps/market && bun test components/__tests__/Badge.test.tsx`
Expected: PASS if the existing test only checks for text content/rendering, not exact class strings. If it asserts a `ray-*` class name, update the assertion to check for the `store-*` equivalent instead (read the existing test file first, then edit only the class-name assertions).

- [ ] **Step 3: Update the failing/expected `ItemCard.test.tsx`**

Replace `apps/market/components/__tests__/ItemCard.test.tsx` with (adds `ClientStateProvider` wrapper and new assertions, keeps all existing ones):

```tsx
import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Item } from '@aas/types'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

mock.module('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

const { ItemCard } = await import('../ItemCard')
const { ClientStateProvider } = await import('../ClientStateProvider')

const mockItem: Item = {
  id: 'item-1',
  slug: 'openai-provider',
  name: 'OpenAI Provider',
  description: 'OpenAI API provider with GPT-4o support',
  readmeUrl: 'https://example.com/readme',
  icon: 'https://example.com/icon.png',
  category: 'provider',
  version: '1.2.0',
  publisher: {
    id: 'pub-1',
    slug: 'openai',
    name: 'OpenAI',
    avatarUrl: 'https://example.com/avatar.png',
    tier: 'official',
  },
  compatibleWith: ['claude', 'codex'],
  tags: ['ai', 'openai'],
  downloads: 1_200_000,
  rating: 4.8,
  status: 'published',
  installHook: { steps: [] },
  createdAt: '2026-06-18T00:00:00Z',
  updatedAt: '2026-06-18T00:00:00Z',
  configSchema: {},
  supportedModels: ['gpt-4o'],
}

function renderCard(item: Item = mockItem) {
  return render(
    <ClientStateProvider>
      <ItemCard item={item} />
    </ClientStateProvider>
  )
}

test('ItemCard renders item name', () => {
  renderCard()
  expect(screen.getByText('OpenAI Provider')).toBeInTheDocument()
})

test('ItemCard renders description', () => {
  renderCard()
  expect(screen.getByText('OpenAI API provider with GPT-4o support')).toBeInTheDocument()
})

test('ItemCard renders formatted downloads: 1.2M', () => {
  renderCard()
  expect(screen.getByText('1.2M installs')).toBeInTheDocument()
})

test('ItemCard renders 999 downloads without abbreviation', () => {
  renderCard({ ...mockItem, downloads: 999 })
  expect(screen.getByText('999 installs')).toBeInTheDocument()
})

test('ItemCard renders 1500 downloads as 1.5K', () => {
  renderCard({ ...mockItem, downloads: 1500 })
  expect(screen.getByText('1.5K installs')).toBeInTheDocument()
})

test('ItemCard links to correct detail page', () => {
  renderCard()
  const link = screen.getByRole('link')
  expect(link.getAttribute('href')).toBe('/store/provider/openai-provider')
})

test('ItemCard renders compat tools', () => {
  renderCard()
  expect(screen.getByText('claude · codex')).toBeInTheDocument()
})

test('ItemCard clicking favorite toggles aria-label', () => {
  renderCard()
  const favButton = screen.getByLabelText('收藏')
  fireEvent.click(favButton)
  expect(screen.getByLabelText('取消收藏')).toBeInTheDocument()
})

test('ItemCard clicking install shows installed state', () => {
  renderCard()
  const installButton = screen.getByLabelText('安装')
  fireEvent.click(installButton)
  expect(screen.getByText('已安装')).toBeInTheDocument()
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/market && bun test components/__tests__/ItemCard.test.tsx`
Expected: FAIL — no favorite/install buttons exist yet in current `ItemCard`.

- [ ] **Step 5: Implement the restyled `ItemCard.tsx`**

```tsx
'use client'

import type { Item } from '@aas/types'
import Link from 'next/link'
import { Heart, Star } from 'lucide-react'
import { Badge } from './Badge'
import { useClientState } from './ClientStateProvider'

interface ItemCardProps {
  item: Item
}

export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function ItemCard({ item }: ItemCardProps) {
  const { favorites, toggleFavorite, installed, toggleInstalled } = useClientState()
  const isFavorite = !!favorites[item.id]
  const isInstalled = !!installed[item.id]

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border border-store-border bg-store-panel p-4 transition-colors hover:border-store-border-strong">
      <button
        type="button"
        aria-label={isFavorite ? '取消收藏' : '收藏'}
        onClick={(e) => {
          e.preventDefault()
          toggleFavorite(item.id)
        }}
        className="absolute right-3 top-3 z-10"
      >
        <Heart size={16} className={isFavorite ? 'fill-store-red text-store-red' : 'text-store-text-3'} />
      </button>

      <Link href={`/store/${item.category}/${item.slug}`} className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-store-border bg-store-panel-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.icon} alt={item.name} className="h-8 w-8 object-contain" />
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <h3 className="truncate text-sm font-medium text-store-text">{item.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Badge variant={item.publisher.tier}>{item.publisher.tier}</Badge>
              <Badge variant={item.category}>{item.category}</Badge>
            </div>
          </div>
        </div>

        <p className="line-clamp-2 text-xs text-store-text-2">{item.description}</p>

        <div className="flex items-center gap-1 text-xs text-store-amber">
          <Star size={12} className="fill-store-amber" />
          {item.rating.toFixed(1)}
        </div>

        <div className="flex items-center justify-between text-xs text-store-text-3">
          <span>{item.compatibleWith.join(' · ')}</span>
          <span>{formatDownloads(item.downloads)} installs</span>
        </div>
      </Link>

      <button
        type="button"
        aria-label={isInstalled ? '已安装' : '安装'}
        onClick={() => toggleInstalled(item.id)}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
          isInstalled
            ? 'bg-store-green/10 text-store-green'
            : 'bg-store-accent text-white hover:opacity-90'
        }`}
      >
        {isInstalled ? '已安装' : '安装'}
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/market && bun test components/__tests__/ItemCard.test.tsx components/__tests__/Badge.test.tsx`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/market/components/Badge.tsx apps/market/components/ItemCard.tsx apps/market/components/__tests__/ItemCard.test.tsx apps/market/components/__tests__/Badge.test.tsx
git commit -m "feat(market): restyle ItemCard/Badge with store tokens, favorite + install toggles"
```

---

### Task 9: CategoryTabs, SortSelect, SearchInput restyle

**Files:**
- Modify: `apps/market/components/CategoryTabs.tsx`
- Create: `apps/market/components/SortSelect.tsx`
- Modify: `apps/market/components/SearchInput.tsx`
- Create: `apps/market/components/__tests__/CategoryTabs.test.tsx`
- Create: `apps/market/components/__tests__/SortSelect.test.tsx`

**Interfaces:**
- Produces:
  - `CategoryTabs` — unchanged props (`{ active: 'all' | 'provider' | 'skill' | 'mcp' }`), restyled, labels from `useTranslations('store.categories')`.
  - `SortSelect` — `{ active: 'downloads' | 'created' | 'rating' }`, updates `?sort=` query param, labels from `useTranslations('store.sort')`.
  - `SearchInput` — same props as before, restyled, placeholder from `useTranslations('store.search')`.

- [ ] **Step 1: Write failing test for `CategoryTabs`**

Create `apps/market/components/__tests__/CategoryTabs.test.tsx`:

```tsx
import { test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'

const push = mock(() => {})
mock.module('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/store',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({ all: '探索', provider: '供应商', skill: '技能', mcp: 'MCP' }[key.split('.').pop() ?? '']),
}))

afterEach(() => { cleanup() })

const { CategoryTabs } = await import('../CategoryTabs')

test('renders all four category labels', () => {
  render(<CategoryTabs active="all" />)
  expect(screen.getByText('探索')).toBeInTheDocument()
  expect(screen.getByText('供应商')).toBeInTheDocument()
  expect(screen.getByText('技能')).toBeInTheDocument()
  expect(screen.getByText('MCP')).toBeInTheDocument()
})

test('marks the active tab as selected', () => {
  render(<CategoryTabs active="skill" />)
  expect(screen.getByText('技能').closest('button')?.getAttribute('aria-selected')).toBe('true')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/market && bun test components/__tests__/CategoryTabs.test.tsx`
Expected: FAIL — current `CategoryTabs` renders English literals ("All", "Providers", …), not the mocked translations.

- [ ] **Step 3: Update `CategoryTabs.tsx`**

```tsx
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

type Category = 'all' | 'provider' | 'skill' | 'mcp'

interface CategoryTabsProps {
  active: Category
}

const TAB_VALUES: Category[] = ['all', 'provider', 'skill', 'mcp']

export function CategoryTabs({ active }: CategoryTabsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('store.categories')

  function handleSelect(value: Category) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete('category')
    } else {
      params.set('category', value)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div role="tablist" className="flex gap-1 rounded-lg border border-store-border bg-store-panel p-1">
      {TAB_VALUES.map((value) => (
        <button
          key={value}
          role="tab"
          aria-selected={active === value}
          onClick={() => handleSelect(value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            active === value
              ? 'bg-store-panel-2 text-store-text'
              : 'text-store-text-2 hover:text-store-text'
          }`}
        >
          {t(value)}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run `CategoryTabs` test to verify it passes**

Run: `cd apps/market && bun test components/__tests__/CategoryTabs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write failing test for `SortSelect`**

Create `apps/market/components/__tests__/SortSelect.test.tsx`:

```tsx
import { test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const push = mock(() => {})
mock.module('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/store',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({ all: '全部', new: '最近新增', popular: '最流行', rating: '评分最高' }[key.split('.').pop() ?? '']),
}))

afterEach(() => { cleanup() })

const { SortSelect } = await import('../SortSelect')

test('renders all sort options', () => {
  render(<SortSelect active="downloads" />)
  expect(screen.getByText('全部')).toBeInTheDocument()
  expect(screen.getByText('最近新增')).toBeInTheDocument()
  expect(screen.getByText('最流行')).toBeInTheDocument()
  expect(screen.getByText('评分最高')).toBeInTheDocument()
})

test('selecting an option pushes ?sort= to the router', () => {
  render(<SortSelect active="downloads" />)
  fireEvent.click(screen.getByText('评分最高'))
  expect(push).toHaveBeenCalledWith('/store?sort=rating')
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/market && bun test components/__tests__/SortSelect.test.tsx`
Expected: FAIL — `Cannot find module '../SortSelect'`

- [ ] **Step 7: Implement `SortSelect.tsx`**

```tsx
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

type Sort = 'downloads' | 'created' | 'rating'

interface SortSelectProps {
  active: Sort
}

const OPTIONS: { value: Sort; key: 'all' | 'new' | 'popular' | 'rating' }[] = [
  { value: 'downloads', key: 'all' },
  { value: 'created', key: 'new' },
  { value: 'downloads', key: 'popular' },
  { value: 'rating', key: 'rating' },
]

export function SortSelect({ active }: SortSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('store.sort')

  function handleSelect(value: Sort) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex gap-1 text-sm text-store-text-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => handleSelect(opt.value)}
          aria-pressed={active === opt.value}
          className={`rounded-md px-2 py-1 ${active === opt.value ? 'text-store-text' : 'hover:text-store-text'}`}
        >
          {t(opt.key)}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 8: Run `SortSelect` test to verify it passes**

Run: `cd apps/market && bun test components/__tests__/SortSelect.test.tsx`
Expected: PASS.

- [ ] **Step 9: Update `SearchInput.tsx` to use store tokens + i18n placeholder**

```tsx
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'

interface SearchInputProps {
  defaultValue?: string
}

export function SearchInput({ defaultValue = '' }: SearchInputProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('store.search')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.trim()
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set('q', value)
    } else {
      params.delete('q')
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const placeholder = t('placeholder')

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <Search size={16} className="text-store-text-3" />
      </div>
      <input
        type="search"
        defaultValue={defaultValue}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={placeholder}
        data-pending={isPending ? '' : undefined}
        className="w-full rounded-lg border border-store-border bg-store-panel py-2 pl-9 pr-4 text-sm text-store-text placeholder:text-store-text-3 focus:border-store-border-strong focus:outline-none"
      />
    </div>
  )
}
```

- [ ] **Step 10: Run full test suite**

Run: `cd apps/market && bun test`
Expected: all pass. (No existing test imports `SearchInput` directly with a snapshot of the old placeholder text, per the files read during planning — if one is found, update its expected placeholder string to match `store.search.placeholder`.)

- [ ] **Step 11: Commit**

```bash
git add apps/market/components/CategoryTabs.tsx apps/market/components/SortSelect.tsx apps/market/components/SearchInput.tsx apps/market/components/__tests__/CategoryTabs.test.tsx apps/market/components/__tests__/SortSelect.test.tsx
git commit -m "feat(market): restyle CategoryTabs/SearchInput, add SortSelect, wire i18n labels"
```

---

### Task 10: FeaturedCarousel

**Files:**
- Create: `apps/market/components/FeaturedCarousel.tsx`
- Test: `apps/market/components/__tests__/FeaturedCarousel.test.tsx`

**Interfaces:**
- Consumes: `Item[]` (from mock data, passed as `items` prop).
- Produces: `FeaturedCarousel({ items: Item[] })` — auto-advances every 5000ms, pauses when `document.hidden`, exposes prev/next buttons (`aria-label="上一个"` / `"下一个"`) and dot indicators (`role="button"`, `aria-label="跳转到第 N 项"`) that also reset the timer.

- [ ] **Step 1: Write the failing test**

Bun's test runner does not ship a `jest.advanceTimersByTime` equivalent, so the 5-second autoplay itself is not asserted here (it's covered by manual verification in Task 15) — this test covers the deterministic, user-driven interactions: initial render, prev/next, and dot navigation.

Create `apps/market/components/__tests__/FeaturedCarousel.test.tsx`:

```tsx
import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Item } from '@aas/types'
import { FeaturedCarousel } from '../FeaturedCarousel'

function makeItem(id: string, name: string): Item {
  return {
    id, slug: id, name, description: `${name} desc`,
    readmeUrl: '', icon: '', category: 'skill', version: '1.0.0',
    publisher: { id: 'p', slug: 'p', name: 'P', avatarUrl: '', tier: 'official' },
    compatibleWith: ['claude'], tags: [], downloads: 0, rating: 5,
    status: 'published', installHook: { steps: [] },
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    contentUrl: '',
  }
}

const items = [makeItem('a', 'Alpha'), makeItem('b', 'Beta'), makeItem('c', 'Gamma')]

afterEach(() => { cleanup() })

test('renders the first item initially', () => {
  render(<FeaturedCarousel items={items} />)
  expect(screen.getByText('Alpha')).toBeInTheDocument()
})

test('clicking next advances to the next item', () => {
  render(<FeaturedCarousel items={items} />)
  fireEvent.click(screen.getByLabelText('下一个'))
  expect(screen.getByText('Beta')).toBeInTheDocument()
})

test('clicking prev wraps around to the last item', () => {
  render(<FeaturedCarousel items={items} />)
  fireEvent.click(screen.getByLabelText('上一个'))
  expect(screen.getByText('Gamma')).toBeInTheDocument()
})

test('clicking a dot jumps to that item', () => {
  render(<FeaturedCarousel items={items} />)
  fireEvent.click(screen.getByLabelText('跳转到第 3 项'))
  expect(screen.getByText('Gamma')).toBeInTheDocument()
})

test('renders nothing for an empty item list', () => {
  const { container } = render(<FeaturedCarousel items={[]} />)
  expect(container.firstChild).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/market && bun test components/__tests__/FeaturedCarousel.test.tsx`
Expected: FAIL — `Cannot find module '../FeaturedCarousel'`

- [ ] **Step 3: Implement `FeaturedCarousel.tsx`**

The 5-second autoplay is implemented with a real `setInterval`, guarded by `document.hidden` — this is not asserted in the unit test (jsdom/happy-dom timing is flaky to assert against without a timer-mock library the project doesn't have), but is included per the design spec and is manually verifiable in the browser.

```tsx
'use client'

import type { Item } from '@aas/types'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface FeaturedCarouselProps {
  items: Item[]
}

const AUTOPLAY_MS = 5000

export function FeaturedCarousel({ items }: FeaturedCarouselProps) {
  const [index, setIndex] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (items.length <= 1) return
    timerRef.current = setInterval(() => {
      if (document.hidden) return
      setIndex((i) => (i + 1) % items.length)
    }, AUTOPLAY_MS)
  }

  useEffect(() => {
    resetTimer()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  if (items.length === 0) return null

  const current = items[index % items.length]

  function go(next: number) {
    setIndex(((next % items.length) + items.length) % items.length)
    resetTimer()
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-store-border bg-store-panel p-6">
      <Link href={`/store/${current.category}/${current.slug}`} className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-store-text">{current.name}</h2>
        <p className="line-clamp-2 text-sm text-store-text-2">{current.description}</p>
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              aria-label={`跳转到第 ${i + 1} 项`}
              onClick={() => go(i)}
              className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-store-accent' : 'bg-store-text-3'}`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="上一个" onClick={() => go(index - 1)} className="text-store-text-2 hover:text-store-text">
            <ChevronLeft size={18} />
          </button>
          <button type="button" aria-label="下一个" onClick={() => go(index + 1)} className="text-store-text-2 hover:text-store-text">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/market && bun test components/__tests__/FeaturedCarousel.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/market/components/FeaturedCarousel.tsx apps/market/components/__tests__/FeaturedCarousel.test.tsx
git commit -m "feat(market): add FeaturedCarousel component"
```

---

### Task 11: Assemble the store page (`app/store/page.tsx`) with mock data

**Files:**
- Create: `apps/market/components/ItemGrid.tsx`
- Modify: `apps/market/app/store/page.tsx`
- Modify: `apps/market/app/page.tsx`
- Modify: `apps/market/app/layout.tsx`
- Delete: `apps/market/app/__tests__/page.test.tsx`
- Create: `apps/market/app/store/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `getItems`, `getFeaturedItems` from `lib/mock/items.ts` (Task 3); `Header`, `FeaturedCarousel`, `CategoryTabs`, `SortSelect`, `SearchInput`, `ItemGrid`, `ClientStateProvider`.
- Produces: `app/store/page.tsx` becomes the store browse screen; `app/page.tsx` redirects to `/store`; root layout wraps `children` in `ClientStateProvider` (client component, safe to wrap server children per Next.js App Router rules).

- [ ] **Step 1: Create `ItemGrid.tsx`**

```tsx
import type { Item } from '@aas/types'
import { ItemCard } from './ItemCard'

interface ItemGridProps {
  items: Item[]
}

export function ItemGrid({ items }: ItemGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-store-border bg-store-panel">
        <p className="text-store-text-3">No items found.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Wrap the root layout body in `ClientStateProvider`**

Edit `apps/market/app/layout.tsx` — import and wrap:

```tsx
import { ClientStateProvider } from '@/components/ClientStateProvider'
```

Change the body's inner structure to:

```tsx
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ClientStateProvider>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </ClientStateProvider>
        </NextIntlClientProvider>
```

- [ ] **Step 3: Write the failing test for the new store page**

Create `apps/market/app/store/__tests__/page.test.tsx`:

```tsx
import { describe, test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(() => { cleanup() })

mock.module('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))
mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/store',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('next-intl', () => ({
  useTranslations: () => (key: string) => key.split('.').pop() ?? key,
}))

const { default: StorePage } = await import('../page')
const { ClientStateProvider } = await import('../../../components/ClientStateProvider')

describe('StorePage', () => {
  test('renders items from the mock catalog', async () => {
    render(<ClientStateProvider>{await StorePage({ searchParams: {} })}</ClientStateProvider>)
    expect(screen.getByText('Superpowers')).toBeInTheDocument()
  })

  test('filters by category search param', async () => {
    render(
      <ClientStateProvider>
        {await StorePage({ searchParams: { category: 'mcp' } })}
      </ClientStateProvider>
    )
    expect(screen.getByText('Filesystem MCP')).toBeInTheDocument()
    expect(screen.queryByText('Superpowers')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/market && bun test app/store/__tests__/page.test.tsx`
Expected: FAIL — current `app/store/page.tsx` queries Supabase, not the mock module, and doesn't render `Header`/`FeaturedCarousel`.

- [ ] **Step 5: Rewrite `app/store/page.tsx`**

```tsx
import { getItems, getFeaturedItems } from '@/lib/mock/items'
import { Header } from '@/components/Header'
import { FeaturedCarousel } from '@/components/FeaturedCarousel'
import { CategoryTabs } from '@/components/CategoryTabs'
import { SortSelect } from '@/components/SortSelect'
import { SearchInput } from '@/components/SearchInput'
import { ItemGrid } from '@/components/ItemGrid'

interface StorePageProps {
  searchParams: {
    category?: string
    q?: string
    sort?: string
  }
}

export default async function StorePage({ searchParams }: StorePageProps) {
  const rawCategory = searchParams.category
  const category =
    rawCategory === 'provider' || rawCategory === 'skill' || rawCategory === 'mcp'
      ? rawCategory
      : null

  const sort =
    searchParams.sort === 'created' || searchParams.sort === 'rating'
      ? searchParams.sort
      : 'downloads'

  const items = getItems({ category, q: searchParams.q, sort })
  const featured = getFeaturedItems()

  return (
    <>
      <Header />
      <main className="flex flex-col gap-6 py-8">
        <FeaturedCarousel items={featured} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CategoryTabs active={category ?? 'all'} />
          <div className="flex items-center gap-3">
            <SearchInput defaultValue={searchParams.q} />
            <SortSelect active={sort} />
          </div>
        </div>

        <ItemGrid items={items} />
      </main>
    </>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/market && bun test app/store/__tests__/page.test.tsx`
Expected: all tests PASS.

- [ ] **Step 7: Redirect `app/page.tsx` to `/store` and delete its old test**

Replace `apps/market/app/page.tsx` entirely:

```tsx
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/store')
}
```

Delete `apps/market/app/__tests__/page.test.tsx` (it tests the old Supabase-backed homepage, which no longer exists):

```bash
rm apps/market/app/__tests__/page.test.tsx
```

- [ ] **Step 8: Run the full suite + type-check**

Run: `cd apps/market && bun test && bun run type-check`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add apps/market/components/ItemGrid.tsx apps/market/app/store/page.tsx apps/market/app/page.tsx \
  apps/market/app/layout.tsx apps/market/app/store/__tests__/page.test.tsx
git rm apps/market/app/__tests__/page.test.tsx
git commit -m "feat(market): assemble redesigned store page with mock data, retire old homepage"
```

---

### Task 12: Item detail drawer + intercepting route

**Files:**
- Create: `apps/market/components/DetailDrawer.tsx`
- Create: `apps/market/app/@drawer/(.)store/[category]/[slug]/page.tsx`
- Create: `apps/market/app/@drawer/default.tsx`
- Modify: `apps/market/app/layout.tsx`
- Modify: `apps/market/app/store/[category]/[slug]/page.tsx`
- Test: `apps/market/components/__tests__/DetailDrawer.test.tsx`

**Interfaces:**
- Consumes: `Item` from `@aas/types`, `getItemBySlug` from `lib/mock/items.ts`, `@radix-ui/react-dialog`.
- Produces: `DetailDrawer({ item: Item, open: boolean, onOpenChange: (open: boolean) => void })`. Root layout gains a `@drawer` parallel route slot rendered alongside `children`.

- [ ] **Step 1: Write the failing test for `DetailDrawer`**

Create `apps/market/components/__tests__/DetailDrawer.test.tsx`:

```tsx
import { test, expect, afterEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Item } from '@aas/types'

afterEach(() => { cleanup() })

const item: Item = {
  id: 'item-1', slug: 'openai-provider', name: 'OpenAI Provider',
  description: 'GPT-4o provider', readmeUrl: '', icon: '', category: 'provider',
  version: '1.0.0',
  publisher: { id: 'p', slug: 'openai', name: 'OpenAI', avatarUrl: '', tier: 'official' },
  compatibleWith: ['claude'], tags: ['ai'], downloads: 100, rating: 4.5,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  configSchema: {}, supportedModels: ['gpt-4o'],
}

const { DetailDrawer } = await import('../DetailDrawer')

test('renders item name and description when open', () => {
  render(<DetailDrawer item={item} open onOpenChange={() => {}} />)
  expect(screen.getByText('OpenAI Provider')).toBeInTheDocument()
  expect(screen.getByText('GPT-4o provider')).toBeInTheDocument()
})

test('renders supported models for a provider item', () => {
  render(<DetailDrawer item={item} open onOpenChange={() => {}} />)
  expect(screen.getByText('gpt-4o')).toBeInTheDocument()
})

test('calls onOpenChange(false) when the close button is clicked', () => {
  const onOpenChange = mock(() => {})
  render(<DetailDrawer item={item} open onOpenChange={onOpenChange} />)
  fireEvent.click(screen.getByLabelText('关闭'))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/market && bun test components/__tests__/DetailDrawer.test.tsx`
Expected: FAIL — `Cannot find module '../DetailDrawer'`

- [ ] **Step 3: Implement `DetailDrawer.tsx`**

```tsx
'use client'

import type { Item } from '@aas/types'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Badge } from './Badge'

interface DetailDrawerProps {
  item: Item
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DetailDrawer({ item, open, onOpenChange }: DetailDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-store-border bg-store-content p-6">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold text-store-text">{item.name}</Dialog.Title>
              <div className="mt-1 flex gap-1">
                <Badge variant={item.publisher.tier}>{item.publisher.tier}</Badge>
                <Badge variant={item.category}>{item.category}</Badge>
              </div>
            </div>
            <Dialog.Close aria-label="关闭" className="text-store-text-2 hover:text-store-text">
              <X size={18} />
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-sm text-store-text-2">
            {item.description}
          </Dialog.Description>

          <div className="flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <span key={tag} className="rounded-md border border-store-border px-2 py-0.5 text-xs text-store-text-3">
                {tag}
              </span>
            ))}
          </div>

          {item.category === 'provider' && (
            <div className="text-sm">
              <p className="mb-1 font-medium text-store-text">支持的模型</p>
              <p className="text-store-text-2">{item.supportedModels.join(' · ')}</p>
            </div>
          )}

          {item.category === 'mcp' && (
            <div className="text-sm">
              <p className="mb-1 font-medium text-store-text">传输方式</p>
              <p className="text-store-text-2">
                {item.transport}
                {item.transport === 'stdio' ? ` · ${item.serverCommand}` : ` · ${item.url}`}
              </p>
            </div>
          )}

          <code className="mt-auto block rounded-lg border border-store-border bg-store-panel px-3 py-2 font-mono text-xs text-store-text">
            aas install {item.slug}
          </code>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/market && bun test components/__tests__/DetailDrawer.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Add the `@drawer` parallel slot to the root layout**

Edit `apps/market/app/layout.tsx` — add a `drawer` prop and render it after `children`:

```tsx
export default async function RootLayout({
  children,
  drawer,
}: {
  children: React.ReactNode
  drawer: React.ReactNode
}) {
```

And in the JSX, render `{drawer}` as a sibling of the main content div, inside `ClientStateProvider`:

```tsx
          <ClientStateProvider>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              {children}
            </div>
            {drawer}
          </ClientStateProvider>
```

- [ ] **Step 6: Add the default slot fallback**

Create `apps/market/app/@drawer/default.tsx`:

```tsx
export default function DefaultDrawerSlot() {
  return null
}
```

- [ ] **Step 7: Create the intercepting route**

Create `apps/market/app/@drawer/(.)store/[category]/[slug]/page.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { getItemBySlug } from '@/lib/mock/items'
import { DetailDrawer } from '@/components/DetailDrawer'

interface InterceptedDetailProps {
  params: { category: string; slug: string }
}

export default function InterceptedDetailDrawer({ params }: InterceptedDetailProps) {
  const router = useRouter()
  const item = getItemBySlug(params.slug)

  if (!item) return null

  return (
    <DetailDrawer
      item={item}
      open
      onOpenChange={(open) => {
        if (!open) router.back()
      }}
    />
  )
}
```

- [ ] **Step 8: Update the full-page fallback to use mock data**

Replace `apps/market/app/store/[category]/[slug]/page.tsx` entirely:

```tsx
import { notFound } from 'next/navigation'
import { getItemBySlug } from '@/lib/mock/items'
import { Badge } from '@/components/Badge'
import { Header } from '@/components/Header'

interface ItemDetailPageProps {
  params: { category: string; slug: string }
}

export default function ItemDetailPage({ params }: ItemDetailPageProps) {
  const item = getItemBySlug(params.slug)

  if (!item || item.category !== params.category) notFound()

  return (
    <>
      <Header />
      <main className="py-8">
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-store-border bg-store-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.icon} alt={item.name} className="h-12 w-12 object-contain" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-store-text">{item.name}</h1>
              <span className="text-store-text-3">v{item.version}</span>
              <Badge variant={item.publisher.tier}>{item.publisher.tier}</Badge>
            </div>
            <p className="mt-1 text-store-text-2">{item.description}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <span key={tag} className="rounded-md border border-store-border bg-store-panel px-2 py-0.5 text-xs text-store-text-3">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-store-border bg-store-panel p-4">
          <p className="mb-2 text-sm font-medium text-store-text">Install</p>
          <code className="block rounded-lg border border-store-border bg-store-content px-3 py-2 font-mono text-xs text-store-text">
            aas install {item.slug}
          </code>
        </div>
      </main>
    </>
  )
}
```

(This drops the Markdown `Readme` render and Supabase query — mock items don't have real README content this pass; `readmeUrl` stays on the type for later reconnection but isn't fetched here.)

- [ ] **Step 9: Run the full suite + type-check**

Run: `cd apps/market && bun test && bun run type-check`
Expected: all pass. If any existing test targets the deleted `Readme`-rendering behavior of the old detail page, delete that test file (the component/behavior no longer exists in this page).

- [ ] **Step 10: Commit**

```bash
git add apps/market/components/DetailDrawer.tsx apps/market/components/__tests__/DetailDrawer.test.tsx \
  apps/market/app/@drawer apps/market/app/layout.tsx apps/market/app/store/\[category\]/\[slug\]/page.tsx
git commit -m "feat(market): add item detail drawer via intercepting route, mock-backed fallback page"
```

---

### Task 13: Publisher drawer + intercepting route

**Files:**
- Create: `apps/market/components/PublisherDrawer.tsx`
- Create: `apps/market/app/@drawer/(.)publisher/[name]/page.tsx`
- Modify: `apps/market/app/publisher/[name]/page.tsx`
- Test: `apps/market/components/__tests__/PublisherDrawer.test.tsx`

**Interfaces:**
- Consumes: `Publisher`, `Item[]` from `@aas/types`; `getPublisherBySlug`, `getPublisherItems` from `lib/mock/items.ts` / `lib/mock/publishers.ts`.
- Produces: `PublisherDrawer({ publisher: Publisher, items: Item[], open: boolean, onOpenChange: (open: boolean) => void })`.

- [ ] **Step 1: Write the failing test**

Create `apps/market/components/__tests__/PublisherDrawer.test.tsx`:

```tsx
import { test, expect, afterEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Publisher, Item } from '@aas/types'

afterEach(() => { cleanup() })

mock.module('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

const publisher: Publisher = {
  id: 'p1', slug: 'openai', name: 'OpenAI', avatarUrl: '', tier: 'official', bio: 'Official provider',
}

const items: Item[] = [{
  id: 'item-1', slug: 'openai-provider', name: 'OpenAI Provider', description: 'desc',
  readmeUrl: '', icon: '', category: 'provider', version: '1.0.0', publisher,
  compatibleWith: ['claude'], tags: [], downloads: 10, rating: 4,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  configSchema: {}, supportedModels: [],
}]

const { PublisherDrawer } = await import('../PublisherDrawer')

test('renders publisher name and bio', () => {
  render(<PublisherDrawer publisher={publisher} items={items} open onOpenChange={() => {}} />)
  expect(screen.getByText('OpenAI')).toBeInTheDocument()
  expect(screen.getByText('Official provider')).toBeInTheDocument()
})

test('renders the publisher item list', () => {
  render(<PublisherDrawer publisher={publisher} items={items} open onOpenChange={() => {}} />)
  expect(screen.getByText('OpenAI Provider')).toBeInTheDocument()
})

test('calls onOpenChange(false) when closed', () => {
  const onOpenChange = mock(() => {})
  render(<PublisherDrawer publisher={publisher} items={items} open onOpenChange={onOpenChange} />)
  fireEvent.click(screen.getByLabelText('关闭'))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/market && bun test components/__tests__/PublisherDrawer.test.tsx`
Expected: FAIL — `Cannot find module '../PublisherDrawer'`

- [ ] **Step 3: Implement `PublisherDrawer.tsx`**

```tsx
'use client'

import type { Publisher, Item } from '@aas/types'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import Link from 'next/link'
import { Badge } from './Badge'

interface PublisherDrawerProps {
  publisher: Publisher
  items: Item[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PublisherDrawer({ publisher, items, open, onOpenChange }: PublisherDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-45 bg-black/50" />
        <Dialog.Content className="fixed right-0 top-0 z-45 flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-store-border bg-store-content p-6">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold text-store-text">{publisher.name}</Dialog.Title>
              <Badge variant={publisher.tier}>{publisher.tier}</Badge>
            </div>
            <Dialog.Close aria-label="关闭" className="text-store-text-2 hover:text-store-text">
              <X size={18} />
            </Dialog.Close>
          </div>

          {publisher.bio && (
            <Dialog.Description className="text-sm text-store-text-2">{publisher.bio}</Dialog.Description>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-store-text">{items.length} 个已发布资源</p>
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/store/${item.category}/${item.slug}`}
                className="rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text hover:border-store-border-strong"
              >
                {item.name}
              </Link>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/market && bun test components/__tests__/PublisherDrawer.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Create the intercepting route**

Create `apps/market/app/@drawer/(.)publisher/[name]/page.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { getPublisherBySlug, getPublisherItems } from '@/lib/mock/items'
import { PublisherDrawer } from '@/components/PublisherDrawer'

interface InterceptedPublisherProps {
  params: { name: string }
}

export default function InterceptedPublisherDrawer({ params }: InterceptedPublisherProps) {
  const router = useRouter()
  const publisher = getPublisherBySlug(params.name)

  if (!publisher) return null

  return (
    <PublisherDrawer
      publisher={publisher}
      items={getPublisherItems(params.name)}
      open
      onOpenChange={(open) => {
        if (!open) router.back()
      }}
    />
  )
}
```

- [ ] **Step 6: Update the full-page fallback to use mock data**

Replace `apps/market/app/publisher/[name]/page.tsx` entirely:

```tsx
import { notFound } from 'next/navigation'
import { getPublisherBySlug, getPublisherItems } from '@/lib/mock/items'
import { ItemCard } from '@/components/ItemCard'
import { Badge } from '@/components/Badge'
import { Header } from '@/components/Header'

interface PublisherPageProps {
  params: { name: string }
}

export default function PublisherPage({ params }: PublisherPageProps) {
  const publisher = getPublisherBySlug(params.name)
  if (!publisher) notFound()

  const items = getPublisherItems(params.name)

  return (
    <>
      <Header />
      <main className="py-8">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-store-border bg-store-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publisher.avatarUrl} alt={publisher.name} className="h-12 w-12 rounded-full object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-store-text">{publisher.name}</h1>
              <Badge variant={publisher.tier}>{publisher.tier}</Badge>
            </div>
            {publisher.bio && <p className="mt-1 text-sm text-store-text-2">{publisher.bio}</p>}
          </div>
        </div>

        <h2 className="mb-4 text-lg font-medium text-store-text">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </h2>

        {items.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-xl border border-store-border bg-store-panel">
            <p className="text-store-text-3">No published items yet.</p>
          </div>
        )}
      </main>
    </>
  )
}
```

- [ ] **Step 7: Run full suite + type-check**

Run: `cd apps/market && bun test && bun run type-check`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/market/components/PublisherDrawer.tsx apps/market/components/__tests__/PublisherDrawer.test.tsx \
  apps/market/app/@drawer/\(.\)publisher apps/market/app/publisher
git commit -m "feat(market): add publisher drawer via intercepting route, mock-backed fallback page"
```

---

### Task 14: Publish modal with dynamic field schema

**Files:**
- Create: `apps/market/lib/publish-field-schemas.ts`
- Create: `apps/market/components/PublishModal.tsx`
- Create: `apps/market/app/@drawer/publish-modal.tsx` — not needed; publish modal renders from `app/store/page.tsx` reading its own `?publish=1` search param (simpler than a parallel route, since it's centered/global rather than tied to a specific item).
- Modify: `apps/market/app/store/page.tsx`
- Delete: `apps/market/app/submit/page.tsx`
- Modify: `apps/market/middleware.ts`
- Test: `apps/market/lib/__tests__/publish-field-schemas.test.ts`
- Test: `apps/market/components/__tests__/PublishModal.test.tsx`

**Interfaces:**
- Produces:
  - `FIELD_SCHEMAS: Record<'provider' | 'skill' | 'mcp', FieldSchema[]>` where
    ```ts
    interface FieldSchema {
      key: string
      label: string
      type: 'text' | 'url' | 'select'
      options?: string[]
      when?: (vals: Record<string, string>) => boolean
    }
    ```
  - `PublishModal({ open: boolean, onOpenChange: (open: boolean) => void })` — on submit, builds an `Item` and calls `addUserItem` from `useClientState()`.

- [ ] **Step 1: Write the failing test for field schemas**

Create `apps/market/lib/__tests__/publish-field-schemas.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { FIELD_SCHEMAS } from '../publish-field-schemas'

test('provider schema has no conditional fields', () => {
  const fields = FIELD_SCHEMAS.provider
  expect(fields.map((f) => f.key)).toEqual(['name', 'homepage', 'baseUrl', 'supportedModels'])
})

test('mcp schema shows command field only when transport is stdio', () => {
  const commandField = FIELD_SCHEMAS.mcp.find((f) => f.key === 'command')!
  expect(commandField.when!({ transport: 'stdio' })).toBe(true)
  expect(commandField.when!({ transport: 'http' })).toBe(false)
})

test('mcp schema shows url field only when transport is sse or http', () => {
  const urlField = FIELD_SCHEMAS.mcp.find((f) => f.key === 'url')!
  expect(urlField.when!({ transport: 'sse' })).toBe(true)
  expect(urlField.when!({ transport: 'stdio' })).toBe(false)
})

test('skill schema shows installScript only when installMethod is script', () => {
  const scriptField = FIELD_SCHEMAS.skill.find((f) => f.key === 'installScript')!
  expect(scriptField.when!({ installMethod: 'script' })).toBe(true)
  expect(scriptField.when!({ installMethod: 'zip' })).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/market && bun test lib/__tests__/publish-field-schemas.test.ts`
Expected: FAIL — `Cannot find module '../publish-field-schemas'`

- [ ] **Step 3: Implement `lib/publish-field-schemas.ts`**

```ts
export interface FieldSchema {
  key: string
  label: string
  type: 'text' | 'url' | 'select'
  options?: string[]
  when?: (vals: Record<string, string>) => boolean
}

export type PublishType = 'provider' | 'skill' | 'mcp'

export const FIELD_SCHEMAS: Record<PublishType, FieldSchema[]> = {
  provider: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'homepage', label: '主页', type: 'url' },
    { key: 'baseUrl', label: 'Base URL', type: 'url' },
    { key: 'supportedModels', label: '支持的模型（逗号分隔）', type: 'text' },
  ],
  skill: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'repo', label: '仓库地址', type: 'url' },
    { key: 'category', label: '分类', type: 'select', options: ['workflow', 'design', 'documents', 'other'] },
    { key: 'installMethod', label: '安装方式', type: 'select', options: ['zip', 'script'] },
    {
      key: 'installScript',
      label: '安装脚本',
      type: 'text',
      when: (vals) => vals.installMethod === 'script',
    },
  ],
  mcp: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'homepage', label: '主页', type: 'url' },
    { key: 'transport', label: '传输方式', type: 'select', options: ['stdio', 'sse', 'http'] },
    {
      key: 'command',
      label: '启动命令',
      type: 'text',
      when: (vals) => vals.transport === 'stdio',
    },
    {
      key: 'url',
      label: '远程地址',
      type: 'url',
      when: (vals) => vals.transport === 'sse' || vals.transport === 'http',
    },
    {
      key: 'headers',
      label: 'Headers（JSON）',
      type: 'text',
      when: (vals) => vals.transport === 'sse' || vals.transport === 'http',
    },
    {
      key: 'env',
      label: '环境变量（JSON）',
      type: 'text',
      when: (vals) => vals.transport === 'stdio',
    },
  ],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/market && bun test lib/__tests__/publish-field-schemas.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Write the failing test for `PublishModal`**

Create `apps/market/components/__tests__/PublishModal.test.tsx` (uses Bun's real `mock()`, matching the pattern already used in `LangSwitcher.test.tsx` (Task 6) and `DetailDrawer.test.tsx` (Task 12)):

```tsx
import { test, expect, afterEach, beforeEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

const { PublishModal } = await import('../PublishModal')
const { ClientStateProvider } = await import('../ClientStateProvider')

function renderModal(onOpenChange: (open: boolean) => void = () => {}) {
  return render(
    <ClientStateProvider>
      <PublishModal open onOpenChange={onOpenChange} />
    </ClientStateProvider>
  )
}

test('defaults to provider fields', () => {
  renderModal()
  expect(screen.getByLabelText('Base URL')).toBeInTheDocument()
})

test('switching type to mcp swaps the visible fields', () => {
  renderModal()
  fireEvent.click(screen.getByText('MCP'))
  expect(screen.queryByLabelText('Base URL')).not.toBeInTheDocument()
  expect(screen.getByLabelText('传输方式')).toBeInTheDocument()
})

test('mcp transport=stdio shows command field, hides url field', () => {
  renderModal()
  fireEvent.click(screen.getByText('MCP'))
  fireEvent.change(screen.getByLabelText('传输方式'), { target: { value: 'stdio' } })
  expect(screen.getByLabelText('启动命令')).toBeInTheDocument()
  expect(screen.queryByLabelText('远程地址')).not.toBeInTheDocument()
})

test('submitting closes the modal', () => {
  const onOpenChange = mock(() => {})
  renderModal(onOpenChange)
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Provider' } })
  fireEvent.click(screen.getByText('发布'))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/market && bun test components/__tests__/PublishModal.test.tsx`
Expected: FAIL — `Cannot find module '../PublishModal'`

- [ ] **Step 7: Implement `PublishModal.tsx`**

```tsx
'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import type { Item } from '@aas/types'
import { X } from 'lucide-react'
import { FIELD_SCHEMAS, type PublishType } from '@/lib/publish-field-schemas'
import { useClientState } from './ClientStateProvider'

interface PublishModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TYPE_LABELS: Record<PublishType, string> = { provider: '供应商', skill: '技能', mcp: 'MCP' }

function buildItem(type: PublishType, vals: Record<string, string>): Item {
  const base = {
    id: `user-${Date.now()}`,
    slug: (vals.name ?? 'untitled').toLowerCase().replace(/\s+/g, '-'),
    name: vals.name ?? 'Untitled',
    description: vals.homepage ?? vals.repo ?? '',
    readmeUrl: '',
    icon: '',
    version: '0.1.0',
    publisher: { id: 'me', slug: 'me', name: '我', avatarUrl: '', tier: 'community' as const },
    compatibleWith: ['claude', 'codex'] as ('claude' | 'codex')[],
    tags: [],
    downloads: 0,
    rating: 0,
    status: 'published' as const,
    installHook: { steps: [] },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }

  if (type === 'provider') {
    return {
      ...base,
      category: 'provider',
      configSchema: {},
      supportedModels: (vals.supportedModels ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    }
  }
  if (type === 'skill') {
    return { ...base, category: 'skill', contentUrl: '' }
  }
  if (vals.transport === 'stdio') {
    return { ...base, category: 'mcp', transport: 'stdio', serverCommand: vals.command ?? '', configSchema: {} }
  }
  return {
    ...base,
    category: 'mcp',
    transport: (vals.transport as 'sse' | 'http') ?? 'http',
    url: vals.url ?? '',
    configSchema: {},
  }
}

export function PublishModal({ open, onOpenChange }: PublishModalProps) {
  const { addUserItem } = useClientState()
  const [type, setType] = useState<PublishType>('provider')
  const [vals, setVals] = useState<Record<string, string>>({})

  const fields = FIELD_SCHEMAS[type].filter((f) => !f.when || f.when(vals))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    addUserItem(buildItem(type, vals))
    setVals({})
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-store-border bg-store-content p-6">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-store-text">发布资源</Dialog.Title>
            <Dialog.Close aria-label="关闭" className="text-store-text-2 hover:text-store-text">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="mb-4 flex gap-2">
            {(Object.keys(TYPE_LABELS) as PublishType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setVals({}) }}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  type === t ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {fields.map((field) => (
              <div key={field.key}>
                <label htmlFor={`publish-${field.key}`} className="mb-1 block text-xs font-medium text-store-text-2">
                  {field.label}
                </label>
                {field.type === 'select' ? (
                  <select
                    id={`publish-${field.key}`}
                    value={vals[field.key] ?? ''}
                    onChange={(e) => setVals((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  >
                    <option value="" disabled>请选择</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`publish-${field.key}`}
                    type={field.type === 'url' ? 'url' : 'text'}
                    value={vals[field.key] ?? ''}
                    onChange={(e) => setVals((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  />
                )}
              </div>
            ))}

            <button
              type="submit"
              className="mt-2 rounded-lg bg-store-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              发布
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/market && bun test components/__tests__/PublishModal.test.tsx`
Expected: all tests PASS.

- [ ] **Step 9: Wire `PublishModal` into the store page via `?publish=1`**

Edit `apps/market/app/store/page.tsx` to render the modal client-side. Since `StorePage` is a server component, add a small client wrapper. Create `apps/market/components/PublishModalTrigger.tsx`:

```tsx
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { PublishModal } from './PublishModal'

export function PublishModalTrigger() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const open = searchParams.get('publish') === '1'

  function close() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('publish')
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return <PublishModal open={open} onOpenChange={(next) => { if (!next) close() }} />
}
```

Add it to `app/store/page.tsx`, right after `<Header />`:

```tsx
import { PublishModalTrigger } from '@/components/PublishModalTrigger'
```

```tsx
      <Header />
      <PublishModalTrigger />
      <main className="flex flex-col gap-6 py-8">
```

- [ ] **Step 10: Delete `/submit` and unprotect it in middleware**

```bash
rm apps/market/app/submit/page.tsx
rmdir apps/market/app/submit 2>/dev/null || true
```

Edit `apps/market/middleware.ts`:

```ts
const PROTECTED_PATHS = ['/dashboard']
```

(Remove `/submit` from the list — the route no longer exists.)

- [ ] **Step 11: Run the full suite + type-check**

Run: `cd apps/market && bun test && bun run type-check`
Expected: all pass. If any existing test file references `/submit` (e.g. a middleware test), update or remove the assertion for that path.

- [ ] **Step 12: Commit**

```bash
git add apps/market/lib/publish-field-schemas.ts apps/market/lib/__tests__/publish-field-schemas.test.ts \
  apps/market/components/PublishModal.tsx apps/market/components/__tests__/PublishModal.test.tsx \
  apps/market/components/PublishModalTrigger.tsx apps/market/app/store/page.tsx apps/market/middleware.ts
git rm -r apps/market/app/submit
git commit -m "feat(market): add publish modal with dynamic field schema, retire /submit route"
```

---

### Task 15: Final integration pass

**Files:** none created — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `cd apps/market && bun test`
Expected: all tests pass, zero failures.

- [ ] **Step 2: Type-check**

Run: `cd apps/market && bun run type-check`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd apps/market && bun run lint`
Expected: no errors. Fix any `no-img-element`/unused-import warnings introduced by earlier tasks before proceeding.

- [ ] **Step 4: Manual smoke test in the dev server**

Run: `cd apps/market && bun run dev` (or `pnpm --filter @aas/market dev` from repo root)
Open `http://localhost:3000/` — confirm it redirects to `/store` and shows: header, featured carousel, category tabs, sort, search, item grid with favorite/install buttons on each card. Click a card — confirm the detail drawer slides in from the right and the URL updates to `/store/<category>/<slug>`. Press browser back — confirm the drawer closes and the grid is still visible. Reload directly on a detail URL — confirm the full-page fallback renders. Click "发布" — confirm the publish modal opens centered, switching type changes the visible fields. Toggle the theme button — confirm colors flip. Switch language to English — confirm nav/category/sort labels change.

- [ ] **Step 5: Commit any final fixes**

If Steps 1–4 required fixes, commit them:

```bash
git add -A
git commit -m "fix(market): address lint/type/manual-QA findings from store redesign integration pass"
```
