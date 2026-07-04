import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { AASEngineImpl } from '../engine'
import type { MCPItem, ProviderItem, SkillItem } from '@aas/types'

const publisher = { id: 'p1', slug: 'pub', name: 'Pub', avatarUrl: '', tier: 'community' as const }
const baseItem = {
  id: 'i1', name: 'Test', description: 'desc', readmeUrl: 'https://r.com', icon: 'https://i.com',
  version: '1.0.0', publisher, compatibleWith: ['claude' as const, 'codex' as const],
  tags: [], downloads: 0, rating: 0, status: 'published' as const,
  createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  installHook: { steps: [] },
}

const mcpItem: MCPItem = {
  ...baseItem, slug: 'test-mcp', category: 'mcp',
  transport: 'stdio', serverCommand: './server', configSchema: { type: 'object' },
}

const remoteMcpItem: MCPItem = {
  ...baseItem, slug: 'remote-mcp', category: 'mcp',
  transport: 'http', url: 'https://mcp.example.com', headers: { Authorization: 'Bearer token' },
  configSchema: { type: 'object' },
}

const providerItem: ProviderItem = {
  ...baseItem, slug: 'test-provider', category: 'provider',
  configSchema: { type: 'object', properties: { apiKey: { type: 'string' } } },
  supportedModels: ['gpt-4o'],
}

const skillItem: SkillItem = {
  ...baseItem, slug: 'test-skill', category: 'skill', contentUrl: 'https://s.com',
  installHook: { steps: [] },
}

let aasHome: string
let claudeDir: string
let codexDir: string
let engine: AASEngineImpl
const origFetch = globalThis.fetch

function mockFetch(items: Record<string, unknown>) {
  globalThis.fetch = (async (url: string) => {
    const u = String(url)
    for (const [pattern, body] of Object.entries(items)) {
      if (u.includes(pattern)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    throw new Error(`Unmocked URL: ${u}`)
  }) as typeof fetch
}

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-test-home-')
  claudeDir = await mkdtemp('/tmp/aas-test-claude-')
  codexDir = await mkdtemp('/tmp/aas-test-codex-')
  engine = new AASEngineImpl(
    { aasHome, claudeConfigDir: claudeDir, codexConfigDir: codexDir },
    'http://localhost:3000'
  )
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(aasHome, { recursive: true, force: true })
  await rm(claudeDir, { recursive: true, force: true })
  await rm(codexDir, { recursive: true, force: true })
})

test('install mcp: creates item dir, manifest, registry entry', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  const result = await engine.install('test-mcp')
  expect(result.slug).toBe('test-mcp')
  expect(result.version).toBe('1.0.0')
  const manifest = JSON.parse(
    await readFile(join(aasHome, 'mcps', 'test-mcp', 'manifest.json'), 'utf-8')
  )
  expect(manifest.slug).toBe('test-mcp')
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].slug).toBe('test-mcp')
  expect(reg.installed[0].enabledFor).toEqual({})
})

test('install throws when market returns error', async () => {
  mockFetch({ '/api/items/unknown': { error: 'not found' } })
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'not found' }), { status: 404 })) as unknown as typeof fetch
  await expect(engine.install('unknown')).rejects.toThrow()
})

test('enable mcp: writes mcpServers to claude settings', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.enable('test-mcp', 'claude')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.mcpServers?.['test-mcp']).toBeDefined()
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].enabledFor.claude).toBe(true)
})

test('enable mcp: writes mcp server to codex config', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.enable('test-mcp', 'codex')
  const config = await readFile(join(codexDir, 'config.toml'), 'utf-8')
  expect(config).toContain('[mcp_servers.test-mcp]')
  expect(config).toContain('type = "stdio"')
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].enabledFor.codex).toBe(true)
})

