import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'fs/promises'
import { join } from 'path'
import { readProviderConnection } from '../provider'
import { duplicateProviderConnection } from '../provider'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp('/tmp/as-provider-test-')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('readProviderConnection returns undefined authType/modelMapping when absent', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', baseUrl: 'https://x.com' }))
  const conn = await readProviderConnection(dir)
  expect(conn.authType).toBeUndefined()
  expect(conn.modelMapping).toBeUndefined()
})

test('readProviderConnection reads a string authType', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', authType: 'anthropic' }))
  const conn = await readProviderConnection(dir)
  expect(conn.authType).toBe('anthropic')
})

test('readProviderConnection reads a custom-header authType', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', authType: { header: 'X-Custom-Key' } }))
  const conn = await readProviderConnection(dir)
  expect(conn.authType).toEqual({ header: 'X-Custom-Key' })
})

test('readProviderConnection reads modelMapping', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({
    apiKey: 'k',
    modelMapping: { 'claude-3-5-sonnet': 'gpt-4o', 'claude-*': 'gpt-4o-mini' },
  }))
  const conn = await readProviderConnection(dir)
  expect(conn.modelMapping).toEqual({ 'claude-3-5-sonnet': 'gpt-4o', 'claude-*': 'gpt-4o-mini' })
})

test('readProviderConnection ignores a malformed authType', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', authType: 42 }))
  const conn = await readProviderConnection(dir)
  expect(conn.authType).toBeUndefined()
})

test('duplicateProviderConnection copies manifest with new slug/id and appends a suffix to the name', async () => {
  const sourceDir = join(dir, 'source')
  const targetDir = join(dir, 'target')
  await mkdir(sourceDir, { recursive: true })
  await writeFile(join(sourceDir, 'manifest.json'), JSON.stringify({ id: 'yls', slug: 'yls', name: 'yls' }))
  await writeFile(join(sourceDir, 'config.json'), JSON.stringify({ apiKey: 'k', baseUrl: 'https://x.com' }))

  await duplicateProviderConnection(sourceDir, targetDir, 'yls-copy')

  const manifest = JSON.parse(await readFile(join(targetDir, 'manifest.json'), 'utf-8'))
  expect(manifest.slug).toBe('yls-copy')
  expect(manifest.id).toBe('yls-copy')
  expect(manifest.name).toBe('yls 副本')

  const config = JSON.parse(await readFile(join(targetDir, 'config.json'), 'utf-8'))
  expect(config).toEqual({ apiKey: '', baseUrl: 'https://x.com' })
})

test('duplicateProviderConnection falls back to the new slug for the copy name when the source manifest has no name', async () => {
  const sourceDir = join(dir, 'source-no-name')
  const targetDir = join(dir, 'target-no-name')
  await mkdir(sourceDir, { recursive: true })
  await writeFile(join(sourceDir, 'manifest.json'), JSON.stringify({ id: 'yls', slug: 'yls' }))

  await duplicateProviderConnection(sourceDir, targetDir, 'yls-copy')

  const manifest = JSON.parse(await readFile(join(targetDir, 'manifest.json'), 'utf-8'))
  expect(manifest.name).toBe('yls-copy 副本')
  expect(manifest.name).not.toContain('undefined')
})

test('duplicateProviderConnection strips every credential alias (apiKey, apiKeys, token)', async () => {
  const sourceDir = join(dir, 'source-secrets')
  const targetDir = join(dir, 'target-secrets')
  await mkdir(sourceDir, { recursive: true })
  await writeFile(join(sourceDir, 'manifest.json'), JSON.stringify({ id: 'yls', slug: 'yls', name: 'yls' }))
  await writeFile(
    join(sourceDir, 'config.json'),
    JSON.stringify({ token: 'tok-secret', apiKeys: ['key-a', 'key-b'], apiKey: 'key-single', baseUrl: 'https://x.com' })
  )

  await duplicateProviderConnection(sourceDir, targetDir, 'yls-secrets-copy')

  const config = JSON.parse(await readFile(join(targetDir, 'config.json'), 'utf-8'))
  expect(config.apiKey).toBe('')
  expect(config.apiKeys).toBeUndefined()
  expect(config.token).toBeUndefined()
  expect(config.baseUrl).toBe('https://x.com')
})

