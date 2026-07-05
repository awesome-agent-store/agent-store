import type {
  Publisher,
  Item,
  ProviderItem,
  SkillItem,
  MCPItem,
  InstallHook,
} from '@aas/types'

// ── Raw DB row shapes (snake_case from Supabase) ──────────────────────────────

export interface DBPublisher {
  id: string
  slug: string
  name: string
  avatar_url: string
  tier: 'official' | 'verified' | 'community'
  bio: string | null
  created_at: string
}

export interface DBItem {
  id: string
  slug: string
  name: string
  description: string
  readme_url: string
  icon: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  publisher_id: string
  compatible_with: string[]
  tags: string[]
  downloads: number
  rating: number
  status: 'published' | 'pending' | 'rejected'
  install_hook: { steps: unknown[] }
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // Populated by Supabase join: .select('*, publishers(*)')
  publishers?: DBPublisher
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value)
  if (entries.some(([, item]) => typeof item !== 'string')) return undefined
  return Object.fromEntries(entries) as Record<string, string>
}

// ── Mapping functions ─────────────────────────────────────────────────────────

export function mapPublisher(row: DBPublisher): Publisher {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    avatarUrl: row.avatar_url,
    tier: row.tier,
    ...(row.bio !== null ? { bio: row.bio } : {}),
  }
}

export function mapItem(row: DBItem & { publishers: DBPublisher }): Item {
  const publisher = mapPublisher(row.publishers)
  const base = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    readmeUrl: row.readme_url,
    icon: row.icon,
    version: row.version,
    publisher,
    compatibleWith: row.compatible_with as ('claude' | 'codex')[],
    tags: row.tags,
    downloads: row.downloads,
    rating: row.rating,
    status: row.status,
    installHook: row.install_hook as InstallHook,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  if (row.category === 'provider') {
    return {
      ...base,
      category: 'provider',
      configSchema: (row.metadata['configSchema'] ?? {}) as Record<string, unknown>,
      supportedModels: (row.metadata['supportedModels'] ?? []) as string[],
    } satisfies ProviderItem
  }

  if (row.category === 'skill') {
    return {
      ...base,
      category: 'skill',
      contentUrl: (row.metadata['contentUrl'] ?? '') as string,
    } satisfies SkillItem
  }

  // mcp
  const transport = (row.metadata['transport'] ?? 'stdio') as 'stdio' | 'sse' | 'http'
  if (transport === 'http' || transport === 'sse') {
    return {
      ...base,
      category: 'mcp',
      transport,
      url: readString(row.metadata['url']) ?? '',
      ...(readStringRecord(row.metadata['headers']) ? { headers: readStringRecord(row.metadata['headers']) } : {}),
      configSchema: (row.metadata['configSchema'] ?? {}) as Record<string, unknown>,
    } satisfies MCPItem
  }

  return {
    ...base,
    category: 'mcp',
    transport,
    serverCommand: readString(row.metadata['serverCommand']) ?? '',
    configSchema: (row.metadata['configSchema'] ?? {}) as Record<string, unknown>,
  } satisfies MCPItem
}
