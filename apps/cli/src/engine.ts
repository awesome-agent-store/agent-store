import { AASEngineImpl } from '@aas/client-core'

// The catalog API is served by the standalone `apps/api` server. Point at it via
// AAS_STORE_URL (set in dev/Makefile and in production config); default to the
// local api-server dev port.
const DEFAULT_STORE_URL = 'http://127.0.0.1:3001'

export function createEngine(): AASEngineImpl {
  const storeUrl = process.env['AAS_STORE_URL'] ?? DEFAULT_STORE_URL
  return new AASEngineImpl(undefined, storeUrl)
}
