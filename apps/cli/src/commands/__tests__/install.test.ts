import { test, expect } from 'bun:test'
import { runInstall } from '../install'
import type { AASEngine, InstalledItem } from '@aas/types'

const installedEntry: InstalledItem = {
  slug: 'openai-provider', category: 'provider', version: '1.2.0',
  installedAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  compatibleWith: ['claude', 'codex'], enabledFor: {},
}

function makeEngine(overrides?: Partial<AASEngine>): AASEngine {
  return {
    install: async () => ({ slug: 'openai-provider', version: '1.2.0', installedAt: '2026-06-18T00:00:00Z' }),
    info: async () => ({
      ...installedEntry, name: 'OpenAI Provider', description: '', readmeUrl: '',
      icon: '', publisher: { id: 'p', slug: 'p', name: 'P', avatarUrl: '', tier: 'official' },
      tags: [], downloads: 0, configSchema: {}, supportedModels: ['gpt-4o'],
    }),
    enable: async () => undefined,
    ...overrides,
  } as unknown as AASEngine
}

test('runInstall shows done steps and installed summary', async () => {
  const lines: string[] = []
  await runInstall(makeEngine(), ['openai-provider'], s => lines.push(s))
  const out = lines.join('\n')
  expect(out).toContain('done')
  expect(out).toContain('Installed openai-provider 1.2.0')
})

test('runInstall shows config warning for provider', async () => {
  const lines: string[] = []
  await runInstall(makeEngine(), ['openai-provider'], s => lines.push(s))
  expect(lines.join('\n')).toContain('aas config')
})

test('runInstall shows sync step for each compatible target', async () => {
  const lines: string[] = []
  await runInstall(makeEngine(), ['openai-provider'], s => lines.push(s))
  const out = lines.join('\n')
  expect(out).toContain('claude')
  expect(out).toContain('codex')
})

test('runInstall shows usage when no slug', async () => {
  const lines: string[] = []
  await runInstall(makeEngine(), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage')
})

test('runInstall shows error message on failure', async () => {
  const lines: string[] = []
  const engine = makeEngine({ install: async () => { throw new Error('Not found') } })
  await runInstall(engine, ['unknown'], s => lines.push(s))
  expect(lines.join('\n')).toContain('Not found')
})
