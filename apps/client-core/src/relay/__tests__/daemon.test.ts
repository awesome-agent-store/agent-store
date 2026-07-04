import { test, expect } from 'bun:test'
import { reconcileRelayInstances, runRelayDaemon, type RunningRelayInstance } from '../daemon'
import type { LocalRelayConfig } from '@aas/types'

function config(id: string, port: number, enabled = true, name = id): LocalRelayConfig {
  return { id, name, port, enabled }
}

test('starts an instance for a new enabled config', () => {
  const running = new Map<string, RunningRelayInstance>()
  const started: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    started.push(cfg.id)
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }

  reconcileRelayInstances([config('a', 18780)], running, start)

  expect(started).toEqual(['a'])
  expect(running.has('a')).toBe(true)
  expect(running.get('a')!.port).toBe(18780)
})

test('does not restart an already-running instance whose config is unchanged', () => {
  const running = new Map<string, RunningRelayInstance>()
  const started: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    started.push(cfg.id)
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }

  reconcileRelayInstances([config('a', 18780)], running, start)
  reconcileRelayInstances([config('a', 18780)], running, start)

  expect(started).toEqual(['a'])
})

test('stops an instance when its config is removed', () => {
  const running = new Map<string, RunningRelayInstance>()
  const stopped: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => ({
    id: cfg.id, port: cfg.port, stop: () => stopped.push(cfg.id),
  })

  reconcileRelayInstances([config('a', 18780)], running, start)
  reconcileRelayInstances([], running, start)

  expect(stopped).toEqual(['a'])
  expect(running.has('a')).toBe(false)
})

test('stops an instance when its config is disabled', () => {
  const running = new Map<string, RunningRelayInstance>()
  const stopped: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => ({
    id: cfg.id, port: cfg.port, stop: () => stopped.push(cfg.id),
  })

  reconcileRelayInstances([config('a', 18780, true)], running, start)
  reconcileRelayInstances([config('a', 18780, false)], running, start)

  expect(stopped).toEqual(['a'])
  expect(running.has('a')).toBe(false)
})

test('restarts an instance when its port changes', () => {
  const running = new Map<string, RunningRelayInstance>()
  const stopped: number[] = []
  const started: number[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    started.push(cfg.port)
    return { id: cfg.id, port: cfg.port, stop: () => stopped.push(cfg.port) }
  }

  reconcileRelayInstances([config('a', 18780)], running, start)
  reconcileRelayInstances([config('a', 18880)], running, start)

  expect(stopped).toEqual([18780])
  expect(started).toEqual([18780, 18880])
  expect(running.get('a')!.port).toBe(18880)
})

test('handles multiple configs independently', () => {
  const running = new Map<string, RunningRelayInstance>()
  const started: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    started.push(cfg.id)
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }

  reconcileRelayInstances([config('a', 18780), config('b', 18880)], running, start)

  expect(started).toEqual(['a', 'b'])
  expect(running.size).toBe(2)
})

test('a start failure for one config does not prevent other configs from starting, and does not throw', () => {
  const running = new Map<string, RunningRelayInstance>()
  const started: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    if (cfg.id === 'bad') throw new Error('EADDRINUSE: address already in use')
    started.push(cfg.id)
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }

  expect(() => {
    reconcileRelayInstances([config('good', 18780), config('bad', 18880)], running, start)
  }).not.toThrow()

  expect(started).toEqual(['good'])
  expect(running.has('good')).toBe(true)
  expect(running.has('bad')).toBe(false)
})

test('a config that failed to start is retried on the next reconcile call', () => {
  const running = new Map<string, RunningRelayInstance>()
  let shouldFail = true
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    if (shouldFail) throw new Error('EADDRINUSE')
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }

  reconcileRelayInstances([config('a', 18780)], running, start)
  expect(running.has('a')).toBe(false)

  shouldFail = false
  reconcileRelayInstances([config('a', 18780)], running, start)
  expect(running.has('a')).toBe(true)
})

test('runRelayDaemon starts a real server per enabled config and stops it on abort', async () => {
  const { mkdtemp, rm, writeFile } = await import('fs/promises')
  const { join } = await import('path')
  const aasHome = await mkdtemp('/tmp/aas-daemon-test-')

  try {
    await writeFile(
      join(aasHome, 'relay-configs.json'),
      JSON.stringify([{ id: 'a', name: 'A', port: 0, enabled: true }])
    )

    const controller = new AbortController()
    const daemonPromise = runRelayDaemon(aasHome, { pollIntervalMs: 20, signal: controller.signal })

    await new Promise((resolve) => setTimeout(resolve, 60))

    controller.abort()
    await daemonPromise
  } finally {
    await rm(aasHome, { recursive: true, force: true })
  }
})
