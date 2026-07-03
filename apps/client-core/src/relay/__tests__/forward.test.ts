import { test, expect, mock } from 'bun:test'
import { forwardRequest } from '../forward'

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
