import type { ProviderAuthType } from '../config/provider'
import { applyModelMapping } from './model-mapping'
import { isModelAllowed } from './model-whitelist'

export interface ForwardTarget {
  baseUrl: string
  apiKey: string
  authType?: ProviderAuthType
  modelMapping?: Record<string, string>
}

function buildAuthHeaders(apiKey: string, authType: ProviderAuthType | undefined): Record<string, string> {
  if (authType === 'anthropic') {
    return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  }
  if (authType && typeof authType === 'object') {
    return { [authType.header]: apiKey }
  }
  return { Authorization: `Bearer ${apiKey}` }
}

export async function forwardRequest(
  path: string,
  body: unknown,
  target: ForwardTarget,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const mappedBody = applyModelMapping(body, target.modelMapping)
  const headers = {
    'Content-Type': 'application/json',
    ...buildAuthHeaders(target.apiKey, target.authType),
  }

  return fetchImpl(`${target.baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(mappedBody),
  })
}

export interface FailoverCandidate {
  slug: string
  connection: ForwardTarget
  endpointPath?: string
  whitelist?: string[]
}

export interface FailoverResult {
  response: Response
  usedSlug: string
  isFallback: boolean
}

export async function forwardWithFailover(
  defaultPath: string,
  body: unknown,
  requestedModel: string | undefined,
  candidates: FailoverCandidate[],
  fetchImpl: typeof fetch = fetch
): Promise<FailoverResult> {
  let lastResponse: Response | undefined
  let lastIndex = 0

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!
    lastIndex = i

    if (requestedModel && !isModelAllowed(requestedModel, candidate.whitelist)) {
      lastResponse = Response.json(
        { error: `model ${requestedModel} is not in the whitelist for provider ${candidate.slug}` },
        { status: 403 }
      )
      continue
    }

    let response: Response
    try {
      response = await forwardRequest(candidate.endpointPath || defaultPath, body, candidate.connection, fetchImpl)
    } catch (err) {
      lastResponse = Response.json(
        { error: `upstream request to ${candidate.slug} failed: ${String(err)}` },
        { status: 502 }
      )
      continue
    }

    if (response.status >= 500) {
      lastResponse = response
      continue
    }

    return { response, usedSlug: candidate.slug, isFallback: i > 0 }
  }

  return { response: lastResponse!, usedSlug: candidates[lastIndex]!.slug, isFallback: lastIndex > 0 }
}
