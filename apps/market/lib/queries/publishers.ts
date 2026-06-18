import type { Publisher } from '@aas/types'
import type { Item } from '@aas/types'
import { createClient } from '@/lib/supabase/server'
import { mapPublisher, mapItem } from '@/lib/db-types'
import type { DBPublisher, DBItem } from '@/lib/db-types'

export async function getPublisherBySlug(
  slug: string
): Promise<{ data: Publisher | null; error: string | null }> {
  const supabase = createClient()

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
  const supabase = createClient()

  const { data: publisherData, error: pubError } = await supabase
    .from('publishers')
    .select('id')
    .eq('slug', publisherSlug)
    .limit(1)
    .single()

  if (pubError || !publisherData) return { data: [], error: null }

  const { data, error } = await supabase
    .from('items')
    .select('*, publishers(*)')
    .eq('publisher_id', (publisherData as { id: string }).id)
    .eq('status', 'published')
    .order('downloads', { ascending: false })

  if (error) return { data: [], error: (error as { message?: string }).message ?? 'Query failed' }

  const rows = (data ?? []) as Array<DBItem & { publishers: DBPublisher }>
  return { data: rows.map(mapItem), error: null }
}
