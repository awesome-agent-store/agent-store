import type { Database } from 'bun:sqlite'
import type { ModelPricing } from '../config/provider'
import type { UsageTokens } from './usage-parser'

export function computeCost(
  pricing: Record<string, ModelPricing> | undefined,
  model: string,
  usage: UsageTokens
): number | null {
  const rate = pricing?.[model]
  if (!rate) return null
  const inputCost = (usage.inputTokens / 1_000_000) * rate.input
  const outputCost = (usage.outputTokens / 1_000_000) * rate.output
  const cacheReadCost = rate.cacheRead ? (usage.cacheReadTokens / 1_000_000) * rate.cacheRead : 0
  const cacheWriteCost = rate.cacheWrite ? (usage.cacheWriteTokens / 1_000_000) * rate.cacheWrite : 0
  return inputCost + outputCost + cacheReadCost + cacheWriteCost
}

export interface RecordRequestInput {
  providerSlug: string
  target: 'claude' | 'codex'
  model: string
  usage: UsageTokens
  costUsd: number | null
  statusCode: number
  latencyMs: number
  isStreaming: boolean
  isFallback?: boolean
}

export function recordRequest(db: Database, input: RecordRequestInput): void {
  const now = new Date().toISOString()
  const date = now.slice(0, 10)

  db.run(
    `INSERT INTO request_logs
       (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      now, input.providerSlug, input.target, input.model,
      input.usage.inputTokens, input.usage.outputTokens, input.usage.cacheReadTokens, input.usage.cacheWriteTokens,
      input.costUsd, input.statusCode, input.latencyMs, input.isStreaming ? 1 : 0, input.isFallback ? 1 : 0,
    ]
  )

  const success = input.statusCode >= 200 && input.statusCode < 300 ? 1 : 0
  const unpriced = input.costUsd === null ? 1 : 0
  const cost = input.costUsd ?? 0

  db.run(
    `INSERT INTO daily_rollups
       (date, provider_slug, target, model, request_count, success_count, unpriced_request_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     VALUES (?,?,?,?,1,?,?,?,?,?,?,?)
     ON CONFLICT (date, provider_slug, target, model) DO UPDATE SET
       request_count = request_count + 1,
       success_count = success_count + excluded.success_count,
       unpriced_request_count = unpriced_request_count + excluded.unpriced_request_count,
       input_tokens = input_tokens + excluded.input_tokens,
       output_tokens = output_tokens + excluded.output_tokens,
       cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
       cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
       cost_usd = cost_usd + excluded.cost_usd`,
    [
      date, input.providerSlug, input.target, input.model,
      success, unpriced,
      input.usage.inputTokens, input.usage.outputTokens, input.usage.cacheReadTokens, input.usage.cacheWriteTokens,
      cost,
    ]
  )

  db.run(`DELETE FROM request_logs WHERE created_at < datetime('now', '-30 days')`)
}
