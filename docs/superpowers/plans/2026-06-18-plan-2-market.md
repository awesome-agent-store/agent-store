# apps/market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `apps/market` Next.js 14 web app — the AI Agent Store marketplace with Raycast Store dark design, Supabase backend, and all core browse/detail/auth pages.

**Architecture:** Next.js 14 App Router with React Server Components; Supabase PostgreSQL for data + GitHub OAuth for auth; all shared types imported from `@aas/types`; UI built with Tailwind CSS configured with Raycast Store design tokens. API routes (`/api/*`) are thin wrappers over typed query functions in `lib/queries/`; pages are Server Components that call queries directly.

**Tech Stack:** Next.js 14.2.x · React 18.3.x · Tailwind CSS 3.4.x · Supabase JS v2 + `@supabase/ssr` · `@aas/types` workspace · bun:test + happy-dom + @testing-library/react

## Global Constraints

- TypeScript strict mode, `verbatimModuleSyntax`, ES2022, Bundler `moduleResolution` — from `tsconfig.base.json`
- Bun ≥ 1.3.12, pnpm ≥ 11.5.0
- Next.js `14.2.3`, React `^18.3.1`
- Dark mode only — no light theme. All colors from Raycast Store token set:
  - Surfaces: `#07080a` (surface-0) · `#0d0d0d` (surface-1) · `#101111` (surface-2) · `#121212` (surface-3)
  - Border: `#242728` (default) · `#35383a` (hover)
  - Text: `#ffffff` (fg) · `#8b8d97` (fg-secondary) · `#4b4f57` (fg-muted)
  - Tier colors: `#5e77fe` (official) · `#30c88b` (verified) · `#8b8d97` (community)
  - White-only CTA buttons
