import type { Database } from 'bun:sqlite'
import type { ProviderHealth } from '@as/types'
import { openUsageDb } from './db'
import { classifyOutcome, type HealthErrorKind } from './health-classify'

export { classifyOutcome, type HealthErrorKind } from './health-classify'

// A single upstream attempt outcome, collected during forwarding. statusCode is
// null when the request threw before getting a response (network error).
export interface ProviderAttempt {
  slug: string
  statusCode: number | null
  latencyMs: number
}

// Cooldown per error kind (ms). Classified like mature relays (CRS/claude-code-hub):
// auth is long (the key is likely bad and won't self-heal); network is lenient
// (could be a local blip rather than the provider being down).
const COOLDOWN_MS: Record<HealthErrorKind, number> = {
  auth: 10 * 60_000,
  rate_limit: 60_000,
  overload: 45_000,
  server: 30_000,
  network: 15_000,
}

// Consecutive failures before cooling a provider down. Auth trips immediately.
const FAILURE_THRESHOLD = 2

interface HealthDbRow {
  provider_slug: string
  status: string
  consecutive_failures: number
  cooldown_until: number | null
  last_error_kind: string | null
  last_status: number | null
  last_error_at: string | null
}

function recordOne(db: Database, attempt: ProviderAttempt, now: number): void {
  const kind = classifyOutcome(attempt.statusCode)
  const iso = new Date(now).toISOString()

  if (kind === null) {
    // Success — clear any failure state.
    db.run(
      `INSERT INTO provider_health (provider_slug, status, consecutive_failures, cooldown_until, last_error_kind, last_status, last_error_at, updated_at)
       VALUES (?, 'up', 0, NULL, NULL, NULL, NULL, ?)
       ON CONFLICT(provider_slug) DO UPDATE SET
         status = 'up', consecutive_failures = 0, cooldown_until = NULL, updated_at = excluded.updated_at`,
      [attempt.slug, iso]
    )
    return
  }

  const prev = db
    .query('SELECT consecutive_failures FROM provider_health WHERE provider_slug = ?')
    .get(attempt.slug) as { consecutive_failures: number } | null
  const consecutive = (prev?.consecutive_failures ?? 0) + 1
  const trip = kind === 'auth' || consecutive >= FAILURE_THRESHOLD
  const status = trip ? 'cooling' : 'up'
  const cooldownUntil = trip ? now + COOLDOWN_MS[kind] : null

  db.run(
    `INSERT INTO provider_health (provider_slug, status, consecutive_failures, cooldown_until, last_error_kind, last_status, last_error_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider_slug) DO UPDATE SET
       status = excluded.status, consecutive_failures = excluded.consecutive_failures,
       cooldown_until = excluded.cooldown_until, last_error_kind = excluded.last_error_kind,
       last_status = excluded.last_status, last_error_at = excluded.last_error_at, updated_at = excluded.updated_at`,
    [attempt.slug, status, consecutive, cooldownUntil, kind, attempt.statusCode, iso, iso]
  )
}

/** Apply a batch of attempt outcomes to the circuit-breaker state. Never throws. */
export function recordProviderHealthBatch(aasHome: string, attempts: ProviderAttempt[], now: number = Date.now()): void {
  if (attempts.length === 0) return
  try {
    const db = openUsageDb(aasHome)
    for (const attempt of attempts) recordOne(db, attempt, now)
  } catch (err) {
    console.error('[health] failed to record provider health:', err)
  }
}

/** Read per-provider health; a provider whose cooldown has elapsed reports as 'up' again. */
export function readProviderHealth(aasHome: string, now: number = Date.now()): ProviderHealth[] {
  const db = openUsageDb(aasHome)
  const rows = db.query('SELECT * FROM provider_health ORDER BY provider_slug').all() as HealthDbRow[]
  return rows.map((r) => {
    const cooling = r.cooldown_until != null && r.cooldown_until > now
    return {
      providerSlug: r.provider_slug,
      status: cooling ? 'cooling' : 'up',
      consecutiveFailures: r.consecutive_failures,
      cooldownUntil: cooling ? r.cooldown_until : null,
      lastErrorKind: r.last_error_kind,
      lastStatus: r.last_status,
      lastErrorAt: r.last_error_at,
    }
  })
}

/** Manually clear a provider's cooldown so routing can use it again immediately. */
export function resetProviderHealth(aasHome: string, slug: string, now: number = Date.now()): void {
  const db = openUsageDb(aasHome)
  db.run(
    `UPDATE provider_health SET status = 'up', consecutive_failures = 0, cooldown_until = NULL, updated_at = ? WHERE provider_slug = ?`,
    [new Date(now).toISOString(), slug]
  )
}

/** Slugs currently cooling down — used by health-aware routing to skip them. */
export function getCoolingProviderSlugs(aasHome: string, now: number = Date.now()): Set<string> {
  const db = openUsageDb(aasHome)
  const rows = db
    .query('SELECT provider_slug FROM provider_health WHERE cooldown_until IS NOT NULL AND cooldown_until > ?')
    .all(now) as { provider_slug: string }[]
  return new Set(rows.map((r) => r.provider_slug))
}
