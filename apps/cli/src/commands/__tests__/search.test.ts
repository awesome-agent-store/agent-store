import { test, expect } from 'bun:test'
import { runSearch } from '../search'
import type { AASEngine, Item } from '@aas/types'

const publisher = { id: 'p1', slug: 'openai', name: 'OpenAI', avatarUrl: '', tier: 'official' as const }
const mockItem = {
  id: 'i1', slug: 'openai-provider', name: 'OpenAI Provider',
  description: 'OpenAI API provider with GPT-4o support',
  readmeUrl: '', icon: '', category: 'provider' as const, version: '1.2.0',
  publisher, compatibleWith: ['claude' as const, 'codex' as const],
  tags: [], downloads: 1_200_000, rating: 0, status: 'published' as const,
  installHook: { steps: [] }, createdAt: '', updatedAt: '',
  configSchema: {}, supportedModels: ['gpt-4o'],
} satisfies Item

function makeEngine(items: Item[]): AASEngine {
  return {
    search: async () => items,
  } as unknown as AASEngine
}

test('runSearch prints slug + metadata + description for each result', async () => {
  const lines: string[] = []
  await runSearch(makeEngine([mockItem]), ['gpt'], s => lines.push(s))
  expect(lines.some(l => l.includes('openai-provider'))).toBe(true)
  expect(lines.some(l => l.includes('official'))).toBe(true)
  expect(lines.some(l => l.includes('1.2M'))).toBe(true)
  expect(lines.some(l => l.includes('OpenAI API provider'))).toBe(true)
})

test('runSearch prints "No results." when empty', async () => {
  const lines: string[] = []
  await runSearch(makeEngine([]), ['gpt'], s => lines.push(s))
  expect(lines.join('\n')).toContain('No results')
})

test('runSearch prints usage when no query provided', async () => {
  const lines: string[] = []
  await runSearch(makeEngine([]), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage')
})
