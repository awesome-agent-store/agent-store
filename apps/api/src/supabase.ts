import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * Lazily create a plain (cookie-less) Supabase client for the standalone API
 * server. Reads SUPABASE_URL / SUPABASE_ANON_KEY, falling back to the
 * NEXT_PUBLIC_* names so the same .env used by the web app works locally.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client
  const url = process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key = process.env['SUPABASE_ANON_KEY'] ?? process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
  if (!url || !key) {
    throw new Error(
      'Missing Supabase config: set SUPABASE_URL and SUPABASE_ANON_KEY (or the NEXT_PUBLIC_* equivalents).'
    )
  }
  client = createClient(url, key)
  return client
}
