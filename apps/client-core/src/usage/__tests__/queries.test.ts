import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { openUsageDb } from '../db'
import { recordRequest } from '../logger'
import { getDailySummary, getRecentRequests } from '../queries'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp('/tmp/aas-usage-queries-test-')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('getDailySummary returns rows sorted by date descending', () => {
  const db = openUsageDb(dir)
  recordRequest(db, {
    providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.01, statusCode: 200, latencyMs: 100, isStreaming: false,
  })
  recordRequest(db, {
    providerSlug: 'openrouter', target: 'codex', model: 'gpt-5-codex',
    usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.02, statusCode: 200, latencyMs: 100, isStreaming: false,
  })

  const rows = getDailySummary(dir)
  expect(rows).toHaveLength(2)
  expect(rows.map(r => r.providerSlug).sort()).toEqual(['openrouter', 'yls'])
})

test('getDailySummary filters by providerSlug', () => {
  const db = openUsageDb(dir)
  recordRequest(db, {
    providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.01, statusCode: 200, latencyMs: 100, isStreaming: false,
  })
  recordRequest(db, {
    providerSlug: 'openrouter', target: 'codex', model: 'gpt-5-codex',
    usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.02, statusCode: 200, latencyMs: 100, isStreaming: false,
  })

  const rows = getDailySummary(dir, { providerSlug: 'yls' })
  expect(rows).toHaveLength(1)
  expect(rows[0].providerSlug).toBe('yls')
})

test('getDailySummary filters by target', () => {
  const db = openUsageDb(dir)
  recordRequest(db, {
    providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.01, statusCode: 200, latencyMs: 100, isStreaming: false,
  })
  recordRequest(db, {
    providerSlug: 'openrouter', target: 'codex', model: 'gpt-5-codex',
    usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.02, statusCode: 200, latencyMs: 100, isStreaming: false,
  })

  const rows = getDailySummary(dir, { target: 'codex' })
  expect(rows).toHaveLength(1)
  expect(rows[0].target).toBe('codex')
})

test('getDailySummary excludes rows older than the requested day window', () => {
  const db = openUsageDb(dir)
  const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  db.run(
    `INSERT INTO daily_rollups (date, provider_slug, target, model, request_count, success_count, unpriced_request_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [oldDate, 'yls', 'claude', 'claude-sonnet-4-5', 1, 1, 0, 10, 5, 0, 0, 0.01]
  )
  recordRequest(db, {
    providerSlug: 'openrouter', target: 'codex', model: 'gpt-5-codex',
    usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.02, statusCode: 200, latencyMs: 100, isStreaming: false,
  })

  const rows = getDailySummary(dir, { days: 30 })
  expect(rows).toHaveLength(1)
  expect(rows[0].providerSlug).toBe('openrouter')
})

test('getDailySummary returns an empty array when the usage database has no rows', () => {
  const rows = getDailySummary(dir)
  expect(rows).toEqual([])
})

test('getRecentRequests returns rows newest-first, mapped to camelCase', () => {
  const db = openUsageDb(dir)
  db.run(
    `INSERT INTO request_logs (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['2026-07-01T00:00:00Z', 'provider-a', 'claude', 'claude-3-5-sonnet', 100, 50, 0, 0, 0.005, 200, 1200, 1, 0]
  )
  db.run(
    `INSERT INTO request_logs (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['2026-07-02T00:00:00Z', 'provider-b', 'codex', 'gpt-4o', 200, 100, 0, 0, null, 502, 800, 0, 1]
  )

  const rows = getRecentRequests(dir)

  expect(rows).toHaveLength(2)
  expect(rows[0]).toEqual({
    id: rows[0]!.id,
    createdAt: '2026-07-02T00:00:00Z',
    providerSlug: 'provider-b',
    target: 'codex',
    model: 'gpt-4o',
    inputTokens: 200,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: null,
    statusCode: 502,
    latencyMs: 800,
    isStreaming: false,
    isFallback: true,
  })
  expect(rows[1]!.providerSlug).toBe('provider-a')
  expect(rows[1]!.isFallback).toBe(false)
  expect(rows[1]!.isStreaming).toBe(true)
})

test('getRecentRequests respects the limit option', () => {
  const db = openUsageDb(dir)
  for (let i = 0; i < 5; i++) {
    db.run(
      `INSERT INTO request_logs (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`2026-07-0${i + 1}T00:00:00Z`, 'provider-a', 'claude', 'claude-3-5-sonnet', 1, 1, 0, 0, 0.001, 200, 100, 0, 0]
    )
  }

  const rows = getRecentRequests(dir, { limit: 2 })

  expect(rows).toHaveLength(2)
})

test('getRecentRequests defaults to a limit of 20', () => {
  const db = openUsageDb(dir)
  for (let i = 0; i < 25; i++) {
    db.run(
      `INSERT INTO request_logs (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`2026-07-${String(i + 1).padStart(2, '0')}T00:00:00Z`, 'provider-a', 'claude', 'claude-3-5-sonnet', 1, 1, 0, 0, 0.001, 200, 100, 0, 0]
    )
  }

  const rows = getRecentRequests(dir)

  expect(rows).toHaveLength(20)
})
