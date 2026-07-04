import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { openUsageDb } from '../db'
import { computeCost, recordRequest } from '../logger'
import type { ModelPricing } from '../../config/provider'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp('/tmp/aas-usage-logger-test-')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const pricing: Record<string, ModelPricing> = {
  'gpt-5': { input: 2, output: 10, cacheRead: 0.2 },
}

test('computeCost: calculates input+output+cacheRead cost for a priced model', () => {
  const cost = computeCost(pricing, 'gpt-5', { inputTokens: 1_000_000, outputTokens: 500_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 })
  // input: 1M * $2/M = $2; output: 0.5M * $10/M = $5; cacheRead: 1M * $0.2/M = $0.2
  expect(cost).toBeCloseTo(7.2, 5)
})

test('computeCost: returns null when the model has no pricing entry', () => {
  const cost = computeCost(pricing, 'unknown-model', { inputTokens: 100, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 })
  expect(cost).toBeNull()
})

test('computeCost: returns null when pricing is undefined entirely', () => {
  const cost = computeCost(undefined, 'gpt-5', { inputTokens: 100, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 })
  expect(cost).toBeNull()
})

test('recordRequest: writes a detail row and an initial daily rollup row', () => {
  const db = openUsageDb(dir)
  recordRequest(db, {
    providerSlug: 'openai-provider', target: 'codex', model: 'gpt-5',
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.001, statusCode: 200, latencyMs: 400, isStreaming: false,
  })
  const logs = db.query('SELECT * FROM request_logs').all() as Array<{ provider_slug: string; cost_usd: number }>
  expect(logs).toHaveLength(1)
  expect(logs[0].provider_slug).toBe('openai-provider')
  expect(logs[0].cost_usd).toBeCloseTo(0.001, 6)

  const rollups = db.query('SELECT * FROM daily_rollups').all() as Array<{ request_count: number; success_count: number; cost_usd: number }>
  expect(rollups).toHaveLength(1)
  expect(rollups[0].request_count).toBe(1)
  expect(rollups[0].success_count).toBe(1)
  expect(rollups[0].cost_usd).toBeCloseTo(0.001, 6)
})

test('recordRequest: a second call for the same day/provider/target/model accumulates the rollup', () => {
  const db = openUsageDb(dir)
  const base = { providerSlug: 'openai-provider', target: 'codex' as const, model: 'gpt-5', isStreaming: false }
  recordRequest(db, { ...base, usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0.001, statusCode: 200, latencyMs: 400 })
  recordRequest(db, { ...base, usage: { inputTokens: 200, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0.002, statusCode: 500, latencyMs: 900 })

  const rollups = db.query('SELECT * FROM daily_rollups').all() as Array<{
    request_count: number; success_count: number; input_tokens: number; cost_usd: number
  }>
  expect(rollups).toHaveLength(1)
  expect(rollups[0].request_count).toBe(2)
  expect(rollups[0].success_count).toBe(1)
  expect(rollups[0].input_tokens).toBe(300)
  expect(rollups[0].cost_usd).toBeCloseTo(0.003, 6)
})

test('recordRequest: a null cost is not added to the rollup total and increments unpriced_request_count', () => {
  const db = openUsageDb(dir)
  recordRequest(db, {
    providerSlug: 'openai-provider', target: 'codex', model: 'unpriced-model',
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: null, statusCode: 200, latencyMs: 400, isStreaming: false,
  })
  const rollups = db.query('SELECT * FROM daily_rollups').all() as Array<{ cost_usd: number; unpriced_request_count: number }>
  expect(rollups[0].cost_usd).toBe(0)
  expect(rollups[0].unpriced_request_count).toBe(1)
})

test('recordRequest: prunes request_logs older than 30 days but keeps daily_rollups', () => {
  const db = openUsageDb(dir)
  const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
  db.run(
    `INSERT INTO request_logs (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [oldDate, 'openai-provider', 'codex', 'gpt-5', 1, 1, 0, 0, 0.001, 200, 100, 0, 0]
  )
  recordRequest(db, {
    providerSlug: 'openai-provider', target: 'codex', model: 'gpt-5',
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.001, statusCode: 200, latencyMs: 100, isStreaming: false,
  })
  const logs = db.query('SELECT * FROM request_logs').all()
  expect(logs).toHaveLength(1) // the 40-day-old row was pruned; only today's new row remains
  const rollups = db.query('SELECT * FROM daily_rollups').all()
  expect(rollups).toHaveLength(2) // rollups are never pruned — today's and the old date's both remain
})
