import { test, expect } from 'bun:test'
import { runInfo } from '../info'
import type { AASEngine, ItemDetail } from '@aas/types'

const publisher = { id: 'p1', slug: 'openai', name: 'OpenAI', avatarUrl: '', tier: 'official' as const }

const detail: ItemDetail = {
  slug: 'openai-provider', category: 'provider', version: '1.2.0',
  installedAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  compatibleWith: ['claude', 'codex'], enabledFor: { claude: true, codex: false },
  name: 'OpenAI Provider', description: 'OpenAI API provider',
  readmeUrl: '', icon: '',
  publisher, tags: [], downloads: 1_200_000,
  configSchema: {}, currentConfig: { apiKey: 'sk-test' },
  supportedModels: ['gpt-4o', 'gpt-4o-mini'],
}

function makeEngine(d: ItemDetail): AASEngine {
  return { info: async () => d } as unknown as AASEngine
}

test('runInfo prints slug, version, tier', async () => {
  const lines: string[] = []
  await runInfo(makeEngine(detail), ['openai-provider'], s => lines.push(s))
  const out = lines.join('\n')
  expect(out).toContain('openai-provider')
  expect(out).toContain('1.2.0')
  expect(out).toContain('official')
})

test('runInfo prints publisher name', async () => {
  const lines: string[] = []
  await runInfo(makeEngine(detail), ['openai-provider'], s => lines.push(s))
  expect(lines.join('\n')).toContain('OpenAI')
})

test('runInfo prints enable status', async () => {
  const lines: string[] = []
  await runInfo(makeEngine(detail), ['openai-provider'], s => lines.push(s))
  const out = lines.join('\n')
  expect(out).toContain('enabled')
  expect(out).toContain('disabled')
})

test('runInfo prints models for provider', async () => {
  const lines: string[] = []
  await runInfo(makeEngine(detail), ['openai-provider'], s => lines.push(s))
  expect(lines.join('\n')).toContain('gpt-4o')
})

test('runInfo prints config hint for provider', async () => {
  const lines: string[] = []
  await runInfo(makeEngine(detail), ['openai-provider'], s => lines.push(s))
  expect(lines.join('\n')).toContain('aas config')
})

test('runInfo shows usage when no slug', async () => {
  const lines: string[] = []
  await runInfo(makeEngine(detail), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage')
})
