import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type {
  AASEngine, AASPaths, InstallResult, SyncResult, UpdateAvailable, UpdateResult,
  ListOptions, InstalledItem, ItemDetail, ToolTarget, SearchOptions, Item, JsonSchema,
  UsageSummaryRow, UsageSummaryOptions, ModelPricing, RegistryJson, LocalRelayConfig,
  RecentRequestRow, RelayStatus,
} from '@aas/types'
import { AASClient } from '@aas/sdk'
import { resolvePaths, itemDir } from './paths'
import { readRegistry, writeRegistry, findEntry, upsertEntry, removeEntry } from './registry/index'
import { runHook, writeManifest } from './installer/hook-runner'
import { postInstall as providerPostInstall } from './installer/provider'
import { postInstall as skillPostInstall } from './installer/skill'
import { postInstall as mcpPostInstall } from './installer/mcp'
import { syncItemToClaude, enableRelayForClaude, disableRelayForClaude } from './config/claude'
import { syncItemToCodex, enableRelayForCodex, disableRelayForCodex } from './config/codex'
import { checkUpdates as _checkUpdates, applyUpdate } from './updater/index'
import { duplicateProviderConnection } from './config/provider'
import { getDailySummary, getRecentRequests } from './usage/queries'
import { getRelayDaemonStatus } from './relay/daemon-status'
import {
  listLocalConfigs as _listLocalConfigs, addLocalConfig as _addLocalConfig,
  removeLocalConfig as _removeLocalConfig, updateLocalConfig as _updateLocalConfig,
  toggleLocalConfig as _toggleLocalConfig,
} from './relay/local-configs'

export class AASEngineImpl implements AASEngine {
  private readonly paths: Required<AASPaths>
  private readonly client: AASClient

  constructor(pathOverrides?: Partial<AASPaths>, storeUrl?: string) {
    this.paths = resolvePaths(pathOverrides)
    this.client = new AASClient(storeUrl)
  }

  async search(query: string, options?: SearchOptions): Promise<Item[]> {
    const result = await this.client.getItems({
      q: query,
      category: options?.category,
      limit: options?.limit,
      offset: options?.offset,
    })
    if (result.error || !result.data) return []
    return result.data
  }

  async install(slug: string): Promise<InstallResult> {
    const itemResult = await this.client.getItemBySlug(slug)
    if (itemResult.error || !itemResult.data) {
      throw new Error(itemResult.error ?? `Item not found: ${slug}`)
    }
    const item = itemResult.data
    const dir = itemDir(this.paths.aasHome, item.category, slug)
    await mkdir(dir, { recursive: true })
    await runHook(item.installHook.steps, dir)
    if (item.category === 'provider') await providerPostInstall(dir)
    else if (item.category === 'skill') await skillPostInstall(dir)
    else if (item.category === 'mcp') await mcpPostInstall(dir)
    await writeManifest(dir, item)
    const registry = await readRegistry(this.paths.aasHome)
    const existing = findEntry(registry, slug)
    const now = new Date().toISOString()
    const entry: InstalledItem = {
      slug,
      category: item.category,
      version: item.version,
      installedAt: existing?.installedAt ?? now,
      updatedAt: now,
      compatibleWith: item.compatibleWith,
      enabledFor: existing?.enabledFor ?? {},
    }
    await writeRegistry(this.paths.aasHome, upsertEntry(registry, entry))
    return { slug, version: item.version, installedAt: entry.installedAt }
  }

