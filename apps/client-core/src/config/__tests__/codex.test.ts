import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { syncItemToCodex } from '../codex'
import type { MCPItem, ProviderItem } from '@as/types'
import { parse } from '@iarna/toml'

let aasHome: string
let codexDir: string

const publisher = { id: 'p1', slug: 'test', name: 'Test', avatarUrl: '', tier: 'community' as const }
const baseItem = {
  id: 'i1', name: 'Test', description: '',
  version: '1.0.0', publisher, compatibleWith: ['codex' as const], tags: [],
  downloads: 0, rating: 0, status: 'published' as const, createdAt: '', updatedAt: '',
  installHook: { steps: [] },
}

const mcpManifest: MCPItem = {
  ...baseItem, slug: 'test-mcp', category: 'mcp',
  transport: 'stdio', serverCommand: './server', configSchema: {},
}

const providerManifest: ProviderItem = {
  ...baseItem, slug: 'test-provider', category: 'provider',
  configSchema: {}, supportedModels: [],
}

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-test-home-')
  codexDir = await mkdtemp('/tmp/as-test-codex-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
  await rm(codexDir, { recursive: true, force: true })
})

async function setupItem(category: string, slug: string, manifest: object, config?: object) {
  const dir = join(aasHome, `${category}s`, slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest))
  if (config !== undefined) {
    await writeFile(join(dir, 'config.json'), JSON.stringify(config))
  }
}

async function readConfig(dir: string): Promise<Record<string, unknown>> {
  return parse(await readFile(join(dir, 'config.toml'), 'utf-8')) as unknown as Record<string, unknown>
}

test('mcp add writes mcpServers to codex config', async () => {
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'add')
  const config = await readConfig(codexDir)
  const entry = (config.mcp_servers as Record<string, unknown>)['test-mcp'] as { command: string; type: string }
  expect(entry.command).toBe(join(aasHome, 'mcps', 'test-mcp', 'server'))
  expect(entry.type).toBe('stdio')
})

test('mcp remove deletes mcpServers entry', async () => {
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'add')
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'remove')
  const config = await readConfig(codexDir)
  expect((config.mcp_servers as Record<string, unknown>)?.['test-mcp']).toBeUndefined()
})

test('provider add writes providers to codex config', async () => {
  await setupItem('provider', 'test-provider', providerManifest, {
    apiKey: 'key-1',
    baseUrl: 'https://api.example.com/v1',
  })
  await syncItemToCodex('test-provider', 'provider', aasHome, codexDir, 'add')
  const config = await readConfig(codexDir)
  expect(config.model_provider).toBe('test-provider')
  expect(config.preferred_auth_method).toBe('apikey')
  const prov = (config.model_providers as Record<string, unknown>)['test-provider'] as Record<string, unknown>
  expect(prov.base_url).toBe('https://api.example.com/v1')
  expect(prov.wire_api).toBe('responses')
  const auth = JSON.parse(await readFile(join(codexDir, 'auth.json'), 'utf-8'))
  expect(auth.OPENAI_API_KEY).toBe('key-1')
})

test('provider remove deletes direct-apply codex settings', async () => {
  await setupItem('provider', 'test-provider', providerManifest, {
    apiKey: 'key-1',
    baseUrl: 'https://api.example.com/v1',
  })
  await syncItemToCodex('test-provider', 'provider', aasHome, codexDir, 'add')
  await syncItemToCodex('test-provider', 'provider', aasHome, codexDir, 'remove')
  const config = await readConfig(codexDir)
  expect(config.model_provider).toBeUndefined()
  expect(config.preferred_auth_method).toBeUndefined()
  expect(config.model_providers).toBeUndefined()
  await expect(readFile(join(codexDir, 'auth.json'), 'utf-8')).rejects.toThrow()
})

test('skill add copies skill.md to codexDir/skills/<name>/SKILL.md', async () => {
  const dir = join(aasHome, 'skills', 'test-skill')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'skill.md'), '# Skill')
  await syncItemToCodex('test-skill', 'skill', aasHome, codexDir, 'add')
  const content = await readFile(join(codexDir, 'skills', 'test-skill', 'SKILL.md'), 'utf-8')
  expect(content).toBe('# Skill')
})

