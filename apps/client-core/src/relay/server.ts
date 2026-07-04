import type { RegistryJson, ToolTarget } from '@aas/types'
import { readRegistry } from '../registry/index'
import { findOrderedProvidersForTarget } from './provider-order'
import { forwardWithFailover } from './forward'
import { recordUsageAsync } from '../usage/record-usage'

export const RELAY_PORT = 18780

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

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(req) {
      const url = new URL(req.url)
      const target = ROUTES[url.pathname]
      if (!target) return new Response('Not found', { status: 404 })

      const registry: RegistryJson = await readRegistry(aasHome)
      const candidates = await findOrderedProvidersForTarget(aasHome, registry, target)
      const eligible = candidates.filter(({ connection }) => connection.apiKey && connection.baseUrl)
      if (eligible.length === 0) {
        return Response.json({ error: `no active provider for ${target}` }, { status: 503 })
      }

      const body = await req.json().catch(() => ({}))
      const requestedModel = typeof (body as Record<string, unknown>)['model'] === 'string'
        ? (body as Record<string, unknown>)['model'] as string
        : undefined

      const startedAt = Date.now()
      const { response: upstreamResponse, usedSlug, isFallback } = await forwardWithFailover(
        url.pathname,
        body,
        requestedModel,
        eligible.map(({ item, connection }) => ({
          slug: item.slug,
          connection: {
            baseUrl: connection.baseUrl!,
            apiKey: connection.apiKey!,
            authType: connection.authType,
            modelMapping: connection.modelMapping,
          },
          endpointPath: connection.endpointPath,
          whitelist: connection.whitelist,
        })),
        fetchImpl
      )

      const usedConnection = eligible.find(({ item }) => item.slug === usedSlug)!.connection
      const contentType = upstreamResponse.headers.get('content-type') ?? ''
      const isStreaming = contentType.includes('text/event-stream')

      if (upstreamResponse.body) {
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
