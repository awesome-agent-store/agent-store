import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type {
  AASEngine, AASPaths, InstallResult, SyncResult, UpdateAvailable, UpdateResult,
  ListOptions, InstalledItem, ItemDetail, ToolTarget, SearchOptions, Item, JsonSchema,
} from '@aas/types'
import { AASClient } from '@aas/sdk'
import { resolvePaths, itemDir } from './paths'
import { readRegistry, writeRegistry, findEntry, upsertEntry, removeEntry } from './registry/index'
import { runHook, writeManifest } from './installer/hook-runner'
import { postInstall as providerPostInstall } from './installer/provider'
import { postInstall as skillPostInstall } from './installer/skill'
import { postInstall as mcpPostInstall } from './installer/mcp'
import { syncItemToClaude } from './config/claude'
import { syncItemToCodex } from './config/codex'
import { checkUpdates as _checkUpdates, applyUpdate } from './updater/index'

export class AASEngineImpl implements AASEngine {
  private readonly paths: Required<AASPaths>
  private readonly client: AASClient

  constructor(pathOverrides?: Partial<AASPaths>, marketUrl?: string) {
    this.paths = resolvePaths(pathOverrides)
    this.client = new AASClient(marketUrl)
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
        await this._syncToTarget(slug, entry.category, target, 'remove')
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
    await this._syncToTarget(slug, entry.category, target, 'remove')
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
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    const dir = itemDir(this.paths.aasHome, entry.category, slug)
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as {
      name: string; description: string; readmeUrl: string; icon: string
      publisher: import('@aas/types').Publisher; tags: string[]; downloads: number
      configSchema?: import('@aas/types').JsonSchema; supportedModels?: string[]
      transport?: 'stdio' | 'sse' | 'http'; serverCommand?: string; contentUrl?: string
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
      contentUrl: manifest.contentUrl,
    }
  }

  private async _syncToTarget(
    slug: string,
    category: 'provider' | 'skill' | 'mcp',
    target: ToolTarget,
    action: 'add' | 'remove'
  ): Promise<void> {
    if (target === 'claude') {
      await syncItemToClaude(slug, category, this.paths.aasHome, this.paths.claudeConfigDir, action)
    } else if (target === 'codex') {
      await syncItemToCodex(slug, category, this.paths.aasHome, this.paths.codexConfigDir, action)
    }
  }
}
