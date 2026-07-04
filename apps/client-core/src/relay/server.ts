import type { InstalledItem, RegistryJson, ToolTarget } from '@aas/types'
import { readRegistry } from '../registry/index'
import { itemDir } from '../paths'
import { readProviderConnection } from '../config/provider'
import { forwardRequest } from './forward'
import { recordUsageAsync } from '../usage/record-usage'
import { isModelAllowed } from './model-whitelist'

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

function findActiveProviderForTarget(registry: RegistryJson, target: ToolTarget): InstalledItem | undefined {
  return registry.installed.find(
    (entry) =>
      entry.category === 'provider' &&
      entry.compatibleWith.includes(target) &&
      entry.enabledFor[target] === true
  )
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

      const registry = await readRegistry(aasHome)
      const provider = findActiveProviderForTarget(registry, target)
      if (!provider) {
        return Response.json({ error: `no active provider for ${target}` }, { status: 503 })
      }

      const connection = await readProviderConnection(itemDir(aasHome, 'provider', provider.slug))
      if (!connection.apiKey || !connection.baseUrl) {
        return Response.json({ error: `provider ${provider.slug} is missing apiKey or baseUrl` }, { status: 503 })
      }

      const body = await req.json().catch(() => ({}))
      const requestedModelForGate = typeof (body as Record<string, unknown>)['model'] === 'string'
        ? (body as Record<string, unknown>)['model'] as string
        : undefined
      if (requestedModelForGate && !isModelAllowed(requestedModelForGate, connection.whitelist)) {
        return Response.json(
          { error: `model ${requestedModelForGate} is not in the whitelist for provider ${provider.slug}` },
          { status: 403 }
        )
      }

      const forwardPath = connection.endpointPath || url.pathname
      const startedAt = Date.now()
      const upstreamResponse = await forwardRequest(
        forwardPath,
        body,
        {
          baseUrl: connection.baseUrl,
          apiKey: connection.apiKey,
          authType: connection.authType,
          modelMapping: connection.modelMapping,
        },
        fetchImpl
      )

      const contentType = upstreamResponse.headers.get('content-type') ?? ''
      const isStreaming = contentType.includes('text/event-stream')
      const requestedModel = typeof (body as Record<string, unknown>)['model'] === 'string'
        ? (body as Record<string, unknown>)['model'] as string
        : 'unknown'

      if (upstreamResponse.body) {
        const [clientStream, usageStream] = upstreamResponse.body.tee()
        void recordUsageAsync({
          aasHome, providerSlug: provider.slug, target, model: requestedModel,
          pricing: connection.pricing, bodyStream: usageStream, isStreaming,
          statusCode: upstreamResponse.status, startedAt,
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