- Inter font with `font-feature-settings: 'ss03' on`
- Import all item/publisher types exclusively from `@aas/types` — never redefine them
- Never hardcode Supabase URL/keys — read from env vars `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `bun:test` with `environment = "happy-dom"` for all tests; use `@testing-library/react` for component tests
- All API route handlers (`app/api/*/route.ts`) call query functions from `lib/queries/`; they do no DB logic themselves
- Path alias `@/*` maps to `./` (repo root of `apps/market`)

---

### Task 1: apps/market Scaffold + Design Tokens

**Files:**
- Create: `apps/market/package.json`
- Create: `apps/market/tsconfig.json`
- Create: `apps/market/next.config.ts`
- Create: `apps/market/tailwind.config.ts`
- Create: `apps/market/postcss.config.js`
- Create: `apps/market/bunfig.toml`
- Create: `apps/market/test-setup.ts`
- Create: `apps/market/app/globals.css`
- Create: `apps/market/app/layout.tsx`
- Create: `apps/market/app/page.tsx`
- Create: `apps/market/app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `@aas/types` workspace (from Plan 1)
- Produces: working Next.js skeleton; Tailwind tokens available as `bg-ray-surface-0`, `text-ray-fg`, etc.; root layout with Inter font

- [ ] **Step 1: Create `apps/market/package.json`**

```json
{
  "name": "@aas/market",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@aas/types": "workspace:*",
    "@supabase/supabase-js": "^2.39.3",
    "@supabase/ssr": "^0.1.0",
    "next": "14.2.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.1",
    "remark-gfm": "^4.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.6",
    "@types/bun": "latest",
    "@types/node": "^20.14.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 2: Run pnpm install from repo root**

```bash
cd /path/to/repo && pnpm install
```

Expected: `@aas/types` symlinked in `apps/market/node_modules/@aas/types`; all deps installed.

- [ ] **Step 3: Create `apps/market/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "jsx": "preserve",
    "incremental": true,
    "paths": {
      "@/*": ["./*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `apps/market/next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.in',
      },
    ],
  },
}

export default nextConfig
```

- [ ] **Step 5: Create `apps/market/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ray: {
          'surface-0': '#07080a',
          'surface-1': '#0d0d0d',
          'surface-2': '#101111',
          'surface-3': '#121212',
          'border': '#242728',
          'border-hover': '#35383a',
          'fg': '#ffffff',
          'fg-secondary': '#8b8d97',
          'fg-muted': '#4b4f57',
          'accent': '#ffffff',
          'official': '#5e77fe',
          'verified': '#30c88b',
          'community': '#8b8d97',
          'danger': '#ff5f57',
          'warning': '#febc2e',
          'success': '#28c840',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 6: Create `apps/market/postcss.config.js`**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 7: Create `apps/market/bunfig.toml`**

```toml
[test]
environment = "happy-dom"
preload = ["./test-setup.ts"]
```

- [ ] **Step 8: Create `apps/market/test-setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 9: Create `apps/market/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-feature-settings: 'ss03' on;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    @apply bg-ray-surface-0 text-ray-fg;
  }
}

@layer utilities {
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: #242728 transparent;
  }

  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
```

- [ ] **Step 10: Create `apps/market/app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-ray-surface-0 text-ray-fg antialiased">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </body>
    </html>
  )
}
```

- [ ] **Step 11: Create `apps/market/app/page.tsx` (placeholder)**

```typescript
export default function HomePage() {
  return (
    <main className="py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ray-fg">
        AI Agent Store
      </h1>
      <p className="mt-3 text-ray-fg-secondary">
        Discover and install AI providers, skills, and MCP servers.
      </p>
    </main>
  )
}
```

- [ ] **Step 12: Write the test for the placeholder page**

```typescript
// apps/market/app/__tests__/page.test.tsx
import { test, expect } from 'bun:test'
import { render, screen } from '@testing-library/react'

function PlaceholderPage() {
  return (
    <main className="py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ray-fg">
        AI Agent Store
      </h1>
      <p className="mt-3 text-ray-fg-secondary">
        Discover and install AI providers, skills, and MCP servers.
      </p>
    </main>
  )
}

test('placeholder page renders heading', () => {
  render(<PlaceholderPage />)
  expect(screen.getByRole('heading', { name: 'AI Agent Store' })).toBeInTheDocument()
})

test('placeholder page renders tagline', () => {
  render(<PlaceholderPage />)
  expect(
    screen.getByText('Discover and install AI providers, skills, and MCP servers.')
  ).toBeInTheDocument()
})
```

- [ ] **Step 13: Run tests to verify 2 pass**

```bash
cd apps/market && bun test
```

Expected output:
```
 2 pass
 0 fail
```

- [ ] **Step 14: Run type-check**

```bash
cd apps/market && bun run type-check
```

Expected: No TypeScript errors

- [ ] **Step 15: Commit**

```bash
cd /path/to/repo && git add apps/market/
git commit -m "feat(market): scaffold Next.js 14 app with Raycast Store design tokens"
```

---

### Task 2: Supabase Schema + Client Setup + DB Type Mapping

**Files:**
- Create: `apps/market/supabase/migrations/001_initial.sql`
- Create: `apps/market/.env.local.example`
- Create: `apps/market/lib/supabase/client.ts`
- Create: `apps/market/lib/supabase/server.ts`
- Create: `apps/market/lib/db-types.ts`
- Create: `apps/market/lib/__tests__/db-types.test.ts`

**Interfaces:**
- Consumes: `@aas/types` — `Publisher`, `Item`, `ProviderItem`, `SkillItem`, `MCPItem`, `InstallHook`
- Produces:
  - `DBPublisher`, `DBItem` — raw Supabase row types
  - `mapPublisher(row: DBPublisher): Publisher`
  - `mapItem(row: DBItem & { publishers: DBPublisher }): Item`
  - `createClient()` — browser Supabase client (from `lib/supabase/client.ts`)
  - `createClient()` — server Supabase client (from `lib/supabase/server.ts`)

- [ ] **Step 1: Create `apps/market/supabase/migrations/001_initial.sql`**

```sql
-- Publishers table
CREATE TABLE publishers (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text    UNIQUE NOT NULL,
  name        text    NOT NULL,
  avatar_url  text    NOT NULL,
  tier        text    NOT NULL CHECK (tier IN ('official', 'verified', 'community')),
  bio         text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Items table
-- metadata JSONB holds category-specific fields:
--   provider: { configSchema, supportedModels }
--   skill:    { contentUrl }
--   mcp:      { transport, serverCommand, configSchema }
CREATE TABLE items (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text    UNIQUE NOT NULL,
  name            text    NOT NULL,
  description     text    NOT NULL,
  readme_url      text    NOT NULL,
  icon            text    NOT NULL,
  category        text    NOT NULL CHECK (category IN ('provider', 'skill', 'mcp')),
  version         text    NOT NULL,
  publisher_id    uuid    NOT NULL REFERENCES publishers(id) ON DELETE RESTRICT,
  compatible_with text[]  NOT NULL DEFAULT '{}',
  tags            text[]  NOT NULL DEFAULT '{}',
  downloads       integer NOT NULL DEFAULT 0,
  rating          numeric(3,2) NOT NULL DEFAULT 0,
  status          text    NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('published', 'pending', 'rejected')),
  install_hook    jsonb   NOT NULL DEFAULT '{"steps": []}',
  metadata        jsonb   NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes for common query patterns
CREATE INDEX items_category_status_idx ON items(category, status);
CREATE INDEX items_publisher_idx       ON items(publisher_id);
CREATE INDEX items_downloads_idx       ON items(downloads DESC) WHERE status = 'published';
CREATE INDEX items_created_idx         ON items(created_at DESC) WHERE status = 'published';

-- Row Level Security
ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE items      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published items are readable by all"
  ON items FOR SELECT USING (status = 'published');

CREATE POLICY "Publishers are readable by all"
  ON publishers FOR SELECT USING (true);
```

- [ ] **Step 2: Create `apps/market/.env.local.example`**

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- [ ] **Step 3: Create `apps/market/lib/supabase/client.ts`** (browser client)

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 4: Create `apps/market/lib/supabase/server.ts`** (server component client)

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Server Components cannot set cookies; ignore
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Server Components cannot remove cookies; ignore
          }
        },
      },
    }
  )
}
```

- [ ] **Step 5: Create `apps/market/lib/db-types.ts`**

```typescript
import type {
  Publisher,
  Item,
  ProviderItem,
  SkillItem,
  MCPItem,
  InstallHook,
} from '@aas/types'

// ── Raw DB row shapes (snake_case from Supabase) ──────────────────────────────

export interface DBPublisher {
  id: string
  slug: string
  name: string
  avatar_url: string
  tier: 'official' | 'verified' | 'community'
  bio: string | null
  created_at: string
}

export interface DBItem {
  id: string
  slug: string
  name: string
  description: string
  readme_url: string
  icon: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  publisher_id: string
  compatible_with: string[]
  tags: string[]
  downloads: number
  rating: number
  status: 'published' | 'pending' | 'rejected'
  install_hook: { steps: unknown[] }
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // Populated by Supabase join: .select('*, publishers(*)')
  publishers?: DBPublisher
}

// ── Mapping functions ─────────────────────────────────────────────────────────

export function mapPublisher(row: DBPublisher): Publisher {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    avatarUrl: row.avatar_url,
    tier: row.tier,
    ...(row.bio !== null ? { bio: row.bio } : {}),
  }
}

export function mapItem(row: DBItem & { publishers: DBPublisher }): Item {
  const publisher = mapPublisher(row.publishers)
  const base = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    readmeUrl: row.readme_url,
    icon: row.icon,
    version: row.version,
    publisher,
    compatibleWith: row.compatible_with as ('claude' | 'codex')[],
    tags: row.tags,
    downloads: row.downloads,
    rating: row.rating,
    status: row.status,
    installHook: row.install_hook as InstallHook,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  if (row.category === 'provider') {
    return {
      ...base,
      category: 'provider',
      configSchema: (row.metadata['configSchema'] ?? {}) as Record<string, unknown>,
      supportedModels: (row.metadata['supportedModels'] ?? []) as string[],
    } satisfies ProviderItem
  }

  if (row.category === 'skill') {
    return {
      ...base,
      category: 'skill',
      contentUrl: (row.metadata['contentUrl'] ?? '') as string,
    } satisfies SkillItem
  }

  // mcp
  return {
    ...base,
    category: 'mcp',
    transport: (row.metadata['transport'] ?? 'stdio') as 'stdio' | 'sse' | 'http',
    serverCommand: (row.metadata['serverCommand'] ?? '') as string,
    configSchema: (row.metadata['configSchema'] ?? {}) as Record<string, unknown>,
  } satisfies MCPItem
}
```

- [ ] **Step 6: Write the failing tests**

```typescript
// apps/market/lib/__tests__/db-types.test.ts
import { test, expect } from 'bun:test'
import { mapPublisher, mapItem } from '../db-types'
import type { DBPublisher, DBItem } from '../db-types'

const basePublisher: DBPublisher = {
  id: 'pub-1',
  slug: 'openai',
  name: 'OpenAI',
  avatar_url: 'https://example.com/openai.png',
  tier: 'official',
  bio: null,
  created_at: '2026-06-18T00:00:00Z',
}

test('mapPublisher converts snake_case to camelCase', () => {
  const result = mapPublisher(basePublisher)
  expect(result.avatarUrl).toBe('https://example.com/openai.png')
  expect(result.tier).toBe('official')
  expect(result.id).toBe('pub-1')
})

test('mapPublisher omits bio when null', () => {
  const result = mapPublisher(basePublisher)
  expect(result.bio).toBeUndefined()
})

test('mapPublisher includes bio when present', () => {
  const result = mapPublisher({ ...basePublisher, bio: 'AI company' })
  expect(result.bio).toBe('AI company')
})

const baseDBItem: DBItem & { publishers: DBPublisher } = {
  id: 'item-1',
  slug: 'openai-provider',
  name: 'OpenAI Provider',
  description: 'OpenAI API provider',
  readme_url: 'https://example.com/readme',
  icon: 'https://example.com/icon.png',
  category: 'provider',
  version: '1.0.0',
  publisher_id: 'pub-1',
  compatible_with: ['claude', 'codex'],
  tags: ['ai', 'openai'],
  downloads: 1000,
  rating: 4.5,
  status: 'published',
  install_hook: { steps: [] },
  metadata: {
    configSchema: { type: 'object' },
    supportedModels: ['gpt-4o', 'o1'],
  },
  created_at: '2026-06-18T00:00:00Z',
  updated_at: '2026-06-18T00:00:00Z',
  publishers: basePublisher,
}

test('mapItem maps provider with supportedModels', () => {
  const item = mapItem(baseDBItem)
  expect(item.category).toBe('provider')
  if (item.category !== 'provider') throw new Error('type narrowing')
  expect(item.supportedModels).toEqual(['gpt-4o', 'o1'])
  expect(item.slug).toBe('openai-provider')
  expect(item.publisher.name).toBe('OpenAI')
  expect(item.compatibleWith).toEqual(['claude', 'codex'])
})

test('mapItem maps skill with contentUrl', () => {
  const item = mapItem({
    ...baseDBItem,
    slug: 'my-skill',
    category: 'skill',
    metadata: { contentUrl: 'https://example.com/skill.md' },
  })
  expect(item.category).toBe('skill')
  if (item.category !== 'skill') throw new Error('type narrowing')
  expect(item.contentUrl).toBe('https://example.com/skill.md')
})

test('mapItem maps mcp with transport and serverCommand', () => {
  const item = mapItem({
    ...baseDBItem,
    slug: 'fs-mcp',
    category: 'mcp',
    metadata: { transport: 'stdio', serverCommand: './server', configSchema: {} },
  })
  expect(item.category).toBe('mcp')
  if (item.category !== 'mcp') throw new Error('type narrowing')
  expect(item.transport).toBe('stdio')
  expect(item.serverCommand).toBe('./server')
})

test('mapItem defaults missing mcp fields gracefully', () => {
  const item = mapItem({
    ...baseDBItem,
    slug: 'bare-mcp',
    category: 'mcp',
    metadata: {},
  })
  if (item.category !== 'mcp') throw new Error('type narrowing')
  expect(item.transport).toBe('stdio')
  expect(item.serverCommand).toBe('')
})
```

- [ ] **Step 7: Run tests to verify 8 pass**

```bash
cd apps/market && bun test lib/
```

Expected: 8 pass (2 from Task 1 + 6 new — but run only `lib/` for this task)

Actually run only the new tests:
```bash
cd apps/market && bun test lib/__tests__/db-types.test.ts
```

Expected:
```
 6 pass
 0 fail
```

- [ ] **Step 8: Commit**

```bash
cd /path/to/repo && git add apps/market/
git commit -m "feat(market): Supabase schema, client setup, and DB type mapping"
```

---

### Task 3: Core UI Components — Badge, ItemCard, CategoryTabs, SearchInput

**Files:**
- Create: `apps/market/components/Badge.tsx`
- Create: `apps/market/components/ItemCard.tsx`
- Create: `apps/market/components/CategoryTabs.tsx`
- Create: `apps/market/components/SearchInput.tsx`
- Create: `apps/market/components/__tests__/Badge.test.tsx`
- Create: `apps/market/components/__tests__/ItemCard.test.tsx`

**Interfaces:**
- Consumes: `@aas/types` `Item` (for ItemCard); Tailwind design tokens from Task 1
- Produces:
  - `Badge({ variant: 'official'|'verified'|'community'|'provider'|'skill'|'mcp', children })`
  - `ItemCard({ item: Item })`
  - `CategoryTabs({ active: 'all'|'provider'|'skill'|'mcp' })`
  - `SearchInput({ placeholder?: string, defaultValue?: string })`

- [ ] **Step 1: Write failing tests for Badge**

```typescript
// apps/market/components/__tests__/Badge.test.tsx
import { test, expect } from 'bun:test'
import { render, screen } from '@testing-library/react'
import { Badge } from '../Badge'

test('Badge renders its children', () => {
  render(<Badge variant="official">official</Badge>)
  expect(screen.getByText('official')).toBeInTheDocument()
})

test('Badge applies official color class', () => {
  render(<Badge variant="official">official</Badge>)
  expect(screen.getByText('official').className).toContain('text-ray-official')
})

test('Badge applies verified color class', () => {
  render(<Badge variant="verified">verified</Badge>)
  expect(screen.getByText('verified').className).toContain('text-ray-verified')
})

test('Badge applies secondary color for community', () => {
  render(<Badge variant="community">community</Badge>)
  expect(screen.getByText('community').className).toContain('text-ray-fg-secondary')
})

test('Badge applies muted style for category variants', () => {
  render(<Badge variant="provider">provider</Badge>)
  expect(screen.getByText('provider').className).toContain('text-ray-fg-secondary')
})
```

- [ ] **Step 2: Run to confirm RED**

```bash
cd apps/market && bun test components/__tests__/Badge.test.tsx
```

Expected: fails with "Cannot find module '../Badge'"

- [ ] **Step 3: Create `apps/market/components/Badge.tsx`**

```typescript
import type { Publisher } from '@aas/types'

type TierVariant = Publisher['tier']
type CategoryVariant = 'provider' | 'skill' | 'mcp'
export type BadgeVariant = TierVariant | CategoryVariant

interface BadgeProps {
  variant: BadgeVariant
  children: React.ReactNode
}

const variantClasses: Record<BadgeVariant, string> = {
  official:  'bg-ray-official/10 text-ray-official   border-ray-official/20',
  verified:  'bg-ray-verified/10 text-ray-verified   border-ray-verified/20',
  community: 'bg-ray-fg-muted/10 text-ray-fg-secondary border-ray-fg-muted/20',
  provider:  'bg-ray-surface-3  text-ray-fg-secondary border-ray-border',
  skill:     'bg-ray-surface-3  text-ray-fg-secondary border-ray-border',
  mcp:       'bg-ray-surface-3  text-ray-fg-secondary border-ray-border',
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

- [ ] **Step 4: Run to confirm GREEN**

```bash
cd apps/market && bun test components/__tests__/Badge.test.tsx
```

Expected: 5 pass, 0 fail

- [ ] **Step 5: Write failing tests for ItemCard**

```typescript
// apps/market/components/__tests__/ItemCard.test.tsx
import { test, expect, mock } from 'bun:test'
import { render, screen } from '@testing-library/react'
import type { Item } from '@aas/types'

// Mock next/link — it uses Node internals unavailable in happy-dom
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

import { ItemCard } from '../ItemCard'

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
  rating: 0,
  status: 'published',
  installHook: { steps: [] },
  createdAt: '2026-06-18T00:00:00Z',
  updatedAt: '2026-06-18T00:00:00Z',
  configSchema: {},
  supportedModels: ['gpt-4o'],
}

test('ItemCard renders item name', () => {
  render(<ItemCard item={mockItem} />)
  expect(screen.getByText('OpenAI Provider')).toBeInTheDocument()
})

test('ItemCard renders description', () => {
  render(<ItemCard item={mockItem} />)
  expect(screen.getByText('OpenAI API provider with GPT-4o support')).toBeInTheDocument()
})

test('ItemCard renders formatted downloads: 1.2M', () => {
  render(<ItemCard item={mockItem} />)
  expect(screen.getByText('1.2M installs')).toBeInTheDocument()
})

test('ItemCard renders 999 downloads without abbreviation', () => {
  render(<ItemCard item={{ ...mockItem, downloads: 999 }} />)
  expect(screen.getByText('999 installs')).toBeInTheDocument()
})

test('ItemCard renders 1500 downloads as 1.5K', () => {
  render(<ItemCard item={{ ...mockItem, downloads: 1500 }} />)
  expect(screen.getByText('1.5K installs')).toBeInTheDocument()
})

test('ItemCard links to correct detail page', () => {
  render(<ItemCard item={mockItem} />)
  const link = screen.getByRole('link')
  expect(link.getAttribute('href')).toBe('/store/provider/openai-provider')
})

test('ItemCard renders compat tools', () => {
  render(<ItemCard item={mockItem} />)
  expect(screen.getByText('claude · codex')).toBeInTheDocument()
})
```

- [ ] **Step 6: Run to confirm RED**

```bash
cd apps/market && bun test components/__tests__/ItemCard.test.tsx
```

Expected: fails with "Cannot find module '../ItemCard'"

- [ ] **Step 7: Create `apps/market/components/ItemCard.tsx`**

```typescript
import type { Item } from '@aas/types'
import Link from 'next/link'
import { Badge } from './Badge'

interface ItemCardProps {
  item: Item
}

export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function ItemCard({ item }: ItemCardProps) {
  return (
    <Link
      href={`/store/${item.category}/${item.slug}`}
      className="group flex flex-col gap-3 rounded-xl border border-ray-border bg-ray-surface-2 p-4 transition-colors hover:border-ray-border-hover hover:bg-ray-surface-3"
    >
      {/* Header: icon + name + badges */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ray-border bg-ray-surface-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.icon}
            alt={item.name}
            className="h-8 w-8 object-contain"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-ray-fg">
            {item.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge variant={item.publisher.tier}>{item.publisher.tier}</Badge>
            <Badge variant={item.category}>{item.category}</Badge>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="line-clamp-2 text-xs text-ray-fg-secondary">
        {item.description}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-ray-fg-muted">
        <span>{item.compatibleWith.join(' · ')}</span>
        <span>{formatDownloads(item.downloads)} installs</span>
      </div>
    </Link>
  )
}
```

- [ ] **Step 8: Run to confirm GREEN**

```bash
cd apps/market && bun test components/__tests__/ItemCard.test.tsx
```

Expected: 7 pass, 0 fail

- [ ] **Step 9: Create `apps/market/components/CategoryTabs.tsx`** (client component)

```typescript
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

