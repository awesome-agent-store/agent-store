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