test('mcp remove works even when item directory does not exist', async () => {
  // First add the entry, then simulate the directory being deleted already
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'add')
  // Remove the item directory to simulate post-uninstall state
  await rm(join(aasHome, 'mcps', 'test-mcp'), { recursive: true, force: true })
  // Remove should succeed without ENOENT
  await expect(
    syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'remove')
  ).resolves.toBeUndefined()
  const config = await readConfig(codexDir)
  expect((config.mcp_servers as Record<string, unknown>)?.['test-mcp']).toBeUndefined()
})

test('mcp add preserves existing config keys', async () => {
  await writeFile(join(codexDir, 'config.toml'), 'model = "codex-mini"\n')
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'add')
  const config = await readConfig(codexDir)
  expect(config.model).toBe('codex-mini')
  expect((config.mcp_servers as Record<string, unknown>)['test-mcp']).toBeDefined()
})

test('mcp add migrates legacy camelCase mcpServers into mcp_servers', async () => {
  await writeFile(
    join(codexDir, 'config.toml'),
    '[mcpServers.legacy]\ncommand = "keep"\n'
  )
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'add')
  const config = await readConfig(codexDir)
  expect((config.mcp_servers as Record<string, unknown>).legacy).toBeDefined()
  expect((config.mcp_servers as Record<string, unknown>)['test-mcp']).toBeDefined()
  expect(config.mcpServers).toBeUndefined()
})

test('provider add preserves existing config.toml keys', async () => {
  await writeFile(join(codexDir, 'config.toml'), 'model = "gpt-5-codex"\n')
  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ EXISTING_KEY: 'keep-me' }))
  await setupItem('provider', 'test-provider', providerManifest, {
    apiKey: 'key-1',
    baseUrl: 'https://api.example.com/v1',
  })
  await syncItemToCodex('test-provider', 'provider', aasHome, codexDir, 'add')
  const config = await readConfig(codexDir)
  expect(config.model).toBe('gpt-5-codex')
  const auth = JSON.parse(await readFile(join(codexDir, 'auth.json'), 'utf-8'))
  expect(auth.EXISTING_KEY).toBe('keep-me')
  expect(auth.OPENAI_API_KEY).toBe('key-1')
})

test('provider add migrates existing config.yaml content into config.toml', async () => {
  await writeFile(join(codexDir, 'config.yaml'), 'model: yaml-model\nmcp_servers:\n  existing:\n    command: keep\n')
  await setupItem('provider', 'test-provider', providerManifest, {
    apiKey: 'key-1',
    baseUrl: 'https://api.example.com/v1',
  })

  await syncItemToCodex('test-provider', 'provider', aasHome, codexDir, 'add')

  const config = await readConfig(codexDir)
  expect(config.model).toBe('yaml-model')
  expect((config.mcp_servers as Record<string, unknown>).existing).toBeDefined()
  expect(config.model_provider).toBe('test-provider')
})

test('provider remove keeps shared auth when removing an inactive provider', async () => {
  await writeFile(
    join(codexDir, 'config.toml'),
    'model_provider = "other-provider"\npreferred_auth_method = "apikey"\n' +
      '[model_providers.test-provider]\n' +
      'name = "test-provider"\n' +
      'base_url = "https://api.example.com/v1"\n' +
      'wire_api = "responses"\n' +
      'requires_openai_auth = false\n' +
      '[model_providers.other-provider]\n' +
      'name = "other-provider"\n' +
      'base_url = "https://api.other.example/v1"\n' +
      'wire_api = "responses"\n' +
      'requires_openai_auth = false\n'
  )
  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'shared-key' }))
  await setupItem('provider', 'test-provider', providerManifest, {
    apiKey: 'key-1',
    baseUrl: 'https://api.example.com/v1',
  })

  await syncItemToCodex('test-provider', 'provider', aasHome, codexDir, 'remove')

  const config = await readConfig(codexDir)
  expect(config.model_provider).toBe('other-provider')
  expect(config.preferred_auth_method).toBe('apikey')
  expect((config.model_providers as Record<string, unknown>)['test-provider']).toBeUndefined()
  expect((config.model_providers as Record<string, unknown>)['other-provider']).toBeDefined()

  const auth = JSON.parse(await readFile(join(codexDir, 'auth.json'), 'utf-8'))
  expect(auth.OPENAI_API_KEY).toBe('shared-key')
})
