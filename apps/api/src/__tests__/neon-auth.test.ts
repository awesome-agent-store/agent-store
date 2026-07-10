import { test, expect } from 'bun:test'
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type JWTVerifyGetKey } from 'jose'
import { verifyNeonAuthToken } from '../neon-auth'

// Neon Auth (Better Auth) signs session JWTs with EdDSA/Ed25519 (verified against
// the live agent-store-test JWKS). Reproduce that offline: a local Ed25519 key +
// JWKS, so verification is tested without a network round-trip.
const { publicKey, privateKey } = await generateKeyPair('Ed25519', { extractable: true })
const jwk = { ...(await exportJWK(publicKey)), alg: 'EdDSA', kid: 'test-key' }
const jwks: JWTVerifyGetKey = createLocalJWKSet({ keys: [jwk] })

async function sign(claims: Record<string, unknown>, sub?: string): Promise<string> {
  const jwt = new SignJWT(claims).setProtectedHeader({ alg: 'EdDSA', kid: 'test-key' }).setIssuedAt().setExpirationTime('1h')
  if (sub !== undefined) jwt.setSubject(sub)
  return jwt.sign(privateKey)
}

const env = { NEON_AUTH_JWKS_URL: 'https://example.test/jwks.json' }

test('verifies a valid Neon Auth JWT and extracts id + email', async () => {
  const token = await sign({ email: 'dev@example.com', name: 'Dev' }, 'user-123')
  expect(await verifyNeonAuthToken(env, token, jwks)).toEqual({ id: 'user-123', email: 'dev@example.com' })
})

test('email is omitted when the claim is absent', async () => {
  const token = await sign({}, 'user-123')
  expect(await verifyNeonAuthToken(env, token, jwks)).toEqual({ id: 'user-123', email: undefined })
})

test('rejects a token without a subject', async () => {
  const token = await sign({ email: 'dev@example.com' })
  expect(await verifyNeonAuthToken(env, token, jwks)).toBeNull()
})

test('rejects a token signed by a different key', async () => {
  const other = await generateKeyPair('Ed25519', { extractable: true })
  const token = await new SignJWT({ email: 'x@example.com' })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'test-key' })
    .setSubject('user-123')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(other.privateKey)
  expect(await verifyNeonAuthToken(env, token, jwks)).toBeNull()
})

test('rejects an expired token', async () => {
  const token = await new SignJWT({ email: 'x@example.com' })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'test-key' })
    .setSubject('user-123')
    .setIssuedAt(0)
    .setExpirationTime(1)
    .sign(privateKey)
  expect(await verifyNeonAuthToken(env, token, jwks)).toBeNull()
})

test('returns null when Neon Auth is not configured (no JWKS)', async () => {
  const token = await sign({ email: 'dev@example.com' }, 'user-123')
  expect(await verifyNeonAuthToken({}, token, undefined)).toBeNull()
})

test('returns null for a missing token', async () => {
  expect(await verifyNeonAuthToken(env, undefined, jwks)).toBeNull()
})
