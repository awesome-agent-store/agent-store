import { test, expect, mock, spyOn, afterEach } from 'bun:test'
import { Command } from '@tauri-apps/plugin-shell'

afterEach(() => { mock.restore() })

function mockSidecar(stdout: string, code = 0) {
  spyOn(Command, 'sidecar').mockImplementation((() => ({
    execute: async () => ({ code, stdout, stderr: '' }),
  })) as unknown as typeof Command.sidecar)
}

test('callRpc resolves data on ok:true', async () => {
  mockSidecar(JSON.stringify({ ok: true, data: { slug: 'openai-provider' } }))
  const { callRpc } = await import('../rpc')
  const result = await callRpc<{ slug: string }>('install', ['openai-provider'])
  expect(result.slug).toBe('openai-provider')
})

test('callRpc rejects with the sidecar error message on ok:false', async () => {
  mockSidecar(JSON.stringify({ ok: false, error: 'Item not installed: foo' }))
  const { callRpc } = await import('../rpc')
  await expect(callRpc('info', ['foo'])).rejects.toThrow('Item not installed: foo')
})

test('callRpc rejects when sidecar stdout is not valid JSON', async () => {
  mockSidecar('not json')
  const { callRpc } = await import('../rpc')
  await expect(callRpc('list')).rejects.toThrow()
})

test('callRpc defaults args to an empty array', async () => {
  let capturedArgs: string[] = []
  spyOn(Command, 'sidecar').mockImplementation(((_bin: string, args: string[]) => {
    capturedArgs = args
    return { execute: async () => ({ code: 0, stdout: JSON.stringify({ ok: true, data: [] }), stderr: '' }) }
  }) as unknown as typeof Command.sidecar)
  const { callRpc } = await import('../rpc')
  await callRpc('list')
  expect(capturedArgs).toEqual(['__rpc', 'list', '[]'])
})
