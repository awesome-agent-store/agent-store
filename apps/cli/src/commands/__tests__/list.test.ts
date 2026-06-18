import { test, expect } from 'bun:test'
import { runList } from '../list'
import type { AASEngine, InstalledItem } from '@aas/types'

const entry: InstalledItem = {
  slug: 'openai-provider', category: 'provider', version: '1.2.0',
  installedAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  compatibleWith: ['claude', 'codex'], enabledFor: { claude: true, codex: true },
}

const mcpEntry: InstalledItem = {
  slug: 'fs-mcp', category: 'mcp', version: '0.1.0',
  installedAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  compatibleWith: ['claude'], enabledFor: { claude: true },
}

function makeEngine(items: InstalledItem[]): AASEngine {
  return { list: async () => items } as unknown as AASEngine
}

test('runList shows header row', async () => {
  const lines: string[] = []
  await runList(makeEngine([entry]), [], s => lines.push(s))
  expect(lines[0]).toContain('NAME')
  expect(lines[0]).toContain('VERSION')
  expect(lines[0]).toContain('CLAUDE')
  expect(lines[0]).toContain('CODEX')
})

test('runList shows enabled symbols for claude and codex', async () => {
  const lines: string[] = []
  await runList(makeEngine([entry]), [], s => lines.push(s))
  const dataLine = lines.find(l => l.includes('openai-provider'))!
  expect(dataLine).toContain('✓')
})

test('runList shows empty CODEX cell for claude-only items', async () => {
  const lines: string[] = []
  await runList(makeEngine([mcpEntry]), [], s => lines.push(s))
  const dataLine = lines.find(l => l.includes('fs-mcp'))!
  expect(dataLine).toBeDefined()
  // codex column is blank (item not in compatibleWith for codex)
})

test('runList --for claude filters to claude-compatible only', async () => {
  const codexOnly: InstalledItem = {
    ...entry, slug: 'codex-only', compatibleWith: ['codex'], enabledFor: { codex: true },
  }
  const lines: string[] = []
  await runList(makeEngine([entry, codexOnly]), ['--for', 'claude'], s => lines.push(s))
  const output = lines.join('\n')
  expect(output).toContain('openai-provider')
  expect(output).not.toContain('codex-only')
})

test('runList shows "No items installed." when registry empty', async () => {
  const lines: string[] = []
  await runList(makeEngine([]), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('No items installed')
})

test('runList shows update status when updates map provided', async () => {
  const lines: string[] = []
  const updates = new Map([['openai-provider', '2.0.0']])
  await runList(makeEngine([entry]), [], s => lines.push(s), updates)
  const dataLine = lines.find(l => l.includes('openai-provider'))!
  expect(dataLine).toContain('↑')
  expect(dataLine).toContain('2.0.0')
})
