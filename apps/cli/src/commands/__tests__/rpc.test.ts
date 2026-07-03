import { test, expect } from 'bun:test'
import { runRpc } from '../rpc'
import type { AASEngine } from '@aas/types'

function makeEngine(overrides?: Partial<AASEngine>): AASEngine {
  return {
    search: async () => [],
    install: async () => ({ slug: 'openai-provider', version: '1.2.0', installedAt: '2026-06-18T00:00:00Z' }),
    uninstall: async () => undefined,
    enable: async () => undefined,
    disable: async () => undefined,
    getConfigSchema: async () => ({ schema: {}, current: {} }),
    setConfig: async () => undefined,
    sync: async () => ({ synced: [], errors: [] }),
    checkUpdates: async () => [],
    update: async () => [],
    list: async () => [],
    info: async () => {
      throw new Error('not installed')
    },
    duplicateProvider: async () => ({ newSlug: 'openai-provider-copy' }),
    ...overrides,
  } as unknown as AASEngine
}

test('runRpc calls install with parsed JSON args and prints ok:true', async () => {
  const lines: string[] = []
  const code = await runRpc(makeEngine(), ['install', '["openai-provider"]'], s => lines.push(s))
  expect(code).toBe(0)
  const parsed = JSON.parse(lines[0])
  expect(parsed.ok).toBe(true)
  expect(parsed.data.slug).toBe('openai-provider')
})

test('runRpc calls enable with two positional args', async () => {
  const enable = async (slug: string, target: string) => {
    expect(slug).toBe('openai-provider')
    expect(target).toBe('claude')
  }
  const lines: string[] = []
  const code = await runRpc(makeEngine({ enable: enable as AASEngine['enable'] }), ['enable', '["openai-provider","claude"]'], s => lines.push(s))
  expect(code).toBe(0)
  expect(JSON.parse(lines[0]).ok).toBe(true)
})

test('runRpc returns ok:false and exit code 1 for an unknown method', async () => {
  const lines: string[] = []
  const code = await runRpc(makeEngine(), ['not-a-method', '[]'], s => lines.push(s))
  expect(code).toBe(1)
  const parsed = JSON.parse(lines[0])
  expect(parsed.ok).toBe(false)
  expect(parsed.error).toContain('not-a-method')
})

test('runRpc returns ok:false and exit code 1 for invalid JSON args', async () => {
  const lines: string[] = []
  const code = await runRpc(makeEngine(), ['install', 'not-json'], s => lines.push(s))
  expect(code).toBe(1)
  expect(JSON.parse(lines[0]).ok).toBe(false)
})

test('runRpc returns ok:false and exit code 1 when the engine call throws', async () => {
  const lines: string[] = []
  const code = await runRpc(makeEngine(), ['info', '["missing-slug"]'], s => lines.push(s))
  expect(code).toBe(1)
  const parsed = JSON.parse(lines[0])
  expect(parsed.ok).toBe(false)
  expect(parsed.error).toBe('not installed')
})

test('runRpc defaults to empty args array when jsonArgs is omitted', async () => {
  const lines: string[] = []
  const code = await runRpc(makeEngine(), ['list'], s => lines.push(s))
  expect(code).toBe(0)
  expect(JSON.parse(lines[0]).data).toEqual([])
})

test('runRpc calls duplicateProvider with the slug and returns the new slug', async () => {
  const duplicateProvider = async (slug: string) => {
    expect(slug).toBe('openai-provider')
    return { newSlug: 'openai-provider-copy' }
  }
  const lines: string[] = []
  const code = await runRpc(
    makeEngine({ duplicateProvider: duplicateProvider as AASEngine['duplicateProvider'] }),
    ['duplicateProvider', '["openai-provider"]'],
    s => lines.push(s)
  )
  expect(code).toBe(0)
  const parsed = JSON.parse(lines[0])
  expect(parsed.ok).toBe(true)
  expect(parsed.data.newSlug).toBe('openai-provider-copy')
})
