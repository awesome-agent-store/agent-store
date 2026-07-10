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
}

function pickEnv(env: SupabaseEnv | undefined, k: keyof SupabaseEnv): string | undefined {
  return env?.[k] ?? (typeof process !== 'undefined' ? process.env?.[k] : undefined)
}

/**
 * Create a plain (cookie-less) Supabase client. `env` wins (Workers); otherwise
 * fall back to process.env (local Bun). Supports the NEXT_PUBLIC_* names so the
 * same .env used by the web app works locally.
 *
 * Data access has moved to Drizzle/Neon (see `db/`); this client is now only
 * used by `auth.ts` to validate Supabase Auth session tokens, until Phase 2
 * swaps auth to Neon Auth.
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
