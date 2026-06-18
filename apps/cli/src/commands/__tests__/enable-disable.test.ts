import { test, expect } from 'bun:test'
import { runEnable } from '../enable'
import { runDisable } from '../disable'
import type { AASEngine } from '@aas/types'

function makeEngine(enableFn = async () => {}, disableFn = async () => {}): AASEngine {
  return { enable: enableFn, disable: disableFn } as unknown as AASEngine
}

test('runEnable enables for specified target', async () => {
  let called = false
  const engine = makeEngine(async (s, t) => { called = true; expect(s).toBe('test-mcp'); expect(t).toBe('claude') })
  await runEnable(engine, ['test-mcp', '--for', 'claude'], () => {})
  expect(called).toBe(true)
})

test('runEnable shows success message', async () => {
  const lines: string[] = []
  await runEnable(makeEngine(), ['test-mcp', '--for', 'claude'], s => lines.push(s))
  expect(lines.join('\n')).toContain('enabled')
})

test('runEnable shows usage when --for missing', async () => {
  const lines: string[] = []
  await runEnable(makeEngine(), ['test-mcp'], s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage')
})

test('runDisable disables for specified target', async () => {
  let called = false
  const engine = makeEngine(async () => {}, async (s, t) => { called = true; expect(t).toBe('codex') })
  await runDisable(engine, ['test-mcp', '--for', 'codex'], () => {})
  expect(called).toBe(true)
})

test('runDisable shows success message', async () => {
  const lines: string[] = []
  await runDisable(makeEngine(), ['test-mcp', '--for', 'claude'], s => lines.push(s))
  expect(lines.join('\n')).toContain('disabled')
})

test('runDisable shows usage when --for missing', async () => {
  const lines: string[] = []
  await runDisable(makeEngine(), ['test-mcp'], s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage')
})