test('enable remote mcp: writes remote entry to claude and codex configs', async () => {
  mockFetch({ '/api/items/remote-mcp': { item: remoteMcpItem } })
  await engine.install('remote-mcp')
  await engine.enable('remote-mcp', 'claude')
  await engine.enable('remote-mcp', 'codex')

  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.mcpServers?.['remote-mcp']).toEqual({
    type: 'http',
    url: 'https://mcp.example.com',
    headers: { Authorization: 'Bearer token' },
  })

  const config = await readFile(join(codexDir, 'config.toml'), 'utf-8')
  expect(config).toContain('[mcp_servers.remote-mcp]')
  expect(config).toContain('type = "http"')
  expect(config).toContain('url = "https://mcp.example.com"')
})

test('disable mcp: removes mcpServers entry and sets enabledFor false', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.enable('test-mcp', 'claude')
  await engine.disable('test-mcp', 'claude')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.mcpServers?.['test-mcp']).toBeUndefined()
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].enabledFor.claude).toBe(false)
})

test('uninstall: removes item dir and registry entry', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.uninstall('test-mcp')
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed).toHaveLength(0)
  const { access } = await import('fs/promises')
  await expect(access(join(aasHome, 'mcps', 'test-mcp'))).rejects.toThrow()
})

test('list returns all installed items', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  const items = await engine.list()
  expect(items).toHaveLength(1)
  expect(items[0].slug).toBe('test-mcp')
})

test('list filters by category', async () => {
  mockFetch({
    '/api/items/test-mcp': { item: mcpItem },
    '/api/items/test-provider': { item: providerItem },
  })
  await engine.install('test-mcp')
  await engine.install('test-provider')
  const mcps = await engine.list({ category: 'mcp' })
  expect(mcps).toHaveLength(1)
  expect(mcps[0].slug).toBe('test-mcp')
})

test('info returns ItemDetail with manifest data', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  const detail = await engine.info('test-mcp')
  expect(detail.slug).toBe('test-mcp')
  expect(detail.name).toBe('Test')
  expect(detail.serverCommand).toBe('./server')
})

test('info returns remote MCP detail fields', async () => {
  mockFetch({ '/api/items/remote-mcp': { item: remoteMcpItem } })
  await engine.install('remote-mcp')
  const detail = await engine.info('remote-mcp')
  expect(detail.slug).toBe('remote-mcp')
  expect(detail.transport).toBe('http')
  expect(detail.url).toBe('https://mcp.example.com')
  expect(detail.headers).toEqual({ Authorization: 'Bearer token' })
  expect(detail.serverCommand).toBeUndefined()
})

test('getConfigSchema returns schema and current values', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  await engine.setConfig('test-provider', { apiKey: 'sk-test' })
  const { schema, current } = await engine.getConfigSchema('test-provider')
  expect(schema).toEqual(providerItem.configSchema)
  expect(current.apiKey).toBe('sk-test')
})

test('setConfig writes config.json', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  await engine.setConfig('test-provider', { apiKey: 'sk-test' })
  const config = JSON.parse(
    await readFile(join(aasHome, 'providers', 'test-provider', 'config.json'), 'utf-8')
  )
  expect(config.apiKey).toBe('sk-test')
})

