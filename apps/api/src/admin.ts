import type { Item } from '@as/types'
import { getSupabaseAdmin, type SupabaseEnv } from './supabase'
import { mapItem, type DBItem, type DBPublisher } from './db-types'
import type { AuthUser } from './auth'

/** Comma-separated GitHub usernames allowed to review the catalog. */
export type AdminEnv = { ADMIN_GITHUB_USERNAMES?: string }

export function isAdmin(user: AuthUser | null, env: (SupabaseEnv & AdminEnv) | undefined): boolean {
  if (!user?.username) return false
  const raw = env?.ADMIN_GITHUB_USERNAMES ?? (typeof process !== 'undefined' ? process.env?.ADMIN_GITHUB_USERNAMES : undefined)
  const admins = (raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return admins.includes(user.username.toLowerCase())
}

/** All pending items (crawler-sourced or user-submitted), newest first. Service-role. */
export async function getPendingItems(env: SupabaseEnv | undefined): Promise<{ data: Item[]; error: string | null }> {
  const supabase = getSupabaseAdmin(env)
  const { data, error } = await supabase
    .from('items')
    .select('*, publishers(*)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) return { data: [], error: (error as { message?: string }).message ?? 'Query failed' }
  const rows = (data ?? []) as Array<DBItem & { publishers: DBPublisher }>
  return { data: rows.map(mapItem), error: null }
}

export async function setItemStatus(
  env: SupabaseEnv | undefined,
  id: string,
  status: 'published' | 'rejected'
): Promise<{ error: string | null }> {
  const supabase = getSupabaseAdmin(env)
  const { error } = await supabase.from('items').update({ status }).eq('id', id)
  return { error: error ? ((error as { message?: string }).message ?? 'Update failed') : null }
}
