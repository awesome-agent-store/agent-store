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
