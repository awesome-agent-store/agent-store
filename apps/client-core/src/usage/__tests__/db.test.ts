import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { openUsageDb } from '../db'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp('/tmp/aas-usage-db-test-')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('openUsageDb creates request_logs and daily_rollups tables', () => {
  const db = openUsageDb(dir)
  db.run(
    `INSERT INTO request_logs (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['2026-07-05T00:00:00Z', 'openai-provider', 'codex', 'gpt-5', 10, 20, 0, 0, 0.01, 200, 500, 0, 0]
  )
  const rows = db.query('SELECT * FROM request_logs').all() as Array<{ provider_slug: string }>
  expect(rows).toHaveLength(1)
  expect(rows[0].provider_slug).toBe('openai-provider')

  db.run(
    `INSERT INTO daily_rollups (date, provider_slug, target, model, request_count, success_count, unpriced_request_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['2026-07-05', 'openai-provider', 'codex', 'gpt-5', 1, 1, 0, 10, 20, 0, 0, 0.01]
  )
  const rollups = db.query('SELECT * FROM daily_rollups').all() as Array<{ date: string }>
  expect(rollups).toHaveLength(1)
  expect(rollups[0].date).toBe('2026-07-05')
})

test('openUsageDb is idempotent — calling it twice on the same aasHome does not error', () => {
  openUsageDb(dir)
  expect(() => openUsageDb(dir)).not.toThrow()
})

test('daily_rollups enforces uniqueness on (date, provider_slug, target, model)', () => {
  const db = openUsageDb(dir)
  const insert = () =>
    db.run(
      `INSERT INTO daily_rollups (date, provider_slug, target, model, request_count, success_count, unpriced_request_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ['2026-07-05', 'openai-provider', 'codex', 'gpt-5', 1, 1, 0, 10, 20, 0, 0, 0.01]
    )
  insert()
  expect(insert).toThrow()
})
