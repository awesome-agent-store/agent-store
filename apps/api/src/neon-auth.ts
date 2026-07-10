import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/** Env bag carrying the Neon Auth (managed Better Auth) JWKS endpoint. Absent =
 * Neon Auth verification is disabled (the app stays on Supabase Auth). */
export type NeonAuthEnv = {
  NEON_AUTH_JWKS_URL?: string
}

/** The subset of a verified Neon Auth session we consume. Neon Auth (Better Auth)
 * signs session JWTs with EdDSA/Ed25519; the payload carries `sub` = user id and
 * `email`. Note: the GitHub *username* is not a JWT claim (Better Auth stores only
 * the provider's numeric account id), so publisher mapping by username is resolved
 * separately in a later Phase 2 step. */
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
