import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Env bag: Cloudflare Workers passes secrets via the fetch handler's `env`
 * (surfaced as Hono `c.env`); local Bun has no such bag and falls back to
 * process.env. Accept either. */
export type SupabaseEnv = {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  NEXT_PUBLIC_SUPABASE_URL?: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string
  ADMIN_GITHUB_USERNAMES?: string
}

function pickEnv(env: SupabaseEnv | undefined, k: keyof SupabaseEnv): string | undefined {
  return env?.[k] ?? (typeof process !== 'undefined' ? process.env?.[k] : undefined)
}

/**
 * Create a plain (cookie-less) Supabase client. `env` wins (Workers); otherwise
 * fall back to process.env (local Bun). Supports the NEXT_PUBLIC_* names so the
 * same .env used by the web app works locally.
 */
export function getSupabase(env?: SupabaseEnv): SupabaseClient {
  const url = pickEnv(env, 'SUPABASE_URL') ?? pickEnv(env, 'NEXT_PUBLIC_SUPABASE_URL')
  const key = pickEnv(env, 'SUPABASE_ANON_KEY') ?? pickEnv(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!url || !key) {
    throw new Error(
      'Missing Supabase config: set SUPABASE_URL and SUPABASE_ANON_KEY (or the NEXT_PUBLIC_* equivalents).'
    )
  }
  return createClient(url, key)
}

/**
 * Server-trusted Supabase client using the service-role key. Used by the billing
 * webhook and entitlement handlers to read/write `subscriptions`, which RLS keeps
 * inaccessible to the anon key. Never expose this client to untrusted callers.
 */
export function getSupabaseAdmin(env?: SupabaseEnv): SupabaseClient {
  const url = pickEnv(env, 'SUPABASE_URL') ?? pickEnv(env, 'NEXT_PUBLIC_SUPABASE_URL')
  const key = pickEnv(env, 'SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('Missing Supabase admin config: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}
