import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { openUsageDb } from '../db'
import { recordUsageAsync } from '../record-usage'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp('/tmp/aas-record-usage-test-')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

test('recordUsageAsync parses a non-streaming Claude response and writes a priced row', async () => {
  const body = JSON.stringify({ usage: { input_tokens: 100, output_tokens: 50 } })
  await recordUsageAsync({
    aasHome: dir, providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
    pricing: { 'claude-sonnet-4-5': { input: 3, output: 15 } },
    bodyStream: streamOf(body), isStreaming: false, statusCode: 200, startedAt: Date.now() - 500,
  })
  const db = openUsageDb(dir)
  const rows = db.query('SELECT * FROM request_logs').all() as Array<{ provider_slug: string; input_tokens: number; cost_usd: number }>
  expect(rows).toHaveLength(1)
  expect(rows[0].provider_slug).toBe('yls')
  expect(rows[0].input_tokens).toBe(100)
  expect(rows[0].cost_usd).toBeGreaterThan(0)
})

test('recordUsageAsync parses a streaming OpenAI response', async () => {
  const body = [
    'event: response.completed',
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5}}}',
    '',
  ].join('\n')
  await recordUsageAsync({
    aasHome: dir, providerSlug: 'openrouter', target: 'codex', model: 'gpt-5-codex',
    pricing: undefined,
    bodyStream: streamOf(body), isStreaming: true, statusCode: 200, startedAt: Date.now() - 200,
  })
  const db = openUsageDb(dir)
  const rows = db.query('SELECT * FROM request_logs').all() as Array<{ output_tokens: number; cost_usd: number | null }>
  expect(rows).toHaveLength(1)
  expect(rows[0].output_tokens).toBe(5)
  expect(rows[0].cost_usd).toBeNull()
})

test('recordUsageAsync never throws even when the stream body is garbage', async () => {
  await expect(
    recordUsageAsync({
      aasHome: dir, providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
      pricing: undefined, bodyStream: streamOf('not json at all'), isStreaming: false,
      statusCode: 500, startedAt: Date.now(),
    })
  ).resolves.toBeUndefined()
})