  async uninstall(slug: string): Promise<void> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    for (const target of entry.compatibleWith) {
      if (entry.enabledFor[target]) {
        if (entry.category !== 'provider' || !this._hasOtherEnabledProvider(registry, slug, target)) {
          await this._syncToTarget(slug, entry.category, target, 'remove')
        }
      }
    }
    await rm(itemDir(this.paths.aasHome, entry.category, slug), { recursive: true, force: true })
    await writeRegistry(this.paths.aasHome, removeEntry(registry, slug))
  }

  async enable(slug: string, target: ToolTarget): Promise<void> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    await this._syncToTarget(slug, entry.category, target, 'add')
    await writeRegistry(
      this.paths.aasHome,
      upsertEntry(registry, {
        ...entry,
        enabledFor: { ...entry.enabledFor, [target]: true },
        updatedAt: new Date().toISOString(),
      })
    )
  }

  async disable(slug: string, target: ToolTarget): Promise<void> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    if (entry.category !== 'provider' || !this._hasOtherEnabledProvider(registry, slug, target)) {
      await this._syncToTarget(slug, entry.category, target, 'remove')
    }
    await writeRegistry(
      this.paths.aasHome,
      upsertEntry(registry, {
        ...entry,
        enabledFor: { ...entry.enabledFor, [target]: false },
        updatedAt: new Date().toISOString(),
      })
    )
  }

  async getConfigSchema(slug: string): Promise<{ schema: JsonSchema; current: Record<string, unknown> }> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    const dir = itemDir(this.paths.aasHome, entry.category, slug)
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as { configSchema?: JsonSchema }
    let current: Record<string, unknown> = {}
    try {
      current = JSON.parse(await readFile(join(dir, 'config.json'), 'utf-8')) as Record<string, unknown>
    } catch { /* skills have no config.json */ }
    return { schema: manifest.configSchema ?? {}, current }
  }

  async setConfig(slug: string, values: Record<string, unknown>): Promise<void> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    const dir = itemDir(this.paths.aasHome, entry.category, slug)
    await writeFile(join(dir, 'config.json'), JSON.stringify(values, null, 2))
    for (const target of entry.compatibleWith) {
      if (entry.enabledFor[target]) {
        await this._syncToTarget(slug, entry.category, target, 'add')
      }
    }
  }

  async sync(targets?: ToolTarget[]): Promise<SyncResult> {
    const registry = await readRegistry(this.paths.aasHome)
    const effectiveTargets: ToolTarget[] = targets ?? ['claude', 'codex']
    const synced: string[] = []
    const errors: Array<{ slug: string; error: string }> = []
    for (const entry of registry.installed) {
      for (const target of effectiveTargets) {
        if (!entry.enabledFor[target]) continue
        try {
          await this._syncToTarget(entry.slug, entry.category, target, 'add')
          synced.push(`${entry.slug}:${target}`)
        } catch (e) {
          errors.push({ slug: `${entry.slug}:${target}`, error: String(e) })
        }
      }
    }
    return { synced, errors }
  }

  async checkUpdates(slugs?: string[]): Promise<UpdateAvailable[]> {
    const registry = await readRegistry(this.paths.aasHome)
    return _checkUpdates(registry, this.client, slugs)
  }

  async update(slug?: string): Promise<UpdateResult[]> {
    let registry = await readRegistry(this.paths.aasHome)
    const entries = slug
      ? registry.installed.filter(e => e.slug === slug)
      : registry.installed
    const results: UpdateResult[] = []
    for (const entry of entries) {
      try {
        const { latestItem, fromVersion } = await applyUpdate(entry.slug, this.client, entry)
        if (latestItem.version === fromVersion) continue
        const dir = itemDir(this.paths.aasHome, entry.category, entry.slug)
        await runHook(latestItem.installHook.steps, dir)
        if (latestItem.category === 'provider') await providerPostInstall(dir)
        else if (latestItem.category === 'skill') await skillPostInstall(dir)
        else if (latestItem.category === 'mcp') await mcpPostInstall(dir)
        await writeManifest(dir, latestItem)
        const now = new Date().toISOString()
        const updatedRegistry = upsertEntry(registry, { ...entry, version: latestItem.version, updatedAt: now })
        await writeRegistry(this.paths.aasHome, updatedRegistry)
        registry = updatedRegistry
        for (const target of entry.compatibleWith) {
          if (entry.enabledFor[target]) {
            await this._syncToTarget(entry.slug, entry.category, target, 'add')
          }
        }
        results.push({ slug: entry.slug, fromVersion, toVersion: latestItem.version })
      } catch {
        // Skip failed entries; allow the rest to proceed
      }
    }
    return results
  }

  async list(options?: ListOptions): Promise<InstalledItem[]> {
    const registry = await readRegistry(this.paths.aasHome)
    let items = registry.installed
    if (options?.category) items = items.filter(e => e.category === options.category)
    if (options?.enabledFor) items = items.filter(e => e.enabledFor[options.enabledFor!] === true)
    return items
  }

  async info(slug: string): Promise<ItemDetail> {
    const registry = await readRegistry(this.paths.aasHome)
    const entries = registry.installed
    const entry = entries.find(item => item.slug === slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    const dir = itemDir(this.paths.aasHome, entry.category, slug)
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as {
      name: string; description: string; readmeUrl: string; icon: string
      publisher: import('@aas/types').Publisher; tags: string[]; downloads: number
      configSchema?: import('@aas/types').JsonSchema; supportedModels?: string[]
      transport?: 'stdio' | 'sse' | 'http'; serverCommand?: string
      url?: string; headers?: Record<string, string>; contentUrl?: string
    }
    let currentConfig: Record<string, unknown> | undefined
    try {
      currentConfig = JSON.parse(await readFile(join(dir, 'config.json'), 'utf-8')) as Record<string, unknown>
    } catch { /* skills have no config.json */ }
    return {
      ...entry,
      name: manifest.name,
      description: manifest.description,
      readmeUrl: manifest.readmeUrl,
      icon: manifest.icon,
      publisher: manifest.publisher,
      tags: manifest.tags,
      downloads: manifest.downloads,
      configSchema: manifest.configSchema,
      currentConfig,
      supportedModels: manifest.supportedModels,
      transport: manifest.transport,
      serverCommand: manifest.serverCommand,
      url: manifest.url,
      headers: manifest.headers,
      contentUrl: manifest.contentUrl,
    }
  }

  async duplicateProvider(slug: string): Promise<{ newSlug: string }> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    if (entry.category !== 'provider') throw new Error(`Only providers can be duplicated: ${slug}`)

    const rootSlug = entry.parentSlug ?? slug

    let newSlug = `${slug}-copy`
    let suffix = 2
    while (findEntry(registry, newSlug)) {
      newSlug = `${slug}-copy-${suffix}`
      suffix += 1
    }

    const sourceDir = itemDir(this.paths.aasHome, 'provider', slug)
    const targetDir = itemDir(this.paths.aasHome, 'provider', newSlug)
    await duplicateProviderConnection(sourceDir, targetDir, newSlug)

    const now = new Date().toISOString()
    const newEntry: InstalledItem = {
      slug: newSlug,
      category: 'provider',
      version: entry.version,
      installedAt: now,
      updatedAt: now,
      compatibleWith: entry.compatibleWith,
      enabledFor: {},
      parentSlug: rootSlug,
    }
    await writeRegistry(this.paths.aasHome, upsertEntry(registry, newEntry))
    return { newSlug }
  }

  async getUsageSummary(options?: UsageSummaryOptions): Promise<UsageSummaryRow[]> {
    return getDailySummary(this.paths.aasHome, options)
  }

  async getRecentRequests(options?: { limit?: number }): Promise<RecentRequestRow[]> {
    return getRecentRequests(this.paths.aasHome, options)
  }

  async getRelayStatus(): Promise<RelayStatus> {
    return getRelayDaemonStatus(this.paths.aasHome)
  }

  async parsePricingFromUrl(_url: string): Promise<Record<string, ModelPricing>> {
    return {
      'example-model': { input: 1, output: 5 },
    }
  }

  async listLocalConfigs(): Promise<LocalRelayConfig[]> {
    return _listLocalConfigs(this.paths.aasHome)
  }

  async addLocalConfig(name: string): Promise<LocalRelayConfig> {
    return _addLocalConfig(this.paths.aasHome, name)
  }

  async removeLocalConfig(id: string): Promise<void> {
    return _removeLocalConfig(this.paths.aasHome, id)
  }

  async updateLocalConfig(
    id: string,
    patch: { name?: string; port?: number; enabledFor?: Partial<Record<ToolTarget, boolean>> }
  ): Promise<LocalRelayConfig> {
    return _updateLocalConfig(this.paths.aasHome, id, patch)
  }

  async toggleLocalConfig(id: string): Promise<LocalRelayConfig> {
    return _toggleLocalConfig(this.paths.aasHome, id)
  }

  private _hasOtherEnabledProvider(registry: RegistryJson, excludeSlug: string, target: ToolTarget): boolean {
    return registry.installed.some(
      (item) =>
        item.slug !== excludeSlug &&
        item.category === 'provider' &&
        item.compatibleWith.includes(target) &&
        item.enabledFor[target] === true
    )
  }

  private async _syncToTarget(
    slug: string,
    category: 'provider' | 'skill' | 'mcp',
    target: ToolTarget,
    action: 'add' | 'remove'
  ): Promise<void> {
    if (category === 'provider') {
      if (target === 'claude') {
        if (action === 'add') await enableRelayForClaude(this.paths.aasHome, this.paths.claudeConfigDir)
        else await disableRelayForClaude(this.paths.aasHome, this.paths.claudeConfigDir)
      } else if (target === 'codex') {
        if (action === 'add') await enableRelayForCodex(this.paths.aasHome, this.paths.codexConfigDir)
        else await disableRelayForCodex(this.paths.aasHome, this.paths.codexConfigDir)
      }
      return
    }

    if (target === 'claude') {
      await syncItemToClaude(slug, category, this.paths.aasHome, this.paths.claudeConfigDir, action)
    } else if (target === 'codex') {
      await syncItemToCodex(slug, category, this.paths.aasHome, this.paths.codexConfigDir, action)
    }
  }
}
