import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { LocalRelayConfig, ToolTarget } from '@aas/types'
import { RELAY_PORT } from './server'

const CONFIG_FILE = 'relay-configs.json'
const DEFAULT_ENABLED_FOR: Partial<Record<ToolTarget, boolean>> = { claude: true, codex: true }
const SEED_CONFIG: LocalRelayConfig = {
  id: 'default',
  name: '默认',
  port: RELAY_PORT,
  enabled: true,
  enabledFor: DEFAULT_ENABLED_FOR,
}

async function readConfigs(aasHome: string): Promise<LocalRelayConfig[]> {
  try {
    const raw = await readFile(join(aasHome, CONFIG_FILE), 'utf-8')
    const parsed = JSON.parse(raw) as LocalRelayConfig[]
    const withDefaults = parsed.map((c) => ({ ...c, enabledFor: c.enabledFor ?? DEFAULT_ENABLED_FOR }))
    return withDefaults.length > 0 ? withDefaults : [SEED_CONFIG]
  } catch {
    return [SEED_CONFIG]
  }
}

async function writeConfigs(aasHome: string, configs: LocalRelayConfig[]): Promise<void> {
  await mkdir(aasHome, { recursive: true })
  await writeFile(join(aasHome, CONFIG_FILE), JSON.stringify(configs, null, 2))
}

export async function listLocalConfigs(aasHome: string): Promise<LocalRelayConfig[]> {
  return readConfigs(aasHome)
}

export async function addLocalConfig(aasHome: string, name: string): Promise<LocalRelayConfig> {
  const configs = await readConfigs(aasHome)
  const usedPorts = new Set(configs.map((c) => c.port))
  let port = SEED_CONFIG.port
  while (usedPorts.has(port)) port += 100
  const config: LocalRelayConfig = { id: crypto.randomUUID(), name, port, enabled: true, enabledFor: DEFAULT_ENABLED_FOR }
  await writeConfigs(aasHome, [...configs, config])
  return config
}

export async function removeLocalConfig(aasHome: string, id: string): Promise<void> {
  const configs = await readConfigs(aasHome)
  if (configs.length <= 1) {
    throw new Error('Cannot remove the last local relay configuration')
  }
  const next = configs.filter((c) => c.id !== id)
  if (next.length === configs.length) {
    throw new Error(`Local relay configuration not found: ${id}`)
  }
  await writeConfigs(aasHome, next)
}

export async function updateLocalConfig(
  aasHome: string,
  id: string,
  patch: { name?: string; port?: number; enabledFor?: Partial<Record<ToolTarget, boolean>> }
): Promise<LocalRelayConfig> {
  const configs = await readConfigs(aasHome)
  const index = configs.findIndex((c) => c.id === id)
  if (index === -1) throw new Error(`Local relay configuration not found: ${id}`)
  const updated: LocalRelayConfig = {
    ...configs[index]!,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.port !== undefined ? { port: patch.port } : {}),
    ...(patch.enabledFor !== undefined ? { enabledFor: { ...configs[index]!.enabledFor, ...patch.enabledFor } } : {}),
  }
  const next = [...configs]
  next[index] = updated
  await writeConfigs(aasHome, next)
  return updated
}

export async function setLocalConfigEnabled(
  aasHome: string,
  id: string,
  enabled: boolean
): Promise<LocalRelayConfig> {
  const configs = await readConfigs(aasHome)
  const index = configs.findIndex((c) => c.id === id)
  if (index === -1) throw new Error(`Local relay configuration not found: ${id}`)
  const updated: LocalRelayConfig = { ...configs[index]!, enabled }
  const next = [...configs]
  next[index] = updated
  await writeConfigs(aasHome, next)
  return updated
}

export async function toggleLocalConfig(aasHome: string, id: string): Promise<LocalRelayConfig> {
  const configs = await readConfigs(aasHome)
  const current = configs.find((c) => c.id === id)
  if (!current) throw new Error(`Local relay configuration not found: ${id}`)
  return setLocalConfigEnabled(aasHome, id, !current.enabled)
}
