import type { LocalRelayConfig } from '@aas/types'
import { listLocalConfigs } from './local-configs'
import { startRelayServer } from './server'

export interface RunningRelayInstance {
  id: string
  port: number
  stop: () => void
}

export function reconcileRelayInstances(
  desired: LocalRelayConfig[],
  running: Map<string, RunningRelayInstance>,
  start: (config: LocalRelayConfig) => RunningRelayInstance
): void {
  const desiredEnabled = new Map(desired.filter((c) => c.enabled).map((c) => [c.id, c]))

  for (const [id, instance] of running) {
    const desiredConfig = desiredEnabled.get(id)
    if (!desiredConfig || desiredConfig.port !== instance.port) {
      instance.stop()
      running.delete(id)
    }
  }

  for (const [id, cfg] of desiredEnabled) {
    if (!running.has(id)) {
      try {
        running.set(id, start(cfg))
      } catch (err) {
        console.error(`[relay-daemon] failed to start local relay config "${cfg.name}" (${id}) on port ${cfg.port}:`, err)
      }
    }
  }
}

export async function runRelayDaemon(
  aasHome: string,
  options: { pollIntervalMs?: number; signal?: AbortSignal } = {}
): Promise<void> {
  const { pollIntervalMs = 3000, signal } = options
  const running = new Map<string, RunningRelayInstance>()
  const start = (config: LocalRelayConfig): RunningRelayInstance => {
    const server = startRelayServer({ aasHome, port: config.port })
    return { id: config.id, port: server.port, stop: server.stop }
  }

  while (!signal?.aborted) {
    const desired = await listLocalConfigs(aasHome)
    reconcileRelayInstances(desired, running, start)
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  for (const instance of running.values()) instance.stop()
}
