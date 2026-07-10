import type { Item } from '@as/types'
import { and, desc, eq } from 'drizzle-orm'
import { getDb, type Database, type DbEnv } from './db/client'
import { items, publishers } from './db/schema'
import { mapItem } from './db-types'

export interface CreateItemInput {
  slug: string
  name: string
  description: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  compatibleWith?: string[]
  tags?: string[]
  metadata?: Record<string, unknown>
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

/** Validates a create-item payload; returns an error message + HTTP status, or null when valid. */
export function validateCreateItem(body: CreateItemInput): { error: string; status: number } | null {
  const required: (keyof CreateItemInput)[] = ['slug', 'name', 'description', 'category', 'version']
  for (const field of required) {
    if (!body[field]) return { error: `Missing required field: ${field}`, status: 422 }
  }
  if (!['provider', 'skill', 'mcp'].includes(body.category)) {
    return { error: 'Invalid category', status: 422 }
  }
  if (body.category === 'mcp') {
    const md = readRecord(body.metadata) ?? {}
    const transport = typeof md['transport'] === 'string' ? (md['transport'] as string) : 'stdio'
    if (!['stdio', 'http', 'sse'].includes(transport)) return { error: 'Invalid MCP transport', status: 422 }
    if (transport === 'stdio' && typeof md['serverCommand'] !== 'string') return { error: 'Missing MCP serverCommand', status: 422 }
    if ((transport === 'http' || transport === 'sse') && typeof md['url'] !== 'string') return { error: 'Missing MCP url', status: 422 }
  }
  return null
}

async function resolvePublisherId(db: Database, username: string): Promise<string | null> {
  const rows = await db.select({ id: publishers.id }).from(publishers).where(eq(publishers.slug, username)).limit(1)
  return rows[0]?.id ?? null
}

/** Returns all items for the authenticated publisher (any status), newest first. */
export async function getMyItems(env: DbEnv | undefined, username: string): Promise<{ data: Item[]; error: string | null }> {
  try {
    const db = getDb(env)
    const publisherId = await resolvePublisherId(db, username)
    if (!publisherId) return { data: [], error: null }
    const rows = await db
      .select()
      .from(items)
      .innerJoin(publishers, eq(items.publisherId, publishers.id))
      .where(eq(items.publisherId, publisherId))
      .orderBy(desc(items.createdAt))
    return { data: rows.map((r) => mapItem({ ...r.items, publisher: r.publishers })), error: null }
  } catch (e) {
    return { data: [], error: (e as Error).message ?? 'Query failed' }
  }
}

/** Inserts a pending item owned by the authenticated publisher. */
export async function createItem(
  env: DbEnv | undefined,
  username: string,
  body: CreateItemInput
): Promise<{ ok: true } | { error: string; status: number }> {
  const db = getDb(env)
  const publisherId = await resolvePublisherId(db, username)
  if (!publisherId) return { error: 'Publisher profile not found. Please create one first.', status: 422 }

  try {
    await db.insert(items).values({
      slug: body.slug,
      name: body.name,
      description: body.description,
      category: body.category,
      version: body.version,
      publisherId,
      compatibleWith: body.compatibleWith ?? [],
      tags: body.tags ?? [],
      installHook: { steps: [] },
      metadata: body.metadata ?? {},
      status: 'pending',
    })
    return { ok: true }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === '23505' || err.message?.includes('duplicate key')) {
      return { error: 'An item with this slug already exists', status: 409 }
    }
    return { error: 'Failed to create item', status: 500 }
  }
}