test('enabling a second provider for the same target does not disable the first', async () => {
  const secondProviderItem: ProviderItem = {
    ...providerItem,
    slug: 'test-provider-2',
    name: 'Second Provider',
  }
  mockFetch({
    '/api/items/test-provider': { item: providerItem },
    '/api/items/test-provider-2': { item: secondProviderItem },
  })
  await engine.install('test-provider')
  await engine.install('test-provider-2')
  await engine.setConfig('test-provider', {
    apiKey: 'sk-1',
    baseUrl: 'https://api.one.example/v1',
  })
  await engine.setConfig('test-provider-2', {
    apiKey: 'sk-2',
    baseUrl: 'https://api.two.example/v1',
  })

  await engine.enable('test-provider', 'claude')
  await engine.enable('test-provider-2', 'claude')

  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('aas-relay')
  expect(settings.env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:18780')

  const list = await engine.list()
  const first = list.find(item => item.slug === 'test-provider')
  const second = list.find(item => item.slug === 'test-provider-2')
  expect(first?.enabledFor.claude).toBe(true)
  expect(second?.enabledFor.claude).toBe(true)
})

test('list and info report enabledFor from the registry without needing config-file reconciliation', async () => {
  const secondProviderItem: ProviderItem = {
    ...providerItem,
    slug: 'test-provider-2',
    name: 'Second Provider',
    compatibleWith: ['codex'],
  }
  const firstCodexProvider: ProviderItem = {
    ...providerItem,
    compatibleWith: ['codex'],
  }
  mockFetch({
    '/api/items/test-provider': { item: firstCodexProvider },
    '/api/items/test-provider-2': { item: secondProviderItem },
  })
  await engine.install('test-provider')
  await engine.install('test-provider-2')
  await engine.setConfig('test-provider', { apiKey: 'shared-key', baseUrl: 'https://api.shared.example/v1' })
  await engine.setConfig('test-provider-2', { apiKey: 'shared-key', baseUrl: 'https://api.shared.example/v1' })

  await engine.enable('test-provider', 'codex')
  await engine.enable('test-provider-2', 'codex')

  const list = await engine.list()
  const detail = await engine.info('test-provider-2')
  const other = await engine.info('test-provider')
  expect(list.find(item => item.slug === 'test-provider-2')?.enabledFor.codex).toBe(true)
  expect(list.find(item => item.slug === 'test-provider')?.enabledFor.codex).toBe(true)
  expect(detail.enabledFor.codex).toBe(true)
  expect(other.enabledFor.codex).toBe(true)
})

test('sync adds all enabled items to target configs', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.enable('test-mcp', 'claude')
  // Clear settings to verify sync rewrites
  await writeFile(join(claudeDir, 'settings.json'), '{}')
  const result = await engine.sync(['claude'])
  expect(result.errors).toHaveLength(0)
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.mcpServers?.['test-mcp']).toBeDefined()
})

test('checkUpdates returns empty when registry is empty', async () => {
  const updates = await engine.checkUpdates()
  expect(updates).toHaveLength(0)
})

test('enable throws for unknown slug', async () => {
  await expect(engine.enable('nonexistent', 'claude')).rejects.toThrow('not installed')
})

test('uninstall throws for unknown slug', async () => {
  await expect(engine.uninstall('nonexistent')).rejects.toThrow('not installed')
})

test('info throws for unknown slug', async () => {
  await expect(engine.info('nonexistent')).rejects.toThrow('not installed')
})

test('enable on a provider item points Claude at the relay instead of writing the real apiKey', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  await writeFile(
    join(aasHome, 'providers', 'test-provider', 'config.json'),
    JSON.stringify({ apiKey: 'sk-real-secret', baseUrl: 'https://real-upstream.example.com' })
  )

  await engine.enable('test-provider', 'claude')

  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8')) as Record<string, unknown>
  const env = settings['env'] as Record<string, unknown>
  expect(env['ANTHROPIC_BASE_URL']).toBe('http://127.0.0.1:18780')
  expect(env['ANTHROPIC_AUTH_TOKEN']).toBe('aas-relay')
  expect(env['ANTHROPIC_AUTH_TOKEN']).not.toBe('sk-real-secret')
})

