import { readFile, writeFile, mkdir, copyFile, unlink } from 'fs/promises'
import { join } from 'path'
import yaml from 'js-yaml'
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

async function readConfig(codexConfigDir: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(join(codexConfigDir, 'config.yaml'), 'utf-8')
    return (yaml.load(raw) as Record<string, unknown>) ?? {}
  } catch {
    return {}
  }
}

async function writeConfig(codexConfigDir: string, config: Record<string, unknown>): Promise<void> {
  await mkdir(codexConfigDir, { recursive: true })
  await writeFile(join(codexConfigDir, 'config.yaml'), yaml.dump(config))
}

export async function syncItemToCodex(
  slug: string,
  category: 'provider' | 'skill' | 'mcp',
  aasHome: string,
  codexConfigDir: string,
  action: 'add' | 'remove'
): Promise<void> {
  const dir = join(aasHome, CATEGORY_DIR[category], slug)
  const config = await readConfig(codexConfigDir)

  if (category === 'mcp') {
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as MCPItem
    const mcpServers = (config['mcpServers'] ?? {}) as Record<string, unknown>
    if (action === 'add') {
      const { command, args } = resolveServerCmd(manifest.serverCommand, dir)
      mcpServers[slug] = { command, args }
    } else {
      delete mcpServers[slug]
    }
    config['mcpServers'] = mcpServers
    await writeConfig(codexConfigDir, config)
  } else if (category === 'skill') {
    const skillsDir = join(codexConfigDir, 'skills')
    const destPath = join(skillsDir, `${slug}.md`)
    if (action === 'add') {
      await mkdir(skillsDir, { recursive: true })
      await copyFile(join(dir, 'skill.md'), destPath)
    } else {
      try { await unlink(destPath) } catch { /* already absent */ }
    }
  } else if (category === 'provider') {
    let itemConfig: Record<string, unknown> = {}
    try {
      itemConfig = JSON.parse(await readFile(join(dir, 'config.json'), 'utf-8')) as Record<string, unknown>
    } catch { /* no config yet */ }
    const providers = (config['providers'] ?? {}) as Record<string, unknown>
    if (action === 'add') {
      providers[slug] = itemConfig
    } else {
      delete providers[slug]
    }
    config['providers'] = providers
    await writeConfig(codexConfigDir, config)
  }
}