type Category = 'all' | 'provider' | 'skill' | 'mcp'

interface CategoryTabsProps {
  active: Category
}

const TABS: { value: Category; label: string }[] = [
  { value: 'all',      label: 'All' },
  { value: 'provider', label: 'Providers' },
  { value: 'skill',    label: 'Skills' },
  { value: 'mcp',      label: 'MCPs' },
]

export function CategoryTabs({ active }: CategoryTabsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

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
    <div
      role="tablist"
      className="flex gap-1 rounded-lg border border-ray-border bg-ray-surface-1 p-1"
    >
      {TABS.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={active === tab.value}
          onClick={() => handleSelect(tab.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            active === tab.value
              ? 'bg-ray-surface-3 text-ray-fg'
              : 'text-ray-fg-secondary hover:text-ray-fg'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 10: Create `apps/market/components/SearchInput.tsx`** (client component)

```typescript
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'

interface SearchInputProps {
  placeholder?: string
  defaultValue?: string
}

export function SearchInput({
  placeholder = 'Search providers, skills, MCPs...',
  defaultValue = '',
}: SearchInputProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

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

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <svg
          aria-hidden="true"
          className="h-4 w-4 text-ray-fg-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <input
        type="search"
        defaultValue={defaultValue}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={placeholder}
        data-pending={isPending ? '' : undefined}
        className="w-full rounded-lg border border-ray-border bg-ray-surface-1 py-2 pl-9 pr-4 text-sm text-ray-fg placeholder:text-ray-fg-muted focus:border-ray-border-hover focus:outline-none"
      />
    </div>
  )
}
```

- [ ] **Step 11: Run all component tests**

```bash
cd apps/market && bun test components/
```

Expected: 12 pass, 0 fail (5 Badge + 7 ItemCard)

- [ ] **Step 12: Run type-check**

```bash
cd apps/market && bun run type-check
```

Expected: No TypeScript errors

- [ ] **Step 13: Commit**

```bash
cd /path/to/repo && git add apps/market/components/
git commit -m "feat(market): add Badge, ItemCard, CategoryTabs, SearchInput components"
```

---

### Task 4: Query Layer + API Routes + Home + Store Browse Pages

**Files:**
- Create: `apps/market/lib/queries/items.ts`
- Create: `apps/market/lib/queries/publishers.ts`
- Create: `apps/market/lib/queries/__tests__/items.test.ts`
- Create: `apps/market/app/api/items/route.ts`
- Create: `apps/market/app/api/items/__tests__/route.test.ts`
- Modify: `apps/market/app/page.tsx` (replace placeholder with real home page)
- Create: `apps/market/app/store/page.tsx`
- Create: `apps/market/app/store/[category]/page.tsx`

**Interfaces:**
- Consumes: `lib/db-types.ts` — `mapItem`, `mapPublisher`, `DBItem`, `DBPublisher`
- Consumes: `lib/supabase/server.ts` — `createClient()`
- Produces:
  - `getItems(opts): Promise<{ data: Item[]; error: string | null }>`
  - `getItemBySlug(slug): Promise<{ data: Item | null; error: string | null }>`
  - `getFeaturedItems(): Promise<{ data: Item[]; error: string | null }>`
  - `GET /api/items` — query params: `category`, `q`, `limit`, `offset`; response: `{ items: Item[] }`

- [ ] **Step 1: Write failing test for query layer**

```typescript
// apps/market/lib/queries/__tests__/items.test.ts
import { test, expect, mock, beforeEach } from 'bun:test'
import type { DBItem, DBPublisher } from '../../db-types'

// ── Mock Supabase server client ───────────────────────────────────────────────
const mockPublisher: DBPublisher = {
  id: 'pub-1', slug: 'openai', name: 'OpenAI',
  avatar_url: 'https://example.com/logo.png', tier: 'official',
  bio: null, created_at: '2026-06-18T00:00:00Z',
}

const mockDBItem: DBItem & { publishers: DBPublisher } = {
  id: 'item-1', slug: 'openai-provider', name: 'OpenAI Provider',
  description: 'OpenAI API', readme_url: 'https://example.com/readme',
  icon: 'https://example.com/icon.png', category: 'provider', version: '1.0.0',
  publisher_id: 'pub-1', compatible_with: ['claude', 'codex'], tags: ['ai'],
  downloads: 1000, rating: 0, status: 'published',
  install_hook: { steps: [] },
  metadata: { configSchema: {}, supportedModels: ['gpt-4o'] },
  created_at: '2026-06-18T00:00:00Z', updated_at: '2026-06-18T00:00:00Z',
  publishers: mockPublisher,
}

// Supabase query builder mock — supports .select().eq().order().range().limit()
function makeQueryMock(data: unknown[], error: unknown = null) {
  const q = {
    select: () => q,
    eq: () => q,
    ilike: () => q,
    order: () => q,
    range: () => q,
    limit: () => Promise.resolve({ data, error }),
    then: (resolve: (v: { data: unknown[]; error: unknown }) => void) =>
      resolve({ data, error }),
  }
  return q
}

let mockSupabase: { from: (t: string) => ReturnType<typeof makeQueryMock> }

beforeEach(() => {
  mockSupabase = {
    from: () => makeQueryMock([mockDBItem]),
  }
})

mock.module('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase,
}))

import { getItems, getItemBySlug } from '../items'

test('getItems returns mapped Item array', async () => {
  const { data, error } = await getItems({})
  expect(error).toBeNull()
  expect(data).toHaveLength(1)
  expect(data[0].slug).toBe('openai-provider')
  expect(data[0].category).toBe('provider')
})

test('getItems returns empty array on empty DB result', async () => {
  mockSupabase = { from: () => makeQueryMock([]) }
  const { data, error } = await getItems({})
  expect(error).toBeNull()
  expect(data).toHaveLength(0)
})

test('getItemBySlug returns single mapped item', async () => {
  // Override limit to return single item
  mockSupabase = {
    from: () => {
      const q = {
        select: () => q,
        eq: () => Promise.resolve({ data: [mockDBItem], error: null }),
      } as unknown as ReturnType<typeof makeQueryMock>
      return q
    },
  }
  const { data, error } = await getItemBySlug('openai-provider')
  expect(error).toBeNull()
  expect(data?.slug).toBe('openai-provider')
})

test('getItemBySlug returns null when not found', async () => {
  mockSupabase = {
    from: () => {
      const q = {
        select: () => q,
        eq: () => Promise.resolve({ data: [], error: null }),
      } as unknown as ReturnType<typeof makeQueryMock>
      return q
    },
  }
  const { data, error } = await getItemBySlug('nonexistent')
  expect(error).toBeNull()
  expect(data).toBeNull()
})
```

- [ ] **Step 2: Run to confirm RED**

```bash
cd apps/market && bun test lib/queries/__tests__/items.test.ts
```

Expected: fails with "Cannot find module '../items'"

- [ ] **Step 3: Create `apps/market/lib/queries/items.ts`**

```typescript
import type { Item } from '@aas/types'
import { createClient } from '@/lib/supabase/server'
import { mapItem } from '@/lib/db-types'
import type { DBItem, DBPublisher } from '@/lib/db-types'

const ITEM_SELECT = '*, publishers(*)'

export interface GetItemsOptions {
  category?: 'provider' | 'skill' | 'mcp' | null
  q?: string
  limit?: number
  offset?: number
  sort?: 'downloads' | 'created'
}

export async function getItems(
  options: GetItemsOptions
): Promise<{ data: Item[]; error: string | null }> {
  const { category, q, limit = 20, offset = 0, sort = 'downloads' } = options
  const supabase = createClient()

  let query = supabase
    .from('items')
    .select(ITEM_SELECT)
    .eq('status', 'published')

  if (category) {
    query = query.eq('category', category)
  }
  if (q) {
    query = query.ilike('name', `%${q}%`)
  }

  const orderColumn = sort === 'created' ? 'created_at' : 'downloads'
  query = query.order(orderColumn, { ascending: false })

  const { data, error } = await query.range(offset, offset + limit - 1)

  if (error) return { data: [], error: (error as { message?: string }).message ?? 'Query failed' }

  const rows = (data ?? []) as Array<DBItem & { publishers: DBPublisher }>
  return { data: rows.map(mapItem), error: null }
}

export async function getItemBySlug(
  slug: string
): Promise<{ data: Item | null; error: string | null }> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('items')
    .select(ITEM_SELECT)
    .eq('slug', slug)
    .eq('status', 'published')
    .limit(1)
    .single()

  if (error) {
    // PGRST116 = row not found — treat as null, not error
    const pgError = error as { code?: string; message?: string }
    if (pgError.code === 'PGRST116') return { data: null, error: null }
    return { data: null, error: pgError.message ?? 'Query failed' }
  }

  const row = data as DBItem & { publishers: DBPublisher }
  return { data: mapItem(row), error: null }
}

export async function getFeaturedItems(): Promise<{ data: Item[]; error: string | null }> {
  // Featured = top 6 by downloads across all categories
  return getItems({ limit: 6, sort: 'downloads' })
}

export async function getNewItems(): Promise<{ data: Item[]; error: string | null }> {
  return getItems({ limit: 6, sort: 'created' })
}
```

- [ ] **Step 4: Create `apps/market/lib/queries/publishers.ts`**

```typescript
import type { Publisher } from '@aas/types'
import type { Item } from '@aas/types'
import { createClient } from '@/lib/supabase/server'
import { mapPublisher, mapItem } from '@/lib/db-types'
import type { DBPublisher, DBItem } from '@/lib/db-types'

export async function getPublisherBySlug(
  slug: string
): Promise<{ data: Publisher | null; error: string | null }> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('publishers')
    .select('*')
    .eq('slug', slug)
    .limit(1)
    .single()

  if (error) {
    const pgError = error as { code?: string; message?: string }
    if (pgError.code === 'PGRST116') return { data: null, error: null }
    return { data: null, error: pgError.message ?? 'Query failed' }
  }

  return { data: mapPublisher(data as DBPublisher), error: null }
}

export async function getPublisherItems(
  publisherSlug: string
): Promise<{ data: Item[]; error: string | null }> {
  const supabase = createClient()

  const { data: publisherData, error: pubError } = await supabase
    .from('publishers')
    .select('id')
    .eq('slug', publisherSlug)
    .limit(1)
    .single()

  if (pubError || !publisherData) return { data: [], error: null }

  const { data, error } = await supabase
    .from('items')
    .select('*, publishers(*)')
    .eq('publisher_id', (publisherData as { id: string }).id)
    .eq('status', 'published')
    .order('downloads', { ascending: false })

  if (error) return { data: [], error: (error as { message?: string }).message ?? 'Query failed' }

  const rows = (data ?? []) as Array<DBItem & { publishers: DBPublisher }>
  return { data: rows.map(mapItem), error: null }
}
```

- [ ] **Step 5: Run query tests to confirm GREEN**

```bash
cd apps/market && bun test lib/queries/__tests__/items.test.ts
```

Expected: 4 pass, 0 fail

- [ ] **Step 6: Create `apps/market/app/api/items/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getItems } from '@/lib/queries/items'
import type { GetItemsOptions } from '@/lib/queries/items'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const rawCategory = searchParams.get('category')
  const category =
    rawCategory === 'provider' || rawCategory === 'skill' || rawCategory === 'mcp'
      ? rawCategory
      : null

  const options: GetItemsOptions = {
    category,
    q: searchParams.get('q') ?? undefined,
    limit: Math.min(Number(searchParams.get('limit') ?? '20'), 100),
    offset: Number(searchParams.get('offset') ?? '0'),
    sort: searchParams.get('sort') === 'created' ? 'created' : 'downloads',
  }

  const { data, error } = await getItems(options)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
  }

  return NextResponse.json({ items: data })
}
```

- [ ] **Step 7: Write failing API route test**

```typescript
// apps/market/app/api/items/__tests__/route.test.ts
import { test, expect, mock } from 'bun:test'
import type { Item } from '@aas/types'

const mockItem: Item = {
  id: 'item-1', slug: 'openai-provider', name: 'OpenAI Provider',
  description: 'OpenAI API', readmeUrl: 'https://example.com/readme',
  icon: 'https://example.com/icon.png', category: 'provider', version: '1.0.0',
  publisher: { id: 'pub-1', slug: 'openai', name: 'OpenAI',
    avatarUrl: 'https://example.com/logo.png', tier: 'official' },
  compatibleWith: ['claude', 'codex'], tags: [], downloads: 1000, rating: 0,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  configSchema: {}, supportedModels: ['gpt-4o'],
}

mock.module('@/lib/queries/items', () => ({
  getItems: async () => ({ data: [mockItem], error: null }),
  getItemBySlug: async () => ({ data: mockItem, error: null }),
  getFeaturedItems: async () => ({ data: [mockItem], error: null }),
  getNewItems: async () => ({ data: [mockItem], error: null }),
}))

import { GET } from '../route'

test('GET /api/items returns { items } array', async () => {
  const req = new Request('http://localhost/api/items') as unknown as import('next/server').NextRequest
  const res = await GET(req)
  expect(res.status).toBe(200)
  const body = await res.json() as { items: Item[] }
  expect(body.items).toHaveLength(1)
  expect(body.items[0].slug).toBe('openai-provider')
})

test('GET /api/items with category param passes it to query', async () => {
  let capturedOpts: unknown
  mock.module('@/lib/queries/items', () => ({
    getItems: async (opts: unknown) => { capturedOpts = opts; return { data: [], error: null } },
    getItemBySlug: async () => ({ data: null, error: null }),
    getFeaturedItems: async () => ({ data: [], error: null }),
    getNewItems: async () => ({ data: [], error: null }),
  }))

  const req = new Request('http://localhost/api/items?category=mcp') as unknown as import('next/server').NextRequest
  await GET(req)
  expect((capturedOpts as { category: string }).category).toBe('mcp')
})

test('GET /api/items with invalid category treats it as null', async () => {
  let capturedOpts: unknown
  mock.module('@/lib/queries/items', () => ({
    getItems: async (opts: unknown) => { capturedOpts = opts; return { data: [], error: null } },
    getItemBySlug: async () => ({ data: null, error: null }),
    getFeaturedItems: async () => ({ data: [], error: null }),
    getNewItems: async () => ({ data: [], error: null }),
  }))

  const req = new Request('http://localhost/api/items?category=bogus') as unknown as import('next/server').NextRequest
  await GET(req)
  expect((capturedOpts as { category: null }).category).toBeNull()
})

test('GET /api/items returns 500 on query error', async () => {
  mock.module('@/lib/queries/items', () => ({
    getItems: async () => ({ data: [], error: 'DB error' }),
    getItemBySlug: async () => ({ data: null, error: null }),
    getFeaturedItems: async () => ({ data: [], error: null }),
    getNewItems: async () => ({ data: [], error: null }),
  }))

  const req = new Request('http://localhost/api/items') as unknown as import('next/server').NextRequest
  const res = await GET(req)
  expect(res.status).toBe(500)
})
```

- [ ] **Step 8: Run to confirm RED**

```bash
cd apps/market && bun test app/api/items/__tests__/route.test.ts
```

Expected: fails

- [ ] **Step 9: Run to confirm GREEN after route file created**

```bash
cd apps/market && bun test app/api/items/__tests__/route.test.ts
```

Expected: 4 pass, 0 fail

- [ ] **Step 10: Replace placeholder Home page with real home page**

```typescript
// apps/market/app/page.tsx
import { getFeaturedItems, getNewItems } from '@/lib/queries/items'
import { ItemCard } from '@/components/ItemCard'

export const revalidate = 60 // ISR: revalidate every 60 seconds

export default async function HomePage() {
  const [featured, newest] = await Promise.all([
    getFeaturedItems(),
    getNewItems(),
  ])

  return (
    <main className="py-12">
      {/* Hero */}
      <section className="mb-12">
        <h1 className="text-3xl font-semibold tracking-tight text-ray-fg">
          AI Agent Store
        </h1>
        <p className="mt-2 max-w-xl text-ray-fg-secondary">
          Discover and install AI providers, skills, and MCP servers for Claude and Codex.
        </p>
      </section>

      {/* Featured */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-medium text-ray-fg">Featured</h2>
        {featured.data.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.data.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-ray-fg-muted">No items yet.</p>
        )}
      </section>

      {/* New */}
      <section>
        <h2 className="mb-4 text-lg font-medium text-ray-fg">New</h2>
        {newest.data.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {newest.data.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-ray-fg-muted">No items yet.</p>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Step 11: Create `apps/market/app/store/page.tsx`**

```typescript
import { getItems } from '@/lib/queries/items'
import { ItemCard } from '@/components/ItemCard'
import { CategoryTabs } from '@/components/CategoryTabs'
import { SearchInput } from '@/components/SearchInput'
import { Suspense } from 'react'

interface StorePageProps {
  searchParams: {
    category?: string
    q?: string
    offset?: string
  }
}

export const revalidate = 30

export default async function StorePage({ searchParams }: StorePageProps) {
  const rawCategory = searchParams.category
  const category =
    rawCategory === 'provider' || rawCategory === 'skill' || rawCategory === 'mcp'
      ? rawCategory
      : null

  const { data: items } = await getItems({
    category,
    q: searchParams.q,
    offset: Number(searchParams.offset ?? '0'),
    limit: 24,
  })

  const activeTab = category ?? 'all'

  return (
    <main className="py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-ray-fg">Store</h1>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}>
            <SearchInput defaultValue={searchParams.q} />
          </Suspense>
          <Suspense fallback={null}>
            <CategoryTabs active={activeTab as 'all' | 'provider' | 'skill' | 'mcp'} />
          </Suspense>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl border border-ray-border bg-ray-surface-1">
          <p className="text-ray-fg-muted">No items found.</p>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 12: Create `apps/market/app/store/[category]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { getItems } from '@/lib/queries/items'
import { ItemCard } from '@/components/ItemCard'
import { CategoryTabs } from '@/components/CategoryTabs'
import { SearchInput } from '@/components/SearchInput'
import { Suspense } from 'react'

type ValidCategory = 'provider' | 'skill' | 'mcp'

interface CategoryPageProps {
  params: { category: string }
  searchParams: { q?: string; offset?: string }
}

export function generateStaticParams() {
  return [
    { category: 'provider' },
    { category: 'skill' },
    { category: 'mcp' },
  ]
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const category = params.category as ValidCategory
  if (!['provider', 'skill', 'mcp'].includes(category)) notFound()

  const { data: items } = await getItems({
    category,
    q: searchParams.q,
    offset: Number(searchParams.offset ?? '0'),
    limit: 24,
  })

  const LABELS: Record<ValidCategory, string> = {
    provider: 'Providers',
    skill: 'Skills',
    mcp: 'MCPs',
  }

  return (
    <main className="py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-ray-fg">{LABELS[category]}</h1>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}>
            <SearchInput defaultValue={searchParams.q} />
          </Suspense>
          <Suspense fallback={null}>
            <CategoryTabs active={category} />
          </Suspense>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl border border-ray-border bg-ray-surface-1">
          <p className="text-ray-fg-muted">No {LABELS[category].toLowerCase()} found.</p>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 13: Run all tests**

```bash
cd apps/market && bun test
```

Expected: all prior tests + 4 new query tests + 4 new API route tests = 28 pass, 0 fail

- [ ] **Step 14: Type-check**

```bash
cd apps/market && bun run type-check
```

Expected: No errors

- [ ] **Step 15: Commit**

```bash
cd /path/to/repo && git add apps/market/
git commit -m "feat(market): query layer, GET /api/items, home and store browse pages"
```

---

### Task 5: Item Detail Page + Publisher Page + Readme Component

**Files:**
- Create: `apps/market/components/Readme.tsx`
- Create: `apps/market/app/api/items/[slug]/route.ts`
- Create: `apps/market/app/api/items/[slug]/__tests__/route.test.ts`
- Create: `apps/market/app/api/publishers/[slug]/route.ts`
- Create: `apps/market/app/store/[category]/[slug]/page.tsx`
- Create: `apps/market/app/publisher/[name]/page.tsx`

**Interfaces:**
- Consumes: `lib/queries/items.ts` — `getItemBySlug`
- Consumes: `lib/queries/publishers.ts` — `getPublisherBySlug`, `getPublisherItems`
- Produces:
  - `GET /api/items/[slug]` — response: `{ item: Item }`
  - `GET /api/publishers/[slug]` — response: `{ publisher: Publisher; items: Item[] }`
  - `Readme({ url: string })` — fetches and renders markdown from a URL

- [ ] **Step 1: Create `apps/market/components/Readme.tsx`**

```typescript
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ReadmeProps {
  url: string
}

async function fetchReadme(url: string): Promise<string> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return '_README not available._'
    return res.text()
  } catch {
    return '_README not available._'
  }
}

export async function Readme({ url }: ReadmeProps) {
  const content = await fetchReadme(url)

  return (
    <div className="prose prose-invert prose-sm max-w-none text-ray-fg-secondary
      prose-headings:text-ray-fg prose-a:text-ray-official prose-code:text-ray-fg
      prose-pre:bg-ray-surface-1 prose-pre:border prose-pre:border-ray-border">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
```

- [ ] **Step 2: Create `apps/market/app/api/items/[slug]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getItemBySlug } from '@/lib/queries/items'

interface Params {
  params: { slug: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { data, error } = await getItemBySlug(params.slug)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch item' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ item: data })
}
```

- [ ] **Step 3: Write failing test for item detail API route**

```typescript
// apps/market/app/api/items/[slug]/__tests__/route.test.ts
import { test, expect, mock } from 'bun:test'
import type { Item } from '@aas/types'

const mockItem: Item = {
  id: 'item-1', slug: 'openai-provider', name: 'OpenAI Provider',
  description: 'OpenAI API', readmeUrl: 'https://example.com/readme',
  icon: 'https://example.com/icon.png', category: 'provider', version: '1.0.0',
  publisher: { id: 'pub-1', slug: 'openai', name: 'OpenAI',
    avatarUrl: 'https://example.com/logo.png', tier: 'official' },
  compatibleWith: ['claude'], tags: [], downloads: 1000, rating: 0,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  configSchema: {}, supportedModels: ['gpt-4o'],
}

mock.module('@/lib/queries/items', () => ({
  getItems: async () => ({ data: [], error: null }),
  getItemBySlug: async (slug: string) => ({
    data: slug === 'openai-provider' ? mockItem : null,
    error: null,
  }),
  getFeaturedItems: async () => ({ data: [], error: null }),
  getNewItems: async () => ({ data: [], error: null }),
}))

import { GET } from '../route'

test('GET /api/items/[slug] returns item when found', async () => {
  const req = new Request('http://localhost/api/items/openai-provider') as unknown as import('next/server').NextRequest
  const res = await GET(req, { params: { slug: 'openai-provider' } })
  expect(res.status).toBe(200)
  const body = await res.json() as { item: Item }
  expect(body.item.slug).toBe('openai-provider')
})

test('GET /api/items/[slug] returns 404 when not found', async () => {
  const req = new Request('http://localhost/api/items/notexist') as unknown as import('next/server').NextRequest
  const res = await GET(req, { params: { slug: 'notexist' } })
  expect(res.status).toBe(404)
})
```

- [ ] **Step 4: Create `apps/market/app/api/publishers/[slug]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getPublisherBySlug, getPublisherItems } from '@/lib/queries/publishers'

interface Params {
  params: { slug: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const [publisherResult, itemsResult] = await Promise.all([
    getPublisherBySlug(params.slug),
    getPublisherItems(params.slug),
  ])

  if (publisherResult.error) {
    return NextResponse.json({ error: 'Failed to fetch publisher' }, { status: 500 })
  }

  if (!publisherResult.data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    publisher: publisherResult.data,
    items: itemsResult.data,
  })
}
```

- [ ] **Step 5: Create `apps/market/app/store/[category]/[slug]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getItemBySlug } from '@/lib/queries/items'
import { Badge } from '@/components/Badge'
import { Readme } from '@/components/Readme'

interface ItemDetailPageProps {
  params: { category: string; slug: string }
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { data: item, error } = await getItemBySlug(params.slug)

  if (error || !item) notFound()
  if (item.category !== params.category) notFound()

  const installCmd = `aas install ${item.slug}`

  return (
    <main className="py-8">
      {/* Header */}
      <div className="mb-8 flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ray-border bg-ray-surface-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.icon} alt={item.name} className="h-12 w-12 object-contain" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-ray-fg">{item.name}</h1>
            <span className="text-ray-fg-muted">v{item.version}</span>
            <Badge variant={item.publisher.tier}>{item.publisher.tier}</Badge>
          </div>
          <p className="mt-1 text-ray-fg-secondary">{item.description}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-ray-border bg-ray-surface-1 px-2 py-0.5 text-xs text-ray-fg-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Readme */}
        <div className="min-w-0 rounded-xl border border-ray-border bg-ray-surface-1 p-6">
          <Suspense fallback={<p className="text-ray-fg-muted">Loading readme…</p>}>
            <Readme url={item.readmeUrl} />
          </Suspense>
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-4">
          {/* Install */}
          <div className="rounded-xl border border-ray-border bg-ray-surface-1 p-4">
            <p className="mb-2 text-sm font-medium text-ray-fg">Install</p>
            <code className="block rounded-lg border border-ray-border bg-ray-surface-0 px-3 py-2 font-mono text-xs text-ray-fg">
              {installCmd}
            </code>
          </div>

          {/* Info */}
          <div className="rounded-xl border border-ray-border bg-ray-surface-1 p-4 text-sm">
            <dl className="flex flex-col gap-2">
              <div className="flex justify-between">
                <dt className="text-ray-fg-muted">Publisher</dt>
                <dd className="text-ray-fg">{item.publisher.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ray-fg-muted">Compatible with</dt>
                <dd className="text-ray-fg">{item.compatibleWith.join(', ')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ray-fg-muted">Downloads</dt>
                <dd className="text-ray-fg">{item.downloads.toLocaleString()}</dd>
              </div>
              {item.category === 'provider' && (
                <div className="flex flex-col gap-1">
                  <dt className="text-ray-fg-muted">Models</dt>
                  <dd className="text-ray-fg">{item.supportedModels.join(' · ')}</dd>
                </div>
              )}
              {item.category === 'mcp' && (
                <div className="flex justify-between">
                  <dt className="text-ray-fg-muted">Transport</dt>
                  <dd className="text-ray-fg">{item.transport}</dd>
                </div>
              )}
            </dl>
          </div>
        </aside>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Create `apps/market/app/publisher/[name]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { getPublisherBySlug, getPublisherItems } from '@/lib/queries/publishers'
import { ItemCard } from '@/components/ItemCard'
import { Badge } from '@/components/Badge'

interface PublisherPageProps {
  params: { name: string }
}

export default async function PublisherPage({ params }: PublisherPageProps) {
  const [publisherResult, itemsResult] = await Promise.all([
    getPublisherBySlug(params.name),
    getPublisherItems(params.name),
  ])

  if (publisherResult.error || !publisherResult.data) notFound()

  const publisher = publisherResult.data
  const items = itemsResult.data

  return (
    <main className="py-8">
      {/* Publisher header */}
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-ray-border bg-ray-surface-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={publisher.avatarUrl}
            alt={publisher.name}
            className="h-12 w-12 rounded-full object-cover"
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-ray-fg">{publisher.name}</h1>
            <Badge variant={publisher.tier}>{publisher.tier}</Badge>
          </div>
          {publisher.bio && (
            <p className="mt-1 text-sm text-ray-fg-secondary">{publisher.bio}</p>
          )}
        </div>
      </div>

      {/* Items */}
      <h2 className="mb-4 text-lg font-medium text-ray-fg">
        {items.length} item{items.length !== 1 ? 's' : ''}
      </h2>

      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl border border-ray-border bg-ray-surface-1">
          <p className="text-ray-fg-muted">No published items yet.</p>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Run tests**

```bash
cd apps/market && bun test
```

Expected: all prior tests + 2 new = 30 pass, 0 fail

- [ ] **Step 8: Type-check**

```bash
cd apps/market && bun run type-check
```

Expected: No errors

- [ ] **Step 9: Commit**

```bash
cd /path/to/repo && git add apps/market/
git commit -m "feat(market): item detail page, publisher page, Readme component, item/publisher API routes"
```

---

### Task 6: Auth + Dashboard + Submit Page

**Files:**
- Create: `apps/market/middleware.ts`
- Create: `apps/market/app/auth/callback/route.ts`
- Create: `apps/market/app/auth/login/route.ts`
- Create: `apps/market/app/dashboard/page.tsx`
- Create: `apps/market/app/submit/page.tsx`
- Create: `apps/market/app/api/items/create/route.ts`
- Create: `apps/market/lib/queries/__tests__/auth.test.ts`
- Create: `apps/market/app/api/items/create/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `lib/supabase/server.ts`, `lib/supabase/client.ts`
- Produces:
  - `GET /auth/login` — redirects to Supabase GitHub OAuth
  - `GET /auth/callback` — handles OAuth callback, sets session cookie
  - `GET /dashboard` — protected; shows user's bookmarks + published items
  - `GET /submit` — protected; item submission form
  - `POST /api/items/create` — protected; creates new item with `status: 'pending'`

- [ ] **Step 1: Create `apps/market/middleware.ts`**

This file runs on every request and refreshes the Supabase auth session (required by `@supabase/ssr`). It also protects `/dashboard` and `/submit` from unauthenticated access.

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PATHS = ['/dashboard', '/submit']

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Refresh session — required to keep auth alive
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p))

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Create `apps/market/app/auth/login/route.ts`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = createClient()
  const origin = new URL(request.url).origin

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  })

  if (error || !data.url) {
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }

  return NextResponse.redirect(data.url)
}
```

- [ ] **Step 3: Create `apps/market/app/auth/callback/route.ts`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_failed`)
}
```

- [ ] **Step 4: Create `apps/market/app/dashboard/page.tsx`**

The middleware guarantees the user is authenticated when this page renders.

```typescript
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch items submitted by this user (status any, including pending/rejected)
  const { data: myItems } = await supabase
    .from('items')
    .select('id, slug, name, category, status, version, created_at, publishers(name)')
    .eq('publishers.slug', user?.user_metadata['user_name'] ?? '')
    .order('created_at', { ascending: false })

  const items = (myItems ?? []) as Array<{
    id: string; slug: string; name: string;
    category: string; status: string; version: string; created_at: string
  }>

  const statusLabel: Record<string, string> = {
    published: '✓ Published',
    pending: '⏳ Under review',
    rejected: '✗ Rejected',
  }

  return (
    <main className="py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ray-fg">Dashboard</h1>
        <a
          href="/submit"
          className="rounded-lg bg-ray-accent px-4 py-2 text-sm font-medium text-ray-surface-0 hover:opacity-90"
        >
          Submit item
        </a>
      </div>

      <h2 className="mb-3 text-sm font-medium text-ray-fg-secondary uppercase tracking-wider">
        Your submissions
      </h2>

      {items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-ray-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ray-border bg-ray-surface-1">
                <th className="px-4 py-3 text-left text-ray-fg-secondary font-medium">Name</th>
                <th className="px-4 py-3 text-left text-ray-fg-secondary font-medium">Category</th>
                <th className="px-4 py-3 text-left text-ray-fg-secondary font-medium">Version</th>
                <th className="px-4 py-3 text-left text-ray-fg-secondary font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-ray-border last:border-0 bg-ray-surface-2">
                  <td className="px-4 py-3 text-ray-fg">{item.name}</td>
                  <td className="px-4 py-3 text-ray-fg-secondary">{item.category}</td>
                  <td className="px-4 py-3 text-ray-fg-secondary">{item.version}</td>
                  <td className="px-4 py-3 text-ray-fg-secondary">
                    {statusLabel[item.status] ?? item.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-xl border border-ray-border bg-ray-surface-1">
          <p className="text-ray-fg-muted">No submissions yet.</p>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Create `apps/market/app/submit/page.tsx`**

This is a client component (form interaction). The actual POST is handled by the `/api/items/create` route.

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface FormState {
  slug: string
  name: string
  description: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  readmeUrl: string
  icon: string
  compatibleWith: string[]
  tags: string
}

export default function SubmitPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [form, setForm] = useState<FormState>({
    slug: '',
    name: '',
    description: '',
    category: 'provider',
    version: '1.0.0',
    readmeUrl: '',
    icon: '',
    compatibleWith: ['claude'],
    tags: '',
  })

  function update(key: keyof FormState, value: string | string[]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const payload = {
      ...form,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }

    const res = await fetch('/api/items/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const body = await res.json() as { error?: string }

    if (!res.ok) {
      setError(body.error ?? 'Submission failed')
      setPending(false)
      return
    }

    router.push('/dashboard')
  }

  const inputClass =
    'w-full rounded-lg border border-ray-border bg-ray-surface-1 px-3 py-2 text-sm text-ray-fg placeholder:text-ray-fg-muted focus:border-ray-border-hover focus:outline-none'
  const labelClass = 'block text-xs font-medium text-ray-fg-secondary mb-1'

  return (
    <main className="py-8">
      <h1 className="mb-6 text-2xl font-semibold text-ray-fg">Submit item</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-xl">
        <div>
          <label className={labelClass}>Slug <span className="text-ray-danger">*</span></label>
          <input required className={inputClass} placeholder="openai-provider"
            value={form.slug} onChange={(e) => update('slug', e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>Name <span className="text-ray-danger">*</span></label>
          <input required className={inputClass} placeholder="OpenAI Provider"
            value={form.name} onChange={(e) => update('name', e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>Description <span className="text-ray-danger">*</span></label>
          <textarea required rows={2} className={inputClass} placeholder="Short description (1-2 sentences)"
            value={form.description} onChange={(e) => update('description', e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>Category <span className="text-ray-danger">*</span></label>
          <select required className={inputClass}
            value={form.category} onChange={(e) => update('category', e.target.value as FormState['category'])}>
            <option value="provider">Provider</option>
            <option value="skill">Skill</option>
            <option value="mcp">MCP</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Version <span className="text-ray-danger">*</span></label>
          <input required className={inputClass} placeholder="1.0.0"
            value={form.version} onChange={(e) => update('version', e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>README URL <span className="text-ray-danger">*</span></label>
          <input required type="url" className={inputClass} placeholder="https://..."
            value={form.readmeUrl} onChange={(e) => update('readmeUrl', e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>Icon URL <span className="text-ray-danger">*</span></label>
          <input required type="url" className={inputClass} placeholder="https://..."
            value={form.icon} onChange={(e) => update('icon', e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>Tags (comma-separated)</label>
          <input className={inputClass} placeholder="ai, openai, gpt"
            value={form.tags} onChange={(e) => update('tags', e.target.value)} />
        </div>

        {error && (
          <p className="rounded-lg border border-ray-danger/30 bg-ray-danger/10 px-3 py-2 text-sm text-ray-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-ray-accent px-4 py-2 text-sm font-medium text-ray-surface-0 hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Submitting…' : 'Submit for review'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 6: Create `apps/market/app/api/items/create/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface CreateItemBody {
  slug: string
  name: string
  description: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  readmeUrl: string
  icon: string
  compatibleWith: string[]
  tags: string[]
}

export async function POST(request: NextRequest) {
  const supabase = createClient()

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateItemBody
  try {
    body = await request.json() as CreateItemBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate required fields
  const required: (keyof CreateItemBody)[] = ['slug', 'name', 'description', 'category', 'version', 'readmeUrl', 'icon']
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 422 })
    }
  }

  const validCategories = ['provider', 'skill', 'mcp']
  if (!validCategories.includes(body.category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 422 })
  }

  // Look up publisher by GitHub username
  const githubUsername = user.user_metadata['user_name'] as string | undefined
  if (!githubUsername) {
    return NextResponse.json({ error: 'GitHub username not found' }, { status: 422 })
  }

  const { data: publisher, error: pubError } = await supabase
    .from('publishers')
    .select('id')
    .eq('slug', githubUsername)
    .limit(1)
    .single()

  if (pubError || !publisher) {
    return NextResponse.json(
      { error: 'Publisher profile not found. Please create one first.' },
      { status: 422 }
    )
  }

  const { error: insertError } = await supabase.from('items').insert({
    slug: body.slug,
    name: body.name,
    description: body.description,
    category: body.category,
    version: body.version,
    readme_url: body.readmeUrl,
    icon: body.icon,
    publisher_id: (publisher as { id: string }).id,
    compatible_with: body.compatibleWith ?? [],
    tags: body.tags ?? [],
    install_hook: { steps: [] },
    metadata: {},
    status: 'pending',
  })

  if (insertError) {
    // slug uniqueness violation
    if ((insertError as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'A item with this slug already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
```

- [ ] **Step 7: Write failing tests for create route**

```typescript
// apps/market/app/api/items/create/__tests__/route.test.ts
import { test, expect, mock } from 'bun:test'

// Authenticated user mock
const mockUser = {
  id: 'user-1',
  user_metadata: { user_name: 'testdev' },
}

function makeMockSupabase(opts: {
  user?: typeof mockUser | null
  publisher?: { id: string } | null
  insertError?: { code?: string } | null
} = {}) {
  const { user = mockUser, publisher = { id: 'pub-1' }, insertError = null } = opts

  return {
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : { message: 'Not authenticated' },
      }),
    },
    from: (table: string) => {
      if (table === 'publishers') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                single: async () => ({ data: publisher, error: publisher ? null : { code: 'PGRST116' } }),
              }),
            }),
          }),
        }
      }
      // items table
      return {
        insert: async () => ({ error: insertError }),
      }
    },
  }
}

mock.module('@/lib/supabase/server', () => ({
  createClient: () => makeMockSupabase(),
}))

import { POST } from '../route'

const validBody = {
  slug: 'test-item',
  name: 'Test Item',
  description: 'A test item',
  category: 'skill',
  version: '1.0.0',
  readmeUrl: 'https://example.com/readme',
  icon: 'https://example.com/icon.png',
  compatibleWith: ['claude'],
  tags: ['test'],
}

test('POST /api/items/create returns 201 on valid submission', async () => {
  const req = new Request('http://localhost/api/items/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validBody),
  }) as unknown as import('next/server').NextRequest
  const res = await POST(req)
  expect(res.status).toBe(201)
})

test('POST /api/items/create returns 401 when unauthenticated', async () => {
  mock.module('@/lib/supabase/server', () => ({
    createClient: () => makeMockSupabase({ user: null }),
  }))

  const req = new Request('http://localhost/api/items/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validBody),
  }) as unknown as import('next/server').NextRequest
  const res = await POST(req)
  expect(res.status).toBe(401)
})

test('POST /api/items/create returns 422 for missing required field', async () => {
  mock.module('@/lib/supabase/server', () => ({
    createClient: () => makeMockSupabase(),
  }))

  const { name: _, ...noName } = validBody
  const req = new Request('http://localhost/api/items/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(noName),
  }) as unknown as import('next/server').NextRequest
  const res = await POST(req)
  expect(res.status).toBe(422)
})

test('POST /api/items/create returns 422 for invalid category', async () => {
  mock.module('@/lib/supabase/server', () => ({
    createClient: () => makeMockSupabase(),
  }))

  const req = new Request('http://localhost/api/items/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validBody, category: 'plugin' }),
  }) as unknown as import('next/server').NextRequest
  const res = await POST(req)
  expect(res.status).toBe(422)
})

test('POST /api/items/create returns 409 on duplicate slug', async () => {
  mock.module('@/lib/supabase/server', () => ({
    createClient: () => makeMockSupabase({ insertError: { code: '23505' } }),
  }))

  const req = new Request('http://localhost/api/items/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validBody),
  }) as unknown as import('next/server').NextRequest
  const res = await POST(req)
  expect(res.status).toBe(409)
})
```

- [ ] **Step 8: Run tests**

```bash
cd apps/market && bun test app/api/items/create/
```

Expected: 5 pass, 0 fail

- [ ] **Step 9: Run full test suite**

```bash
cd apps/market && bun test
```

Expected: all pass, 0 fail

Running count: 2 (Task 1) + 6 (Task 2) + 12 (Task 3) + 4 (queries) + 4 (items API) + 2 (detail API) + 5 (create API) = **35 pass**

- [ ] **Step 10: Type-check**

```bash
cd apps/market && bun run type-check
```

Expected: No TypeScript errors

- [ ] **Step 11: Commit**

```bash
cd /path/to/repo && git add apps/market/
git commit -m "feat(market): auth flow, dashboard, submit page, POST /api/items/create"
```
