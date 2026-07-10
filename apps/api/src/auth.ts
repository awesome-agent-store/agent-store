import { getSupabase, type SupabaseEnv } from './supabase'
import { verifyNeonAuthToken, neonAuthUsername, type NeonAuthEnv } from './neon-auth'
import type { DbEnv } from './db/client'

export interface AuthUser {
  id: string
  email?: string
  /** GitHub username from OAuth metadata — maps the user to their publisher profile. */
  username?: string
}

/**
 * Resolves the authenticated user from an `Authorization: Bearer <jwt>` header.
 *
 * Migration dual-path (Phase 2): when `NEON_AUTH_JWKS_URL` is configured, try
 * Neon Auth (Better Auth) session verification first; otherwise, or if that
 * fails, fall back to Supabase Auth. With the URL unset (as on the worker today)
 * this is pure Supabase — unchanged behavior. Returns null when there is no token
 * or it is invalid — callers map that to 401. Never throws.
 */
export async function getAuthUser(
  env: (SupabaseEnv & NeonAuthEnv & DbEnv) | undefined,
  authHeader: string | undefined | null
): Promise<AuthUser | null> {
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  // Neon Auth (only when configured). The GitHub username is not a Better Auth
  // JWT claim, so resolve it from the user's linked github account (numeric id →
  // login), which maps to their publisher profile.
  const neonUser = await verifyNeonAuthToken(env, token)
  if (neonUser) {
    const username = await neonAuthUsername(env, neonUser.id)
    return { id: neonUser.id, email: neonUser.email, username }
  }

  try {
    const supabase = getSupabase(env)
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return null
    const username = (data.user.user_metadata as Record<string, unknown> | undefined)?.['user_name']
    return {
      id: data.user.id,
      email: data.user.email,
      username: typeof username === 'string' ? username : undefined,
    }
  } catch {
    return null
  }
}
