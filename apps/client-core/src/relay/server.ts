import type { RegistryJson, ToolTarget } from '@as/types'
import { readRegistry } from '../registry/index'
import { findOrderedProvidersForTarget } from './provider-order'
import { forwardWithFailover } from './forward'
import { recordUsageAsync } from '../usage/record-usage'
import { recordProviderHealthBatch, getCoolingProviderSlugs, type ProviderAttempt } from '../usage/provider-health'
import { resolveEntitlements } from '../entitlement/index'

export const RELAY_PORT = 18780

// Free plan: basic reactive failover across up to two upstreams. Pro's smart
// routing lifts this cap and adds proactive health-aware avoidance.
const FREE_MAX_UPSTREAMS = 2

// Round-robin across a provider's configured keys (Pro key rotation) to spread
// rate limits. Free — or a single key — always uses the first key. The cursor is
// per-relay-process and in memory; restarts simply reset rotation to the first key.
function selectApiKey(
  slug: string,
  conn: { apiKey?: string; apiKeys?: string[] },
  rotate: boolean,
  cursor: Map<string, number>
): string {
  const keys = conn.apiKeys && conn.apiKeys.length > 0 ? conn.apiKeys : conn.apiKey ? [conn.apiKey] : []
  if (keys.length === 0) return ''
  if (!rotate || keys.length === 1) return keys[0]
  const i = cursor.get(slug) ?? 0
  cursor.set(slug, i + 1)
  return keys[i % keys.length]
}

export interface RelayServerOptions {
  aasHome: string
  port?: number
  fetchImpl?: typeof fetch
}

const ROUTES: Record<string, ToolTarget> = {
  '/v1/messages': 'claude',
  '/responses': 'codex',
}

export function startRelayServer(options: RelayServerOptions): { stop: () => void; port: number } {
  const { aasHome, port = RELAY_PORT, fetchImpl } = options
  const keyCursor = new Map<string, number>() // per-provider key-rotation cursor

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(req) {
      const url = new URL(req.url)
      const target = ROUTES[url.pathname]
      if (!target) return new Response('Not found', { status: 404 })

      const registry: RegistryJson = await readRegistry(aasHome)
      const candidates = await findOrderedProvidersForTarget(aasHome, registry, target)
      const eligible = candidates.filter(
        ({ connection }) => (connection.apiKey || (connection.apiKeys?.length ?? 0) > 0) && connection.baseUrl
      )
      if (eligible.length === 0) {
        return Response.json({ error: `no active provider for ${target}` }, { status: 503 })
      }

      // Smart routing (Pro): proactively skip providers currently cooling down and
      // fail over across every configured upstream. If all are cooling, try them
      // anyway (half-open) rather than hard-failing.
      // Free: basic reactive failover across up to FREE_MAX_UPSTREAMS, in order —
      // no proactive avoidance (a cooling provider is just tried and failed over).
      const { smartRouting, keyRotation } = await resolveEntitlements(aasHome)
      let active: typeof eligible
      if (smartRouting) {
        const cooling = getCoolingProviderSlugs(aasHome)
        const avoided = eligible.filter(({ item }) => !cooling.has(item.slug))
        active = avoided.length > 0 ? avoided : eligible
      } else {
        active = eligible.slice(0, FREE_MAX_UPSTREAMS)
      }

      const body = await req.json().catch(() => ({}))
      const requestedModel = typeof (body as Record<string, unknown>)['model'] === 'string'
        ? (body as Record<string, unknown>)['model'] as string
        : undefined

      const startedAt = Date.now()
      const attempts: ProviderAttempt[] = []
      const { response: upstreamResponse, usedSlug, isFallback } = await forwardWithFailover(
        url.pathname,
        body,
        requestedModel,
        active.map(({ item, connection }) => ({
          slug: item.slug,
          connection: {
            baseUrl: connection.baseUrl!,
            apiKey: selectApiKey(item.slug, connection, keyRotation, keyCursor),
            authType: connection.authType,
            modelMapping: connection.modelMapping,
          },
          endpointPath: connection.endpointPath,
          whitelist: connection.whitelist,
        })),
        fetchImpl,
        (attempt) => attempts.push(attempt)
      )
      // Update circuit-breaker health from every attempt (including failed-over ones),
      // off the response path.
      recordProviderHealthBatch(aasHome, attempts)

      const usedConnection = active.find(({ item }) => item.slug === usedSlug)!.connection
      const contentType = upstreamResponse.headers.get('content-type') ?? ''
      const isStreaming = contentType.includes('text/event-stream')

      // Only record usage when a real upstream was dialed. An empty attempts array
      // means every candidate was whitelist-rejected before any request went out
      // (the synthetic 403 below), so there is no upstream call to attribute usage to.
      if (upstreamResponse.body && attempts.length > 0) {
        const [clientStream, usageStream] = upstreamResponse.body.tee()
        void recordUsageAsync({
          aasHome, providerSlug: usedSlug, target, model: requestedModel ?? 'unknown',
          pricing: usedConnection.pricing, bodyStream: usageStream, isStreaming,
          statusCode: upstreamResponse.status, startedAt, isFallback,
        })
        return new Response(clientStream, { status: upstreamResponse.status, headers: upstreamResponse.headers })
      }

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: upstreamResponse.headers,
      })
    },
  })

  return { stop: () => server.stop(true), port: server.port ?? port }
}
