import type { Item, Publisher } from '@as/types'
import { and, arrayContains, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { getDb, type DbEnv } from './db/client'
import { items, publishers } from './db/schema'
import { mapItem, mapPublisher } from './db-types'

export interface GetItemsOptions {
  category?: 'provider' | 'skill' | 'mcp' | null
  q?: string
  limit?: number
  offset?: number
  sort?: 'downloads' | 'created'
}

// Each query takes the runtime env (Cloudflare Workers `c.env`, or undefined on
// local Bun where it falls back to process.env) and creates a Drizzle client.

export async function getItems(
  env: DbEnv | undefined,
  options: GetItemsOptions
): Promise<{ data: Item[]; error: string | null }> {
  const { category, q, limit = 20, offset = 0, sort = 'downloads' } = options
  try {
    const db = getDb(env)
    const filters: SQL[] = [eq(items.status, 'published')]
    if (category) filters.push(eq(items.category, category))
    // Match name/description substring, or an exact tag — mirrors the web+CLI
    // search that both consume this endpoint.
    if (q) {
      filters.push(
        or(ilike(items.name, `%${q}%`), ilike(items.description, `%${q}%`), arrayContains(items.tags, [q]))!
      )
    }

    const rows = await db
      .select()
      .from(items)
      .innerJoin(publishers, eq(items.publisherId, publishers.id))
      .where(and(...filters))
      .orderBy(desc(sort === 'created' ? items.createdAt : items.downloads))
      .limit(limit)
      .offset(offset)

    return { data: rows.map((r) => mapItem({ ...r.items, publisher: r.publishers })), error: null }
  } catch (e) {
    return { data: [], error: (e as Error).message ?? 'Query failed' }
  }
}

export async function getItemBySlug(
  env: DbEnv | undefined,
  slug: string
): Promise<{ data: Item | null; error: string | null }> {
  try {
    const db = getDb(env)
    const rows = await db
      .select()
      .from(items)
      .innerJoin(publishers, eq(items.publisherId, publishers.id))
      .where(and(eq(items.slug, slug), eq(items.status, 'published')))
      .limit(1)

    const row = rows[0]
    if (!row) return { data: null, error: null }
    return { data: mapItem({ ...row.items, publisher: row.publishers }), error: null }
  } catch (e) {
    return { data: null, error: (e as Error).message ?? 'Query failed' }
  }
}

export async function getPublisherBySlug(
  env: DbEnv | undefined,
  slug: string
): Promise<{ data: Publisher | null; error: string | null }> {
  try {
    const db = getDb(env)
    const rows = await db.select().from(publishers).where(eq(publishers.slug, slug)).limit(1)
    const row = rows[0]
    if (!row) return { data: null, error: null }
    return { data: mapPublisher(row), error: null }
  } catch (e) {
    return { data: null, error: (e as Error).message ?? 'Query failed' }
  }
}

export async function getPublisherItems(
  env: DbEnv | undefined,
  publisherSlug: string
): Promise<{ data: Item[]; error: string | null }> {
  try {
    const db = getDb(env)
    const pub = await db
      .select({ id: publishers.id })
      .from(publishers)
      .where(eq(publishers.slug, publisherSlug))
      .limit(1)
    if (!pub[0]) return { data: [], error: null }

    const rows = await db
      .select()
      .from(items)
      .innerJoin(publishers, eq(items.publisherId, publishers.id))
      .where(and(eq(items.publisherId, pub[0].id), eq(items.status, 'published')))
      .orderBy(desc(items.downloads))

    return { data: rows.map((r) => mapItem({ ...r.items, publisher: r.publishers })), error: null }
  } catch (e) {
    return { data: [], error: (e as Error).message ?? 'Query failed' }
  }
}
