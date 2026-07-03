import type { ProviderAuthType } from '../config/provider'
import { applyModelMapping } from './model-mapping'

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
