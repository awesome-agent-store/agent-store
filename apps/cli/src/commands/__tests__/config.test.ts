import { test, expect } from 'bun:test'
import { runConfig } from '../config'
import type { AASEngine, JsonSchema } from '@as/types'

const schema: JsonSchema = {
  type: 'object',
  required: ['apiKey'],
  properties: {
    apiKey: { type: 'string', description: 'API Key' },
    baseUrl: { type: 'string', description: 'Base URL', default: 'https://api.openai.com/v1' },
  },
}

function makeEngine(setConfigSpy?: (slug: string, values: Record<string, unknown>) => void): AASEngine {
  return {
    getConfigSchema: async () => ({ schema, current: {} }),
    setConfig: async (slug: string, values: Record<string, unknown>) => { setConfigSpy?.(slug, values) },
  } as unknown as AASEngine
}

test('runConfig prompts for each schema property', async () => {
  const prompted: string[] = []
  const prompter = async (q: string) => { prompted.push(q); return 'sk-test' }
  await runConfig(makeEngine(), ['openai-provider'], prompter, () => {})
  expect(prompted).toHaveLength(2)
  expect(prompted[0]).toContain('API Key')
  expect(prompted[1]).toContain('Base URL')
})

test('runConfig uses default when user enters empty string', async () => {
  let saved: Record<string, unknown> = {}
  const engine = makeEngine((_, v) => { saved = v })
  const prompter = async (_q: string) => ''
  await runConfig(engine, ['openai-provider'], prompter, () => {})
  expect(saved.baseUrl).toBe('https://api.openai.com/v1')
})

test('runConfig uses entered value over default', async () => {
  let saved: Record<string, unknown> = {}
  const engine = makeEngine((_, v) => { saved = v })
  const prompter = async (q: string) => q.includes('API') ? 'sk-123' : 'https://custom.api.com'
  await runConfig(engine, ['openai-provider'], prompter, () => {})
  expect(saved.apiKey).toBe('sk-123')
  expect(saved.baseUrl).toBe('https://custom.api.com')
})

test('runConfig shows "Saved." after completing', async () => {
  const lines: string[] = []
  const prompter = async () => 'sk-test'
  await runConfig(makeEngine(), ['openai-provider'], prompter, s => lines.push(s))
  expect(lines.join('\n')).toContain('Saved')
})

test('runConfig shows usage when no slug', async () => {
  const lines: string[] = []
  await runConfig(makeEngine(), [], async () => '', s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage')
})

test('runConfig marks required fields', async () => {
  const prompted: string[] = []
  const prompter = async (q: string) => { prompted.push(q); return 'x' }
  await runConfig(makeEngine(), ['openai-provider'], prompter, () => {})
  expect(prompted[0]).toContain('required')
})

test('runConfig prompts required fields first, then optional fields by key', async () => {
  const prompted: string[] = []
  const engine = {
    getConfigSchema: async () => ({
      schema: {
        type: 'object',
        required: ['apiKey'],
        properties: {
          model: { type: 'string', description: 'Model', default: 'gpt-4o' },
          apiKey: { type: 'string', description: 'OpenAI API Key' },
          baseUrl: { type: 'string', description: 'Base URL', default: 'https://api.openai.com/v1' },
        },
      },
      current: {},
    }),
    setConfig: async () => undefined,
  } as unknown as AASEngine

  const prompter = async (q: string) => { prompted.push(q); return '' }
  await runConfig(engine, ['openai-provider'], prompter, () => {})

  expect(prompted).toHaveLength(3)
  expect(prompted[0]).toContain('OpenAI API Key')
  expect(prompted[1]).toContain('Base URL')
  expect(prompted[2]).toContain('Model')
})