test('disable on a provider item restores Claude settings via the relay snapshot', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  await mkdir(claudeDir, { recursive: true })
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({
    env: { ANTHROPIC_BASE_URL: 'https://pre-existing.example.com', ANTHROPIC_AUTH_TOKEN: 'pre-existing-token' },
  }))
  await writeFile(
    join(aasHome, 'providers', 'test-provider', 'config.json'),
    JSON.stringify({ apiKey: 'sk-real-secret', baseUrl: 'https://real-upstream.example.com' })
  )

  await engine.enable('test-provider', 'claude')
  await engine.disable('test-provider', 'claude')

  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8')) as Record<string, unknown>
  const env = settings['env'] as Record<string, unknown>
  expect(env['ANTHROPIC_BASE_URL']).toBe('https://pre-existing.example.com')
  expect(env['ANTHROPIC_AUTH_TOKEN']).toBe('pre-existing-token')
})

test('disabling one of two enabled providers keeps the relay connected for the survivor', async () => {
  const secondProviderItem: ProviderItem = {
    ...providerItem,
    slug: 'test-provider-2',
    name: 'Second Provider',
  }
  mockFetch({
    '/api/items/test-provider': { item: providerItem },
    '/api/items/test-provider-2': { item: secondProviderItem },
  })
  await engine.install('test-provider')
  await engine.install('test-provider-2')
  await engine.setConfig('test-provider', { apiKey: 'sk-1', baseUrl: 'https://api.one.example/v1' })
  await engine.setConfig('test-provider-2', { apiKey: 'sk-2', baseUrl: 'https://api.two.example/v1' })

  await engine.enable('test-provider', 'claude')
  await engine.enable('test-provider-2', 'claude')
  await engine.disable('test-provider', 'claude')

  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8')) as Record<string, unknown>
  const env = settings['env'] as Record<string, unknown>
  expect(env['ANTHROPIC_BASE_URL']).toBe('http://127.0.0.1:18780')
  expect(env['ANTHROPIC_AUTH_TOKEN']).toBe('aas-relay')

  const list = await engine.list()
  const first = list.find(item => item.slug === 'test-provider')
  const second = list.find(item => item.slug === 'test-provider-2')
  expect(first?.enabledFor.claude).toBe(false)
  expect(second?.enabledFor.claude).toBe(true)
})

test('uninstalling one of two enabled providers keeps the relay connected for the survivor', async () => {
  const secondProviderItem: ProviderItem = {
    ...providerItem,
    slug: 'test-provider-2',
    name: 'Second Provider',
  }
  mockFetch({
    '/api/items/test-provider': { item: providerItem },
    '/api/items/test-provider-2': { item: secondProviderItem },
  })
  await engine.install('test-provider')
  await engine.install('test-provider-2')
  await engine.setConfig('test-provider', { apiKey: 'sk-1', baseUrl: 'https://api.one.example/v1' })
  await engine.setConfig('test-provider-2', { apiKey: 'sk-2', baseUrl: 'https://api.two.example/v1' })

  await engine.enable('test-provider', 'claude')
  await engine.enable('test-provider-2', 'claude')
  await engine.uninstall('test-provider')

  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8')) as Record<string, unknown>
  const env = settings['env'] as Record<string, unknown>
  expect(env['ANTHROPIC_BASE_URL']).toBe('http://127.0.0.1:18780')
  expect(env['ANTHROPIC_AUTH_TOKEN']).toBe('aas-relay')

  const list = await engine.list()
  expect(list.find(item => item.slug === 'test-provider')).toBeUndefined()
  expect(list.find(item => item.slug === 'test-provider-2')?.enabledFor.claude).toBe(true)
})

test('enable on a provider item points Codex at the relay instead of writing the real apiKey', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  await writeFile(
    join(aasHome, 'providers', 'test-provider', 'config.json'),
    JSON.stringify({ apiKey: 'sk-real-secret', baseUrl: 'https://real-upstream.example.com' })
  )

  await engine.enable('test-provider', 'codex')

  const auth = JSON.parse(await readFile(join(codexDir, 'auth.json'), 'utf-8')) as Record<string, unknown>
  expect(auth['OPENAI_API_KEY']).toBe('aas-relay')
  expect(auth['OPENAI_API_KEY']).not.toBe('sk-real-secret')
})

