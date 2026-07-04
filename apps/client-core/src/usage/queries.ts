import type { SQLQueryBindings } from 'bun:sqlite'
import { openUsageDb } from './db'

export interface UsageSummaryRow {
  date: string
  providerSlug: string
  target: string
  model: string
  requestCount: number
  successCount: number
  unpricedRequestCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
}

export interface GetDailySummaryOptions {
  days?: number
  providerSlug?: string
  target?: 'claude' | 'codex'
}

interface DailyRollupRow {
  date: string
  provider_slug: string
  target: string
  model: string
  request_count: number
  success_count: number
  unpriced_request_count: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  cost_usd: number
}

export function getDailySummary(aasHome: string, options: GetDailySummaryOptions = {}): UsageSummaryRow[] {
  const db = openUsageDb(aasHome)
  const days = options.days ?? 30

  const conditions: string[] = [`date >= date('now', ?)`]
  const params: SQLQueryBindings[] = [`-${days} days`]

  if (options.providerSlug) {
    conditions.push('provider_slug = ?')
    params.push(options.providerSlug)
  }
  if (options.target) {
    conditions.push('target = ?')
    params.push(options.target)
  }

  const rows = db
    .query(`SELECT * FROM daily_rollups WHERE ${conditions.join(' AND ')} ORDER BY date DESC`)
    .all(...params) as DailyRollupRow[]

  return rows.map(row => ({
    date: row.date,
    providerSlug: row.provider_slug,
    target: row.target,
    model: row.model,
    requestCount: row.request_count,
    successCount: row.success_count,
    unpricedRequestCount: row.unpriced_request_count,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    costUsd: row.cost_usd,
  }))
}

export interface RecentRequestRow {
  id: number
  createdAt: string
  providerSlug: string
  target: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number | null
  statusCode: number
  latencyMs: number
  isStreaming: boolean
  isFallback: boolean
}

interface RequestLogRow {
  id: number
  created_at: string
  provider_slug: string
  target: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  cost_usd: number | null
  status_code: number
  latency_ms: number
  is_streaming: number
  is_fallback: number
}

export function getRecentRequests(aasHome: string, options: { limit?: number } = {}): RecentRequestRow[] {
  const db = openUsageDb(aasHome)
  const limit = options.limit ?? 20

  const rows = db
    .query(`SELECT * FROM request_logs ORDER BY id DESC LIMIT ?`)
    .all(limit) as RequestLogRow[]

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    providerSlug: row.provider_slug,
    target: row.target,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    costUsd: row.cost_usd,
    statusCode: row.status_code,
    latencyMs: row.latency_ms,
    isStreaming: row.is_streaming === 1,
    isFallback: row.is_fallback === 1,
  }))
}
