import { readFile, writeFile, mkdir, copyFile, rm } from 'fs/promises'
import { join } from 'path'
import type { MCPItem } from '@as/types'
import { buildLegacyMcpServerConfig, type McpServerConfig } from './mcp'
import { readProviderConnection } from './provider'
import { readRelayState, writeRelayState, clearRelayState } from '../relay/relay-state'
import { RELAY_PORT } from '../relay/server'

const CATEGORY_DIR: Record<string, string> = {
  provider: 'providers',
  skill: 'skills',
  mcp: 'mcps',
}

export const RELAY_AUTH_TOKEN_SENTINEL = 'aas-relay'

interface ClaudeRelayState {
  originalBaseUrl: string | null
  originalAuthToken: string | null
}

async function readSettings(claudeConfigDir: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(join(claudeConfigDir, 'settings.json'), 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeSettings(claudeConfigDir: string, settings: Record<string, unknown>): Promise<void> {
  await mkdir(claudeConfigDir, { recursive: true })
  await writeFile(join(claudeConfigDir, 'settings.json'), JSON.stringify(settings, null, 2))
}

export async function upsertClaudeMcpServer(
  claudeConfigDir: string,
  slug: string,
  entry: McpServerConfig
): Promise<void> {
  const settings = await readSettings(claudeConfigDir)
  const mcpServers = (settings['mcpServers'] ?? {}) as Record<string, unknown>
  mcpServers[slug] = entry
  settings['mcpServers'] = mcpServers
  await writeSettings(claudeConfigDir, settings)
}

export async function removeClaudeMcpServer(claudeConfigDir: string, slug: string): Promise<void> {
  const settings = await readSettings(claudeConfigDir)
  const mcpServers = (settings['mcpServers'] ?? {}) as Record<string, unknown>
  delete mcpServers[slug]
  if (Object.keys(mcpServers).length > 0) settings['mcpServers'] = mcpServers
  else delete settings['mcpServers']
  await writeSettings(claudeConfigDir, settings)
}

export async function syncItemToClaude(
  slug: string,
  category: 'provider' | 'skill' | 'mcp',
  aasHome: string,
  claudeConfigDir: string,
  action: 'add' | 'remove'
): Promise<void> {
  const dir = join(aasHome, CATEGORY_DIR[category], slug)
  const settings = await readSettings(claudeConfigDir)

  if (category === 'mcp') {
    if (action === 'add') {
      const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as MCPItem
      await upsertClaudeMcpServer(claudeConfigDir, slug, buildLegacyMcpServerConfig(manifest, dir))
    } else {
      await removeClaudeMcpServer(claudeConfigDir, slug)
    }
  } else if (category === 'skill') {
    // Claude Code discovers skills as directories: skills/<name>/SKILL.md
    const skillDir = join(claudeConfigDir, 'skills', slug)
    if (action === 'add') {
      await mkdir(skillDir, { recursive: true })
      await copyFile(join(dir, 'skill.md'), join(skillDir, 'SKILL.md'))
    } else {
      try { await rm(skillDir, { recursive: true, force: true }) } catch { /* already absent */ }
    }
  } else if (category === 'provider') {
    if (action === 'add') {
      const connection = await readProviderConnection(dir)
      if (connection.apiKey) {
        const env = (settings['env'] ?? {}) as Record<string, unknown>
        env['ANTHROPIC_AUTH_TOKEN'] = connection.apiKey
        if (connection.baseUrl) env['ANTHROPIC_BASE_URL'] = connection.baseUrl
        settings['env'] = env
      }
    } else {
      const env = (settings['env'] ?? {}) as Record<string, unknown>
      delete env['ANTHROPIC_AUTH_TOKEN']
      delete env['ANTHROPIC_BASE_URL']
      if (Object.keys(env).length > 0) settings['env'] = env
      else delete settings['env']
    }
    await writeSettings(claudeConfigDir, settings)
  }
}

export async function enableRelayForClaude(aasHome: string, claudeConfigDir: string): Promise<void> {
  const settings = await readSettings(claudeConfigDir)
  const env = (settings['env'] ?? {}) as Record<string, unknown>

  const existingSnapshot = await readRelayState<ClaudeRelayState>(aasHome, 'claude')
  if (!existingSnapshot) {
    await writeRelayState<ClaudeRelayState>(aasHome, 'claude', {
      originalBaseUrl: typeof env['ANTHROPIC_BASE_URL'] === 'string' ? env['ANTHROPIC_BASE_URL'] : null,
      originalAuthToken: typeof env['ANTHROPIC_AUTH_TOKEN'] === 'string' ? env['ANTHROPIC_AUTH_TOKEN'] : null,
    })
  }

  env['ANTHROPIC_BASE_URL'] = `http://127.0.0.1:${RELAY_PORT}`
  env['ANTHROPIC_AUTH_TOKEN'] = RELAY_AUTH_TOKEN_SENTINEL
  settings['env'] = env
  await writeSettings(claudeConfigDir, settings)
}

export async function disableRelayForClaude(aasHome: string, claudeConfigDir: string): Promise<void> {
  const snapshot = await readRelayState<ClaudeRelayState>(aasHome, 'claude')
  const settings = await readSettings(claudeConfigDir)
  const env = (settings['env'] ?? {}) as Record<string, unknown>

  if (snapshot?.originalBaseUrl != null) env['ANTHROPIC_BASE_URL'] = snapshot.originalBaseUrl
  else delete env['ANTHROPIC_BASE_URL']

  if (snapshot?.originalAuthToken != null) env['ANTHROPIC_AUTH_TOKEN'] = snapshot.originalAuthToken
  else delete env['ANTHROPIC_AUTH_TOKEN']

  if (Object.keys(env).length > 0) settings['env'] = env
  else delete settings['env']

  await writeSettings(claudeConfigDir, settings)
  await clearRelayState(aasHome, 'claude')
}
