import { test, expect, mock } from 'bun:test'
import type { Item, Publisher } from '@aas/types'

const mockItem: Item = {
  id: 'item-1', slug: 'openai-provider', name: 'OpenAI Provider',
  description: 'OpenAI API', readmeUrl: 'https://example.com/readme',
  icon: 'https://example.com/icon.png', category: 'provider', version: '1.0.0',
  publisher: { id: 'pub-1', slug: 'openai', name: 'OpenAI', avatarUrl: 'https://example.com/logo.png', tier: 'official' },
  compatibleWith: ['claude', 'codex'], tags: [], downloads: 1000, rating: 0,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  configSchema: {}, supportedModels: ['gpt-4o'],
}
const mockPublisher: Publisher = mockItem.publisher

mock.module('../queries', () => ({
  getItems: async () => ({ data: [mockItem], error: null }),
  getItemBySlug: async (slug: string) =>
    slug === 'openai-provider' ? { data: mockItem, error: null } : { data: null, error: null },
  getPublisherBySlug: async (slug: string) =>
    slug === 'openai' ? { data: mockPublisher, error: null } : { data: null, error: null },
  getPublisherItems: async () => ({ data: [mockItem], error: null }),
}))

const { app } = await import('../app')

test('GET / health check', async () => {
  const res = await app.fetch(new Request('http://localhost/'))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, service: 'aas-api' })
})

test('GET /api/items returns { items }', async () => {
  const res = await app.fetch(new Request('http://localhost/api/items'))
  expect(res.status).toBe(200)
  const body = (await res.json()) as { items: Item[] }
  expect(body.items).toHaveLength(1)
  expect(body.items[0].slug).toBe('openai-provider')
})

test('GET /api/items sets CORS header', async () => {
  const res = await app.fetch(new Request('http://localhost/api/items'))
  expect(res.headers.get('access-control-allow-origin')).toBe('*')
})

test('GET /api/items/:slug returns { item }', async () => {
  const res = await app.fetch(new Request('http://localhost/api/items/openai-provider'))
  expect(res.status).toBe(200)
  const body = (await res.json()) as { item: Item }
  expect(body.item.slug).toBe('openai-provider')
})

test('GET /api/items/:slug returns 404 for unknown slug', async () => {
  const res = await app.fetch(new Request('http://localhost/api/items/nope'))
  expect(res.status).toBe(404)
})

test('GET /api/publishers/:slug returns { publisher, items }', async () => {
  const res = await app.fetch(new Request('http://localhost/api/publishers/openai'))
  expect(res.status).toBe(200)
  const body = (await res.json()) as { publisher: Publisher; items: Item[] }
  expect(body.publisher.slug).toBe('openai')
  expect(body.items).toHaveLength(1)
})

test('GET /api/publishers/:slug returns 404 for unknown publisher', async () => {
  const res = await app.fetch(new Request('http://localhost/api/publishers/nope'))
  expect(res.status).toBe(404)
})
