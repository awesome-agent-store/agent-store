import { createNeonAuth } from '@neondatabase/auth/next/server'
import { neonAuthConfig } from './config'

type NeonAuthServer = ReturnType<typeof createNeonAuth>

let instance: NeonAuthServer | undefined

// Lazily instantiate the Neon Auth (managed Better Auth) server instance.
// Deferred rather than created at import time because createNeonAuth throws
// without the cookie secret, which is a runtime-only env var — evaluating it at
// build/prerender time (e.g. collecting the /api/auth route) would crash the
// build. Callers use auth() so it's only created on the first request.
export function auth(): NeonAuthServer {
  if (!instance) instance = createNeonAuth(neonAuthConfig)
  return instance
}
