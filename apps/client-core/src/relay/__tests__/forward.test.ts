import { test, expect, mock } from 'bun:test'
import { forwardRequest, forwardWithFailover } from '../forward'

function fakeFetch(capture: { url?: string; init?: RequestInit }) {
  return (async (url: string, init?: RequestInit) => {
    capture.url = url
    capture.init = init
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }) as typeof fetch
}

test('default authType (bearer) sets an Authorization header', async () => {
  const capture: { url?: string; init?: RequestInit } = {}
  await forwardRequest('/v1/messages', { model: 'x' }, { baseUrl: 'https://api.example.com', apiKey: 'sk-test' }, fakeFetch(capture))
  const headers = new Headers(capture.init?.headers)
  expect(capture.url).toBe('https://api.example.com/v1/messages')
  expect(headers.get('Authorization')).toBe('Bearer sk-test')
})

test('anthropic authType sets x-api-key and anthropic-version', async () => {
  const capture: { url?: string; init?: RequestInit } = {}
  await forwardRequest('/v1/messages', { model: 'x' }, { baseUrl: 'https://api.example.com', apiKey: 'sk-test', authType: 'anthropic' }, fakeFetch(capture))
  const headers = new Headers(capture.init?.headers)
  expect(headers.get('x-api-key')).toBe('sk-test')
  expect(headers.get('anthropic-version')).toBe('2023-06-01')
  expect(headers.get('Authorization')).toBeNull()
})

test('custom header authType sets the named header', async () => {
  const capture: { url?: string; init?: RequestInit } = {}
  await forwardRequest('/v1/messages', { model: 'x' }, { baseUrl: 'https://api.example.com', apiKey: 'sk-test', authType: { header: 'X-Custom-Key' } }, fakeFetch(capture))
  const headers = new Headers(capture.init?.headers)
  expect(headers.get('X-Custom-Key')).toBe('sk-test')
})

test('applies model mapping to the forwarded body', async () => {
  const capture: { url?: string; init?: RequestInit } = {}
  await forwardRequest(
    '/v1/messages',
    { model: 'claude-3-5-sonnet' },
    { baseUrl: 'https://api.example.com', apiKey: 'sk-test', modelMapping: { 'claude-3-5-sonnet': 'gpt-4o' } },
    fakeFetch(capture)
  )
  const sentBody = JSON.parse(capture.init?.body as string) as { model: string }
  expect(sentBody.model).toBe('gpt-4o')
})

test('returns the raw Response from the upstream call', async () => {
  const response = await forwardRequest('/v1/messages', { model: 'x' }, { baseUrl: 'https://api.example.com', apiKey: 'sk-test' }, fakeFetch({}))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
})

test('forwardWithFailover uses the first candidate when it succeeds', async () => {
  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages',
    { model: 'claude-3-5-sonnet' },
    'claude-3-5-sonnet',
    [
      { slug: 'primary', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' } },
      { slug: 'backup', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(calls).toEqual(['https://primary.example/v1/messages'])
  expect(result.usedSlug).toBe('primary')
  expect(result.isFallback).toBe(false)
  expect(result.response.status).toBe(200)
})

test('forwardWithFailover falls back to the next candidate on a network error', async () => {
  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    if (url.startsWith('https://primary')) throw new Error('connect timeout')
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages',
    { model: 'claude-3-5-sonnet' },
    'claude-3-5-sonnet',
    [
      { slug: 'primary', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' } },
      { slug: 'backup', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(calls).toEqual(['https://primary.example/v1/messages', 'https://backup.example/v1/messages'])
  expect(result.usedSlug).toBe('backup')
  expect(result.isFallback).toBe(true)
  expect(result.response.status).toBe(200)
})

test('forwardWithFailover falls back to the next candidate on a 5xx response', async () => {
  const fetchImpl = (async (url: string) => {
    if (url.startsWith('https://primary')) return new Response('boom', { status: 502 })
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages', {}, undefined,
    [
      { slug: 'primary', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' } },
      { slug: 'backup', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(result.usedSlug).toBe('backup')
  expect(result.isFallback).toBe(true)
})

test('forwardWithFailover does not fall back on an ordinary 4xx response (e.g. 400)', async () => {
  // 400 is a client error, not a provider-health failure — classifyOutcome returns
  // null, so it is returned to the caller as-is rather than triggering failover.
  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('bad request', { status: 400 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages', {}, undefined,
    [
      { slug: 'primary', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' } },
      { slug: 'backup', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(calls).toEqual(['https://primary.example/v1/messages'])
  expect(result.usedSlug).toBe('primary')
  expect(result.isFallback).toBe(false)
  expect(result.response.status).toBe(400)
})

test.each([
  ['401 (auth)', 401],
  ['403 (auth)', 403],
  ['429 (rate limit)', 429],
])('forwardWithFailover falls back to the next candidate on a %s response', async (_label, status) => {
  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    if (url.startsWith('https://primary')) return new Response('nope', { status })
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages', {}, undefined,
    [
      { slug: 'primary', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' } },
      { slug: 'backup', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(calls).toEqual(['https://primary.example/v1/messages', 'https://backup.example/v1/messages'])
  expect(result.usedSlug).toBe('backup')
  expect(result.isFallback).toBe(true)
  expect(result.response.status).toBe(200)
})

test('forwardWithFailover returns the last 401 when every candidate returns 401', async () => {
  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('unauthorized', { status: 401 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages', {}, undefined,
    [
      { slug: 'primary', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' } },
      { slug: 'backup', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(calls).toEqual(['https://primary.example/v1/messages', 'https://backup.example/v1/messages'])
  expect(result.usedSlug).toBe('backup')
  expect(result.isFallback).toBe(true)
  expect(result.response.status).toBe(401)
})

test('forwardWithFailover returns the last response when every candidate fails', async () => {
  const fetchImpl = (async (_url: string) => new Response('down', { status: 503 })) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages', {}, undefined,
    [
      { slug: 'primary', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' } },
      { slug: 'backup', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(result.usedSlug).toBe('backup')
  expect(result.isFallback).toBe(true)
  expect(result.response.status).toBe(503)
})

test('forwardWithFailover skips a candidate whose whitelist rejects the model', async () => {
  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages', { model: 'gpt-4o' }, 'gpt-4o',
    [
      { slug: 'claude-only', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' }, whitelist: ['claude-*'] },
      { slug: 'any-model', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(calls).toEqual(['https://backup.example/v1/messages'])
  expect(result.usedSlug).toBe('any-model')
  expect(result.isFallback).toBe(true)
})

test('forwardWithFailover returns a synthesized 403 when every candidate rejects the model', async () => {
  let called = false
  const fetchImpl = (async (_url: string) => {
    called = true
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages', { model: 'gpt-4o' }, 'gpt-4o',
    [{ slug: 'claude-only', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' }, whitelist: ['claude-*'] }],
    fetchImpl
  )

  expect(called).toBe(false)
  expect(result.usedSlug).toBe('claude-only')
  expect(result.isFallback).toBe(false)
  expect(result.response.status).toBe(403)
})

test('forwardWithFailover uses a candidate\'s own endpointPath override instead of the default path', async () => {
  let capturedUrl = ''
  const fetchImpl = (async (url: string) => {
    capturedUrl = url
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  await forwardWithFailover(
    '/v1/messages', {}, undefined,
    [{ slug: 'custom', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' }, endpointPath: '/v1/chat/completions' }],
    fetchImpl
  )

  expect(capturedUrl).toBe('https://primary.example/v1/chat/completions')
})
