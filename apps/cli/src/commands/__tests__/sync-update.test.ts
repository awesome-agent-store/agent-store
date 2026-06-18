import { test, expect } from 'bun:test'
import { runSync } from '../sync'
import { runUpdate } from '../update'
import type { AASEngine, UpdateResult } from '@aas/types'

function makeSyncEngine(synced: string[] = [], errors: Array<{slug:string;error:string}> = []): AASEngine {
  return { sync: async () => ({ synced, errors }) } as unknown as AASEngine
}

function makeUpdateEngine(results: UpdateResult[] = []): AASEngine {
  return {
    update: async () => results,
    checkUpdates: async () => [],
  } as unknown as AASEngine
}

test('runSync shows synced count', async () => {
  const lines: string[] = []
  await runSync(makeSyncEngine(['openai-provider:claude', 'openai-provider:codex']), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('2')
})

test('runSync passes --for target to engine', async () => {
  let calledWith: string[] | undefined
  const engine = {
    sync: async (targets: string[]) => { calledWith = targets; return { synced: [], errors: [] } },
  } as unknown as AASEngine
  await runSync(engine, ['--for', 'claude'], () => {})
  expect(calledWith).toEqual(['claude'])
})

test('runSync shows errors when present', async () => {
  const lines: string[] = []
  await runSync(makeSyncEngine([], [{ slug: 'bad', error: 'failed' }]), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('bad')
})

test('runUpdate shows updated results', async () => {
  const results: UpdateResult[] = [{ slug: 'openai-provider', fromVersion: '1.0.0', toVersion: '2.0.0' }]
  const lines: string[] = []
  await runUpdate(makeUpdateEngine(results), [], s => lines.push(s))
  const out = lines.join('\n')
  expect(out).toContain('openai-provider')
  expect(out).toContain('2.0.0')
})

test('runUpdate shows "No updates" when none', async () => {
  const lines: string[] = []
  await runUpdate(makeUpdateEngine([]), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('No updates')
})

test('runUninstall shows usage when no slug', async () => {
  const { runUninstall } = await import('../uninstall')
  const lines: string[] = []
  await runUninstall({ uninstall: async () => {} } as unknown as AASEngine, [], s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage')
})

test('runUninstall shows success', async () => {
  const { runUninstall } = await import('../uninstall')
  const lines: string[] = []
  await runUninstall({ uninstall: async () => {} } as unknown as AASEngine, ['test-mcp'], s => lines.push(s))
  expect(lines.join('\n')).toContain('Uninstalled')
})
