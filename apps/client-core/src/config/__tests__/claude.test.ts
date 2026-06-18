import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { syncItemToClaude } from '../claude'
import type { MCPItem, ProviderItem, SkillItem } from '@aas/types'

let aasHome: string
let claudeDir: string

const publisher = { id: 'p1', slug: 'test', name: 'Test', avatarUrl: '', tier: 'community' as const }
const baseItem = {
  id: 'i1', name: 'Test', description: '', readmeUrl: '', icon: '',
  version: '1.0.0', publisher, compatibleWith: ['claude' as const], tags: [],
  downloads: 0, rating: 0, status: 'published' as const, createdAt: '', updatedAt: '',
  installHook: { steps: [] },
}

const mcpManifest: MCPItem = {
  ...baseItem, slug: 'test-mcp', category: 'mcp',
  transport: 'stdio', serverCommand: './server',
  configSchema: {},
}

const providerManifest: ProviderItem = {
  ...baseItem, slug: 'test-provider', category: 'provider',
  configSchema: {}, supportedModels: ['gpt-4o'],
}

const skillManifest: SkillItem = {
  ...baseItem, slug: 'test-skill', category: 'skill', contentUrl: '',
}

async function setupItem(category: string, slug: string, manifest: object, config?: object) {
  const dir = join(aasHome, `${category}s`, slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest))
  if (config !== undefined) {
    await writeFile(join(dir, 'config.json'), JSON.stringify(config))
  }
}

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-test-home-')
  claudeDir = await mkdtemp('/tmp/aas-test-claude-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
  await rm(claudeDir, { recursive: true, force: true })
})

test('mcp add writes mcpServers entry with absolute command path', async () => {
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToClaude('test-mcp', 'mcp', aasHome, claudeDir, 'add')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  const entry = settings.mcpServers['test-mcp']
  expect(entry).toBeDefined()
  expect(entry.command).toBe(join(aasHome, 'mcps', 'test-mcp', 'server'))
  expect(entry.args).toEqual([])
})

test('mcp remove deletes mcpServers entry', async () => {
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToClaude('test-mcp', 'mcp', aasHome, claudeDir, 'add')
  await syncItemToClaude('test-mcp', 'mcp', aasHome, claudeDir, 'remove')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.mcpServers?.['test-mcp']).toBeUndefined()
})

test('provider add writes providers entry with config values', async () => {
  await setupItem('provider', 'test-provider', providerManifest, { apiKey: 'sk-123' })
  await syncItemToClaude('test-provider', 'provider', aasHome, claudeDir, 'add')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.providers['test-provider'].apiKey).toBe('sk-123')
})

test('provider remove deletes providers entry', async () => {
  await setupItem('provider', 'test-provider', providerManifest, {})
  await syncItemToClaude('test-provider', 'provider', aasHome, claudeDir, 'add')
  await syncItemToClaude('test-provider', 'provider', aasHome, claudeDir, 'remove')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.providers?.['test-provider']).toBeUndefined()
})

test('skill add copies skill.md to claudeDir/skills/', async () => {
  const dir = join(aasHome, 'skills', 'test-skill')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'skill.md'), '# Test Skill')
  await syncItemToClaude('test-skill', 'skill', aasHome, claudeDir, 'add')
  const content = await readFile(join(claudeDir, 'skills', 'test-skill.md'), 'utf-8')
  expect(content).toBe('# Test Skill')
})

test('skill remove deletes skill file', async () => {
  const dir = join(aasHome, 'skills', 'test-skill')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'skill.md'), '# Test Skill')
  await syncItemToClaude('test-skill', 'skill', aasHome, claudeDir, 'add')
  await syncItemToClaude('test-skill', 'skill', aasHome, claudeDir, 'remove')
  await expect(readFile(join(claudeDir, 'skills', 'test-skill.md'), 'utf-8')).rejects.toThrow()
})

test('skill remove does not throw if file absent', async () => {
  await expect(
    syncItemToClaude('test-skill', 'skill', aasHome, claudeDir, 'remove')
  ).resolves.toBeUndefined()
})

test('mcp add preserves existing settings keys', async () => {
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({ model: 'claude-sonnet-4-6' }))
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncItemToClaude('test-mcp', 'mcp', aasHome, claudeDir, 'add')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.model).toBe('claude-sonnet-4-6')
  expect(settings.mcpServers['test-mcp']).toBeDefined()
})
