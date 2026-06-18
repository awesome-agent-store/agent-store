import type { Item } from '@aas/types'
import { createClient } from '@/lib/supabase/server'
import { mapItem } from '@/lib/db-types'
import type { DBItem, DBPublisher } from '@/lib/db-types'

const ITEM_SELECT = '*, publishers(*)'

export interface GetItemsOptions {
  category?: 'provider' | 'skill' | 'mcp' | null
  q?: string
  limit?: number
  offset?: number
  sort?: 'downloads' | 'created'
}

export async function getItems(
  options: GetItemsOptions
): Promise<{ data: Item[]; error: string | null }> {
  const { category, q, limit = 20, offset = 0, sort = 'downloads' } = options
  const supabase = createClient()

  let query = supabase
    .from('items')
    .select(ITEM_SELECT)
    .eq('status', 'published')

  if (category) {
    query = query.eq('category', category)
  }
  if (q) {
    query = query.ilike('name', `%${q}%`)
  }

  const orderColumn = sort === 'created' ? 'created_at' : 'downloads'
  query = query.order(orderColumn, { ascending: false })

  const { data, error } = await query.range(offset, offset + limit - 1)

  if (error) return { data: [], error: (error as { message?: string }).message ?? 'Query failed' }

  const rows = (data ?? []) as Array<DBItem & { publishers: DBPublisher }>
  return { data: rows.map(mapItem), error: null }
}

export async function getItemBySlug(
  slug: string
): Promise<{ data: Item | null; error: string | null }> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('items')
    .select(ITEM_SELECT)
    .eq('slug', slug)

  if (error) {
    // PGRST116 = row not found — treat as null, not error
    const pgError = error as { code?: string; message?: string }
    if (pgError.code === 'PGRST116') return { data: null, error: null }
    return { data: null, error: pgError.message ?? 'Query failed' }
  }

  const rows = (data ?? []) as Array<DBItem & { publishers: DBPublisher }>
  if (rows.length === 0) return { data: null, error: null }

  return { data: mapItem(rows[0]), error: null }
}

export async function getFeaturedItems(): Promise<{ data: Item[]; error: string | null }> {
  // Featured = top 6 by downloads across all categories
  return getItems({ limit: 6, sort: 'downloads' })
}

export async function getNewItems(): Promise<{ data: Item[]; error: string | null }> {
  return getItems({ limit: 6, sort: 'created' })
}
