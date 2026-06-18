import { readFile, writeFile, mkdir, copyFile, unlink } from 'fs/promises'
import { join } from 'path'
import type { MCPItem } from '@aas/types'

const CATEGORY_DIR: Record<string, string> = {
  provider: 'providers',
  skill: 'skills',
  mcp: 'mcps',
}

function resolveServerCmd(serverCommand: string, itemDir: string): { command: string; args: string[] } {
  const parts = serverCommand.split(' ')
  const cmd = parts[0]
  const resolvedCmd = cmd.startsWith('./') ? join(itemDir, cmd.slice(2)) : cmd
  return { command: resolvedCmd, args: parts.slice(1) }
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
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as MCPItem
    const mcpServers = (settings['mcpServers'] ?? {}) as Record<string, unknown>
    if (action === 'add') {
      const { command, args } = resolveServerCmd(manifest.serverCommand, dir)
      mcpServers[slug] = { command, args }
    } else {
      delete mcpServers[slug]
    }
    settings['mcpServers'] = mcpServers
    await writeSettings(claudeConfigDir, settings)
  } else if (category === 'skill') {
    const skillsDir = join(claudeConfigDir, 'skills')
    const destPath = join(skillsDir, `${slug}.md`)
    if (action === 'add') {
      await mkdir(skillsDir, { recursive: true })
      await copyFile(join(dir, 'skill.md'), destPath)
    } else {
      try { await unlink(destPath) } catch { /* already absent */ }
    }
  } else if (category === 'provider') {
    let config: Record<string, unknown> = {}
    try {
      config = JSON.parse(await readFile(join(dir, 'config.json'), 'utf-8')) as Record<string, unknown>
    } catch { /* no config yet */ }
    const providers = (settings['providers'] ?? {}) as Record<string, unknown>
    if (action === 'add') {
      providers[slug] = config
    } else {
      delete providers[slug]
    }
    settings['providers'] = providers
    await writeSettings(claudeConfigDir, settings)
  }
}
