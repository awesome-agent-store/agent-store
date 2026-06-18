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
