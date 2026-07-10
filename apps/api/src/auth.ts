import { verifyNeonAuthToken, neonAuthUsername, type NeonAuthEnv } from './neon-auth'
import type { DbEnv } from './db/client'

export interface AuthUser {
  id: string
  email?: string
  /** GitHub username from OAuth metadata — maps the user to their publisher profile. */
  username?: string
}

/**
 * Resolves the authenticated user from an `Authorization: Bearer <jwt>` header by
 * verifying a Neon Auth (managed Better Auth) session JWT. Returns null when there
 * is no token or it is invalid — callers map that to 401. Never throws.
 */
export async function getAuthUser(
  env: (NeonAuthEnv & DbEnv) | undefined,
  authHeader: string | undefined | null
): Promise<AuthUser | null> {
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const neonUser = await verifyNeonAuthToken(env, token)
  if (!neonUser) return null

  // The GitHub username is not a Better Auth JWT claim, so resolve it from the
  // user's linked github account (numeric id → login) for publisher mapping.
  const username = await neonAuthUsername(env, neonUser.id)
  return { id: neonUser.id, email: neonUser.email, username }
}
