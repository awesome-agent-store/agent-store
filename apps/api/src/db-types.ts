import type {
  Publisher,
  Item,
  ProviderItem,
  SkillItem,
  MCPItem,
  InstallHook,
} from '@as/types'
import type { items, publishers } from './db/schema'

// ── Raw DB row shapes (Drizzle-inferred from the Neon schema) ─────────────────
// Drizzle returns numeric columns as strings and timestamptz as Date objects;
// the mappers below normalize those to the numbers / ISO strings the API emits.

export type DBPublisher = typeof publishers.$inferSelect
export type DBItem = typeof items.$inferSelect

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
    avatarUrl: row.avatarUrl,
    tier: row.tier as Publisher['tier'],
    ...(row.bio !== null ? { bio: row.bio } : {}),
  }
}

export function mapItem(row: DBItem & { publisher: DBPublisher }): Item {
  const publisher = mapPublisher(row.publisher)
  const metadata = (row.metadata ?? {}) as Record<string, unknown>
  const base = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    version: row.version,
    publisher,
    compatibleWith: row.compatibleWith as ('claude' | 'codex')[],
    tags: row.tags,
    downloads: row.downloads,
    rating: Number(row.rating),
    reviewCount: row.reviewCount ?? 0,
    status: row.status as Item['status'],
    installHook: (row.installHook ?? { steps: [] }) as InstallHook,
    review: (metadata['review'] as import('@as/types').PackageReview | undefined) ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }

  if (row.category === 'provider') {
    return {
      ...base,
      category: 'provider',
      configSchema: (metadata['configSchema'] ?? {}) as Record<string, unknown>,
      supportedModels: (metadata['supportedModels'] ?? []) as string[],
    } satisfies ProviderItem
  }

  if (row.category === 'skill') {
    return {
      ...base,
      category: 'skill',
      contentUrl: (metadata['contentUrl'] ?? '') as string,
    } satisfies SkillItem
  }

  // mcp
  const transport = (metadata['transport'] ?? 'stdio') as 'stdio' | 'sse' | 'http'
  if (transport === 'http' || transport === 'sse') {
    return {
      ...base,
      category: 'mcp',
      transport,
      url: readString(metadata['url']) ?? '',
      ...(readStringRecord(metadata['headers']) ? { headers: readStringRecord(metadata['headers']) } : {}),
      configSchema: (metadata['configSchema'] ?? {}) as Record<string, unknown>,
    } satisfies MCPItem
  }

  return {
    ...base,
    category: 'mcp',
    transport,
    serverCommand: readString(metadata['serverCommand']) ?? '',
    configSchema: (metadata['configSchema'] ?? {}) as Record<string, unknown>,
  } satisfies MCPItem
}