test('enable/disable on a skill item is unaffected by the relay change', async () => {
  mockFetch({ '/api/items/test-skill': { item: skillItem } })
  await engine.install('test-skill')
  await writeFile(join(aasHome, 'skills', 'test-skill', 'skill.md'), '# Test Skill')
  await engine.enable('test-skill', 'claude')

  const skillContent = await readFile(join(claudeDir, 'skills', 'test-skill.md'), 'utf-8')
  expect(skillContent).toBe('# Test Skill')
  // Skills sync via file copy, not env vars — settings.json should be untouched by this enable call.
  const { access } = await import('fs/promises')
  await expect(access(join(claudeDir, 'settings.json'))).rejects.toThrow()

  await engine.disable('test-skill', 'claude')
})

// suppress unused variable warning for skillItem
void skillItem

test('duplicateProvider: copies config into a new slug and registers it disabled', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  await writeFile(
    join(aasHome, 'providers', 'test-provider', 'config.json'),
    JSON.stringify({ apiKey: 'k', baseUrl: 'https://x.com' })
  )

  const result = await engine.duplicateProvider('test-provider')
  expect(result.newSlug).toBe('test-provider-copy')

  const manifest = JSON.parse(
    await readFile(join(aasHome, 'providers', 'test-provider-copy', 'manifest.json'), 'utf-8')
  )
  expect(manifest.slug).toBe('test-provider-copy')

  const config = JSON.parse(
    await readFile(join(aasHome, 'providers', 'test-provider-copy', 'config.json'), 'utf-8')
  )
  expect(config).toEqual({ apiKey: 'k', baseUrl: 'https://x.com' })

  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  const newEntry = reg.installed.find((e: { slug: string }) => e.slug === 'test-provider-copy')
  expect(newEntry.enabledFor).toEqual({})
  expect(newEntry.category).toBe('provider')
})

test('duplicateProvider: increments the suffix when the copy slug is taken', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  await engine.duplicateProvider('test-provider')
  const second = await engine.duplicateProvider('test-provider')
  expect(second.newSlug).toBe('test-provider-copy-2')
})

test('duplicateProvider: throws for a non-provider item', async () => {
  mockFetch({ '/api/items/test-skill': { item: skillItem } })
  await engine.install('test-skill')
  await expect(engine.duplicateProvider('test-skill')).rejects.toThrow('Only providers can be duplicated')
})

test('duplicateProvider: throws when the slug is not installed', async () => {
  await expect(engine.duplicateProvider('missing')).rejects.toThrow('Item not installed')
})

test('getUsageSummary: returns rows recorded via the usage logger for this aasHome', async () => {
  const { openUsageDb } = await import('../usage/db')
  const { recordRequest } = await import('../usage/logger')
  const db = openUsageDb(aasHome)
  recordRequest(db, {
    providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.01, statusCode: 200, latencyMs: 100, isStreaming: false,
  })

  const rows = await engine.getUsageSummary()
  expect(rows).toHaveLength(1)
  expect(rows[0].providerSlug).toBe('yls')
})

test('getUsageSummary: forwards the target filter through to the query', async () => {
  const { openUsageDb } = await import('../usage/db')
  const { recordRequest } = await import('../usage/logger')
  const db = openUsageDb(aasHome)
  recordRequest(db, {
    providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.01, statusCode: 200, latencyMs: 100, isStreaming: false,
  })

  const rows = await engine.getUsageSummary({ target: 'codex' })
  expect(rows).toHaveLength(0)
})

test('parsePricingFromUrl: returns a non-empty mock pricing table', async () => {
  const pricing = await engine.parsePricingFromUrl('https://example.com/pricing')
  expect(Object.keys(pricing).length).toBeGreaterThan(0)
  for (const entry of Object.values(pricing)) {
    expect(typeof entry.input).toBe('number')
    expect(typeof entry.output).toBe('number')
  }
})
