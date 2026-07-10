import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

/** Env bag carrying the Neon connection string. Cloudflare Workers passes it via
 * the fetch handler's `env` (Hono `c.env`); local Bun falls back to process.env. */
export type DbEnv = {
  DATABASE_URL?: string
}

export type Database = ReturnType<typeof drizzle<typeof schema>>

function databaseUrl(env: DbEnv | undefined): string {
  const url = env?.DATABASE_URL ?? (typeof process !== 'undefined' ? process.env?.['DATABASE_URL'] : undefined)
  if (!url) throw new Error('Missing Neon config: set DATABASE_URL.')
  return url
}

/**
 * Drizzle client over Neon's HTTP driver — a good fit for Cloudflare Workers
 * (stateless, one round-trip per query). `env` wins (Workers); otherwise falls
 * back to process.env (local Bun). The `neon()` handle is lazy: it only opens a
 * connection when a query runs, so constructing this never touches the network.
 */
export function getDb(env?: DbEnv): Database {
  return drizzle(neon(databaseUrl(env)), { schema })
}
