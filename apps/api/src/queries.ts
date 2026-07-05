import type { Item, Publisher } from '@aas/types'
import { getSupabase } from './supabase'
import { mapItem, mapPublisher, type DBItem, type DBPublisher } from './db-types'

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
  const supabase = getSupabase()

  let query = supabase.from('items').select(ITEM_SELECT).eq('status', 'published')

  if (category) query = query.eq('category', category)
  if (q) query = query.ilike('name', `%${q}%`)

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
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('items')
    .select(ITEM_SELECT)
    .eq('slug', slug)
    .eq('status', 'published')
    .limit(1)
    .single()

  if (error) {
    const pgError = error as { code?: string; message?: string }
    if (pgError.code === 'PGRST116') return { data: null, error: null }
    return { data: null, error: pgError.message ?? 'Query failed' }
  }

  if (!data) return { data: null, error: null }
  return { data: mapItem(data as DBItem & { publishers: DBPublisher }), error: null }
}

export async function getPublisherBySlug(
  slug: string
): Promise<{ data: Publisher | null; error: string | null }> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('publishers')
    .select('*')
    .eq('slug', slug)
    .limit(1)
    .single()

  if (error) {
    const pgError = error as { code?: string; message?: string }
    if (pgError.code === 'PGRST116') return { data: null, error: null }
    return { data: null, error: pgError.message ?? 'Query failed' }
  }

  return { data: mapPublisher(data as DBPublisher), error: null }
}

export async function getPublisherItems(
  publisherSlug: string
): Promise<{ data: Item[]; error: string | null }> {
  const supabase = getSupabase()

  const { data: publisherData, error: pubError } = await supabase
    .from('publishers')
    .select('id')
    .eq('slug', publisherSlug)
    .limit(1)
    .single()

  if (pubError || !publisherData) return { data: [], error: null }

  const { data, error } = await supabase
    .from('items')
    .select(ITEM_SELECT)
    .eq('publisher_id', (publisherData as { id: string }).id)
    .eq('status', 'published')
    .order('downloads', { ascending: false })

  if (error) return { data: [], error: (error as { message?: string }).message ?? 'Query failed' }

  const rows = (data ?? []) as Array<DBItem & { publishers: DBPublisher }>
  return { data: rows.map(mapItem), error: null }
}
