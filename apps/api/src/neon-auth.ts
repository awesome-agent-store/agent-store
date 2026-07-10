import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { sql } from 'drizzle-orm'
import { getDb, type DbEnv } from './db/client'

/** Env bag carrying the Neon Auth (managed Better Auth) JWKS endpoint. Absent =
 * Neon Auth verification is disabled (the app stays on Supabase Auth). */
export type NeonAuthEnv = {
  NEON_AUTH_JWKS_URL?: string
}

/** The subset of a verified Neon Auth session we consume. Neon Auth (Better Auth)
 * signs session JWTs with EdDSA/Ed25519; the payload carries `sub` = user id and
 * `email`. The GitHub *username* is not a JWT claim (Better Auth stores only the
 * provider's numeric account id), so it is resolved separately via
 * `neonAuthUsername()`. */
export interface NeonAuthUser {
  id: string
  email?: string
}

// Cache one remote JWKS resolver per URL. `createRemoteJWKSet` fetches and caches
// the keys internally, so this just avoids rebuilding the resolver per request.
const jwksByUrl = new Map<string, JWTVerifyGetKey>()

function jwksFor(url: string): JWTVerifyGetKey {
  let getKey = jwksByUrl.get(url)
  if (!getKey) {
    getKey = createRemoteJWKSet(new URL(url))
    jwksByUrl.set(url, getKey)
  }
  return getKey
}

/**
 * Verify a Neon Auth session JWT and return the user, or null when there is no
 * JWKS configured, no token, or the token fails verification. Never throws.
 *
 * `getKey` is injectable so tests can verify against a local JWKS without network.
 */
export async function verifyNeonAuthToken(
  env: NeonAuthEnv | undefined,
  token: string | undefined | null,
  getKey?: JWTVerifyGetKey
): Promise<NeonAuthUser | null> {
  const jwksUrl = env?.NEON_AUTH_JWKS_URL ?? (typeof process !== 'undefined' ? process.env?.['NEON_AUTH_JWKS_URL'] : undefined)
  const resolver = getKey ?? (jwksUrl ? jwksFor(jwksUrl) : undefined)
  if (!resolver || !token) return null
  try {
    const { payload } = await jwtVerify(token, resolver)
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    return {
      id: payload.sub,
      email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Resolve a GitHub login (username) from its numeric account id via GitHub's
 * by-id endpoint. Better Auth stores only the numeric id in `neon_auth.account`,
 * and publishers are keyed by login, so this bridges the two. `fetchImpl` is
 * injectable for tests. Returns undefined on any failure. Never throws.
 */
export async function githubLoginById(
  accountId: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | undefined> {
  try {
    const res = await fetchImpl(`https://api.github.com/user/${encodeURIComponent(accountId)}`, {
      headers: { 'user-agent': 'agent-store-api', accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { login?: unknown }
    return typeof data.login === 'string' ? data.login : undefined
  } catch {
    return undefined
  }
}

// Resolved GitHub usernames, keyed by Neon Auth user id. `null` records a
// resolved-but-absent lookup so we don't re-hit GitHub for the same user.
const usernameCache = new Map<string, string | null>()

/**
 * The GitHub username for a Neon Auth user, for publisher mapping: read the
 * user's github row in `neon_auth.account` (numeric id) and resolve it to a
 * login. Cached per user (per worker instance). Returns undefined when the user
 * has no linked GitHub account or resolution fails. Never throws.
 */
export async function neonAuthUsername(
  env: (DbEnv & NeonAuthEnv) | undefined,
  userId: string
): Promise<string | undefined> {
  const cached = usernameCache.get(userId)
  if (cached !== undefined) return cached ?? undefined

  let username: string | undefined
  try {
    const db = getDb(env)
    const rows = (await db.execute(
      sql`select "accountId" as account_id from neon_auth.account where "userId" = ${userId} and "providerId" = 'github' limit 1`
    )) as unknown as { rows?: Array<{ account_id: string }> } & Array<{ account_id: string }>
    const accountId = rows.rows?.[0]?.account_id ?? rows[0]?.account_id
    if (accountId) username = await githubLoginById(String(accountId))
  } catch {
    // leave undefined
  }
  usernameCache.set(userId, username ?? null)
  return username
}
