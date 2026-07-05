import type { Item, JsonSchema } from './items'
import type { Publisher } from './publisher'

/** The canonical union for supported tool targets */
export type ToolTarget = 'claude' | 'codex'

/**
 * Configurable paths — all three must be overridable for test isolation.
 * Default resolution (in AASEngine implementation, not this package):
 *   aasHome       = process.env.AAS_HOME ?? '~/.agents'
 *   claudeConfigDir = process.env.CLAUDE_CONFIG_DIR ?? '~/.claude'
 *   codexConfigDir  = process.env.CODEX_CONFIG_DIR ?? '~/.codex'
 */
export interface AASPaths {
  aasHome: string
  claudeConfigDir: string
  codexConfigDir: string
}

export interface SearchOptions {
  category?: 'provider' | 'skill' | 'mcp'
  compatibleWith?: ToolTarget[]
  limit?: number
  offset?: number
}

export interface InstallResult {
  slug: string
  version: string
  installedAt: string
}

export interface SyncResult {
  synced: string[]
  errors: Array<{ slug: string; error: string }>
}

export interface UpdateAvailable {
  slug: string
  currentVersion: string
  latestVersion: string
}

export interface UpdateResult {
  slug: string
  fromVersion: string
  toVersion: string
}

export interface ListOptions {
  category?: 'provider' | 'skill' | 'mcp'
  enabledFor?: ToolTarget
}

export interface ModelPricing {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

export interface RelayStatus {
  running: boolean
  pid?: number
}

export interface LocalRelayConfig {
  id: string
  name: string
  port: number
  enabled: boolean
  enabledFor: Partial<Record<ToolTarget, boolean>>
}

export interface UsageSummaryRow {
  date: string
  providerSlug: string
  target: string
  model: string
  requestCount: number
  successCount: number
  unpricedRequestCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
}

export interface UsageSummaryOptions {
  days?: number
  providerSlug?: string
  target?: ToolTarget
}

export interface RecentRequestRow {
  id: number
  createdAt: string
  providerSlug: string
  target: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number | null
  statusCode: number
  latencyMs: number
  isStreaming: boolean
  isFallback: boolean
}

/** A registry entry — shape stored in ~/.agents/registry.json and returned by AASEngine.list() */
export interface InstalledItem {
  slug: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  installedAt: string
  updatedAt: string
  compatibleWith: ToolTarget[]
  /** Partial: only contains entries for tools in compatibleWith */
  enabledFor: Partial<Record<ToolTarget, boolean>>
  /** Root provider slug this entry was duplicated from. Absent means this entry is a root (not a duplicate). */
  parentSlug?: string
}

/**
 * Full item detail — union of market metadata and local install state.
 * Returned by AASEngine.info(). Category-specific fields are optional
 * and only populated for the relevant category.
 */
export interface ItemDetail {
  // Identity + install state (from registry)
  slug: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  installedAt: string
  updatedAt: string
  compatibleWith: ToolTarget[]
  enabledFor: Partial<Record<ToolTarget, boolean>>
  // Market metadata
  name: string
  description: string
  readmeUrl: string
  icon: string
  publisher: Publisher
  tags: string[]
  downloads: number
  // Category-specific (optional — populated based on category)
  /** provider + mcp: JSON Schema for user configuration fields */
  configSchema?: JsonSchema
  /** provider + mcp: current values stored in ~/.agents/.../config.json */
  currentConfig?: Record<string, unknown>
  /** provider only */
  supportedModels?: string[]
  /** mcp only */
  transport?: 'stdio' | 'sse' | 'http'
  /** mcp only: runtime command written to tool config after install */
  serverCommand?: string
  /** mcp only: remote endpoint for http / sse transports */
  url?: string
  /** mcp only: optional static headers for remote transports */
  headers?: Record<string, string>
  /** skill only */
  contentUrl?: string
}

/**
 * AASEngine interface — the public contract for the engine.
 * Implementation lives in apps/client-core. CLI and GUI both depend on this interface.
 *
 * IMPORTANT: All methods are pure data I/O. No terminal output, no interactive prompts.
 * The CLI layer calls getConfigSchema() + setConfig() and handles prompting itself.
 */
export interface AASEngine {
  search(query: string, options?: SearchOptions): Promise<Item[]>
  install(slug: string): Promise<InstallResult>
  uninstall(slug: string): Promise<void>
  enable(slug: string, target: ToolTarget): Promise<void>
  disable(slug: string, target: ToolTarget): Promise<void>
  /** Returns configSchema and current values — CLI/GUI renders prompts/form from this */
  getConfigSchema(slug: string): Promise<{ schema: JsonSchema; current: Record<string, unknown> }>
  /** Saves config values and triggers sync for that item */
  setConfig(slug: string, values: Record<string, unknown>): Promise<void>
  sync(targets?: ToolTarget[]): Promise<SyncResult>
  checkUpdates(slugs?: string[]): Promise<UpdateAvailable[]>
  update(slug?: string): Promise<UpdateResult[]>
  list(options?: ListOptions): Promise<InstalledItem[]>
  info(slug: string): Promise<ItemDetail>
  /** Duplicates an installed provider's local config into a new slug. Throws if slug is not an installed provider. */
  duplicateProvider(slug: string): Promise<{ newSlug: string }>
  /** Returns daily usage/cost rollups, optionally filtered by provider or target. */
  getUsageSummary(options?: UsageSummaryOptions): Promise<UsageSummaryRow[]>
  /** Returns the N most recent raw request-log rows, newest first. */
  getRecentRequests(options?: { limit?: number }): Promise<RecentRequestRow[]>
  /** Reports whether the local relay daemon process is currently running. */
  getRelayStatus(): Promise<RelayStatus>
  /** Fetches a provider's pricing page and extracts a draft pricing table for user review. Returns mock data in this iteration. */
  parsePricingFromUrl(url: string): Promise<Record<string, ModelPricing>>
  /** Lists all local relay listen-port configurations. */
  listLocalConfigs(): Promise<LocalRelayConfig[]>
  /** Adds a new local relay configuration on the next free port, enabled by default. */
  addLocalConfig(name: string): Promise<LocalRelayConfig>
  /** Removes a local relay configuration. Throws if it's the last remaining one. */
  removeLocalConfig(id: string): Promise<void>
  /** Renames and/or changes the port of a local relay configuration. */
  updateLocalConfig(
    id: string,
    patch: { name?: string; port?: number; enabledFor?: Partial<Record<ToolTarget, boolean>> }
  ): Promise<LocalRelayConfig>
  /** Flips a local relay configuration's enabled flag. */
  toggleLocalConfig(id: string): Promise<LocalRelayConfig>
}
