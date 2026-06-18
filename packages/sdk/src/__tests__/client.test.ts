import { describe, test, expect } from 'bun:test'
import { AASClient } from '../client'
import type { Item } from '@aas/types'

describe('AASClient constructor', () => {
  test('uses provided baseUrl', () => {
    const client = new AASClient('https://market.example.com')
    expect(client.baseUrl).toBe('https://market.example.com')
  })

  test('defaults to http://localhost:3000', () => {
    const client = new AASClient()
    expect(client.baseUrl).toBe('http://localhost:3000')
  })

  test('strips trailing slash from baseUrl', () => {
    const client = new AASClient('https://market.example.com/')
    expect(client.baseUrl).toBe('https://market.example.com')
  })
})

// Minimal valid Item fixture for mocking
const fakeItem: Item = {
  id: 'item-1',
  slug: 'test-provider',
  name: 'Test Provider',
  description: 'A test provider',
  readmeUrl: 'https://example.com/readme',
  icon: 'https://example.com/icon.png',
  category: 'provider',
  version: '1.0.0',
  publisher: {
    id: 'pub-1',
    slug: 'test-publisher',
    name: 'Test Publisher',
    avatarUrl: 'https://example.com/avatar.png',
    tier: 'official',
  },
  compatibleWith: ['claude'],
  tags: ['ai'],
  downloads: 100,
  rating: 0,
  status: 'published',
  installHook: { steps: [] },
  createdAt: '2026-06-18T00:00:00Z',
  updatedAt: '2026-06-18T00:00:00Z',
  configSchema: {},
  supportedModels: ['gpt-4o'],
}

describe('AASClient.getItems', () => {
  test('calls GET /api/items and returns items on success', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url: RequestInfo | URL) => {
      expect(String(url)).toBe('http://localhost:3000/api/items')
      return new Response(JSON.stringify({ items: [fakeItem] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const client = new AASClient()
    const result = await client.getItems()
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1)
    expect(result.data![0].slug).toBe('test-provider')

    globalThis.fetch = originalFetch
  })

  test('appends query params when provided', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url: RequestInfo | URL) => {
      const u = new URL(String(url))
      expect(u.searchParams.get('category')).toBe('provider')
      expect(u.searchParams.get('q')).toBe('gpt')
      expect(u.searchParams.get('limit')).toBe('5')
      expect(u.searchParams.get('offset')).toBe('10')
      expect(u.searchParams.get('sort')).toBe('created')
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    }

    const client = new AASClient()
    await client.getItems({ category: 'provider', q: 'gpt', limit: 5, offset: 10, sort: 'created' })

    globalThis.fetch = originalFetch
  })

  test('returns error string on non-200 response', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Failed to fetch items' }), { status: 500 })

    const client = new AASClient()
    const result = await client.getItems()
    expect(result.data).toBeNull()
    expect(result.error).toBe('Failed to fetch items')

    globalThis.fetch = originalFetch
  })

  test('returns error string on network failure', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('Network error') }

    const client = new AASClient()
    const result = await client.getItems()
    expect(result.data).toBeNull()
    expect(result.error).toBe('Network error')

    globalThis.fetch = originalFetch
  })
})

describe('AASClient.getItemBySlug', () => {
  test('calls GET /api/items/:slug and returns item on success', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url: RequestInfo | URL) => {
      expect(String(url)).toBe('http://localhost:3000/api/items/test-provider')
      return new Response(JSON.stringify({ item: fakeItem }), { status: 200 })
    }

    const client = new AASClient()
    const result = await client.getItemBySlug('test-provider')
    expect(result.error).toBeNull()
    expect(result.data?.slug).toBe('test-provider')

    globalThis.fetch = originalFetch
  })

  test('returns error string on 404', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

    const client = new AASClient()
    const result = await client.getItemBySlug('no-such-slug')
    expect(result.data).toBeNull()
    expect(result.error).toBe('Not found')

    globalThis.fetch = originalFetch
  })
})

import type { Publisher } from '@aas/types'

const fakePublisher: Publisher = {
  id: 'pub-1',
  slug: 'openai',
  name: 'OpenAI',
  avatarUrl: 'https://example.com/avatar.png',
  tier: 'official',
}

describe('AASClient.getPublisher', () => {
  test('calls GET /api/publishers/:slug and returns publisher + items', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url: RequestInfo | URL) => {
      expect(String(url)).toBe('http://localhost:3000/api/publishers/openai')
      return new Response(
        JSON.stringify({ publisher: fakePublisher, items: [fakeItem] }),
        { status: 200 }
      )
    }

    const client = new AASClient()
    const result = await client.getPublisher('openai')
    expect(result.error).toBeNull()
    expect(result.data?.publisher.slug).toBe('openai')
    expect(result.data?.items).toHaveLength(1)

    globalThis.fetch = originalFetch
  })

  test('returns error on 404', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

    const client = new AASClient()
    const result = await client.getPublisher('no-such-publisher')
    expect(result.data).toBeNull()
    expect(result.error).toBe('Not found')

    globalThis.fetch = originalFetch
  })
})

const createBody: import('../client').CreateItemBody = {
  slug: 'my-provider',
  name: 'My Provider',
  description: 'A provider',
  category: 'provider',
  version: '1.0.0',
  readmeUrl: 'https://example.com/readme',
  icon: 'https://example.com/icon.png',
  compatibleWith: ['claude'],
  tags: ['ai'],
}

describe('AASClient.createItem', () => {
  test('calls POST /api/items/create with JSON body and returns success', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('http://localhost:3000/api/items/create')
      expect(init?.method).toBe('POST')
      const body = JSON.parse(init?.body as string)
      expect(body.slug).toBe('my-provider')
      return new Response(JSON.stringify({ success: true }), { status: 201 })
    }

    const client = new AASClient()
    const result = await client.createItem(createBody)
    expect(result.error).toBeNull()
    expect(result.data?.success).toBe(true)

    globalThis.fetch = originalFetch
  })

  test('forwards cookie header when provided', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['Cookie']).toBe('sb-token=abc123')
      return new Response(JSON.stringify({ success: true }), { status: 201 })
    }

    const client = new AASClient()
    await client.createItem(createBody, { cookie: 'sb-token=abc123' })

    globalThis.fetch = originalFetch
  })

  test('returns error on 401', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    const client = new AASClient()
    const result = await client.createItem(createBody)
    expect(result.data).toBeNull()
    expect(result.error).toBe('Unauthorized')

    globalThis.fetch = originalFetch
  })

  test('returns error on 409 duplicate slug', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: 'An item with this slug already exists' }),
        { status: 409 }
      )

    const client = new AASClient()
    const result = await client.createItem(createBody)
    expect(result.data).toBeNull()
    expect(result.error).toBe('An item with this slug already exists')

    globalThis.fetch = originalFetch
  })
})