test('duplicateProviderConnection drops a token-only credential so the copy has no key', async () => {
  const sourceDir = join(dir, 'source-token-only')
  const targetDir = join(dir, 'target-token-only')
  await mkdir(sourceDir, { recursive: true })
  await writeFile(join(sourceDir, 'manifest.json'), JSON.stringify({ id: 'yls', slug: 'yls', name: 'yls' }))
  await writeFile(join(sourceDir, 'config.json'), JSON.stringify({ token: 'tok-secret', baseUrl: 'https://x.com' }))

  await duplicateProviderConnection(sourceDir, targetDir, 'yls-token-copy')

  const config = JSON.parse(await readFile(join(targetDir, 'config.json'), 'utf-8'))
  expect(config.token).toBeUndefined()
  // The read layer must not surface a key from the copy (token was its only credential).
  const conn = await readProviderConnection(targetDir)
  expect(conn.apiKey).toBeUndefined()
})

test('duplicateProviderConnection writes an empty config.json when the source has none', async () => {
  const sourceDir = join(dir, 'source-no-config')
  const targetDir = join(dir, 'target-no-config')
  await mkdir(sourceDir, { recursive: true })
  await writeFile(join(sourceDir, 'manifest.json'), JSON.stringify({ id: 'yls', slug: 'yls', name: 'yls' }))

  await duplicateProviderConnection(sourceDir, targetDir, 'yls-copy-2')

  const config = JSON.parse(await readFile(join(targetDir, 'config.json'), 'utf-8'))
  expect(config).toEqual({})
})

test('readProviderConnection reads pricingUrl and pricing', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({
    apiKey: 'k',
    pricingUrl: 'https://example.com/pricing',
    pricing: {
      'gpt-5': { input: 2.5, output: 15, cacheRead: 0.25 },
    },
  }))
  const conn = await readProviderConnection(dir)
  expect(conn.pricingUrl).toBe('https://example.com/pricing')
  expect(conn.pricing).toEqual({ 'gpt-5': { input: 2.5, output: 15, cacheRead: 0.25 } })
})

test('readProviderConnection returns undefined pricingUrl/pricing when absent', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k' }))
  const conn = await readProviderConnection(dir)
  expect(conn.pricingUrl).toBeUndefined()
  expect(conn.pricing).toBeUndefined()
})

test('readProviderConnection ignores a malformed pricing entry (non-numeric input)', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({
    apiKey: 'k',
    pricing: { 'gpt-5': { input: 'not-a-number', output: 15 } },
  }))
  const conn = await readProviderConnection(dir)
  expect(conn.pricing).toBeUndefined()
})

test('readProviderConnection reads homepage, endpointPath, upstreamProtocol, level, whitelist, healthCheck', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({
    apiKey: 'k',
    homepage: 'https://docs.example.com',
    endpointPath: '/v1/chat/completions',
    upstreamProtocol: 'openai_chat',
    level: 2,
    whitelist: ['claude-*', 'gpt-4o'],
    healthCheck: true,
  }))
  const conn = await readProviderConnection(dir)
  expect(conn.homepage).toBe('https://docs.example.com')
  expect(conn.endpointPath).toBe('/v1/chat/completions')
  expect(conn.upstreamProtocol).toBe('openai_chat')
  expect(conn.level).toBe(2)
  expect(conn.whitelist).toEqual(['claude-*', 'gpt-4o'])
  expect(conn.healthCheck).toBe(true)
})

test('readProviderConnection returns undefined for absent new fields', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k' }))
  const conn = await readProviderConnection(dir)
  expect(conn.homepage).toBeUndefined()
  expect(conn.endpointPath).toBeUndefined()
  expect(conn.upstreamProtocol).toBeUndefined()
  expect(conn.level).toBeUndefined()
  expect(conn.whitelist).toBeUndefined()
  expect(conn.healthCheck).toBeUndefined()
})

test('readProviderConnection ignores a non-numeric level', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', level: 'high' }))
  const conn = await readProviderConnection(dir)
  expect(conn.level).toBeUndefined()
})

test('readProviderConnection ignores a whitelist with a non-string entry', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', whitelist: ['claude-*', 42] }))
  const conn = await readProviderConnection(dir)
  expect(conn.whitelist).toBeUndefined()
})

test('readProviderConnection ignores a non-boolean healthCheck', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', healthCheck: 'yes' }))
  const conn = await readProviderConnection(dir)
  expect(conn.healthCheck).toBeUndefined()
})
