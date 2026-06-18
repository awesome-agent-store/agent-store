import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import yaml from 'js-yaml'
import { syncItemToCodex } from '../codex'
import type { MCPItem, ProviderItem } from '@aas/types'

let aasHome: string
let codexDir: string

const publisher = { id: 'p1', slug: 'test', name: 'Test', avatarUrl: '', tier: 'community' as const }
const baseItem = {
  id: 'i1', name: 'Test', description: '', readmeUrl: '', icon: '',
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
  aasHome = await mkdtemp('/tmp/aas-test-home-')
  codexDir = await mkdtemp('/tmp/aas-test-codex-')
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
  return yaml.load(await readFile(join(dir, 'config.yaml'), 'utf-8')) as Record<string, unknown>
}

test('mcp add writes mcpServers to config.yaml', async () => {
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'add')
  const config = await readConfig(codexDir)
  const entry = (config.mcpServers as Record<string, unknown>)['test-mcp'] as { command: string }
  expect(entry.command).toBe(join(aasHome, 'mcps', 'test-mcp', 'server'))
})

test('mcp remove deletes mcpServers entry', async () => {
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'add')
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'remove')
  const config = await readConfig(codexDir)
  expect((config.mcpServers as Record<string, unknown>)?.['test-mcp']).toBeUndefined()
})

test('provider add writes providers to config.yaml', async () => {
  await setupItem('provider', 'test-provider', providerManifest, { apiKey: 'key-1' })
  await syncItemToCodex('test-provider', 'provider', aasHome, codexDir, 'add')
  const config = await readConfig(codexDir)
  const prov = (config.providers as Record<string, unknown>)['test-provider'] as { apiKey: string }
  expect(prov.apiKey).toBe('key-1')
})

test('skill add copies skill.md to codexDir/skills/', async () => {
  const dir = join(aasHome, 'skills', 'test-skill')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'skill.md'), '# Skill')
  await syncItemToCodex('test-skill', 'skill', aasHome, codexDir, 'add')
  const content = await readFile(join(codexDir, 'skills', 'test-skill.md'), 'utf-8')
  expect(content).toBe('# Skill')
})

test('mcp add preserves existing config.yaml keys', async () => {
  await writeFile(join(codexDir, 'config.yaml'), yaml.dump({ model: 'codex-mini' }))
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToCodex('test-mcp', 'mcp', aasHome, codexDir, 'add')
  const config = await readConfig(codexDir)
  expect(config.model).toBe('codex-mini')
  expect((config.mcpServers as Record<string, unknown>)['test-mcp']).toBeDefined()
})
