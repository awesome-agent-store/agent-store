import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { ModelPricing } from '@aas/types'

export type { ModelPricing } from '@aas/types'

export type ProviderAuthType = 'bearer' | 'anthropic' | { header: string }

export interface ProviderConnection {
  apiKey?: string
  baseUrl?: string
  authType?: ProviderAuthType
  modelMapping?: Record<string, string>
  pricingUrl?: string
  pricing?: Record<string, ModelPricing>
  homepage?: string
  endpointPath?: string
  upstreamProtocol?: string
  level?: number
  whitelist?: string[]
  healthCheck?: boolean
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function readAuthType(value: unknown): ProviderAuthType | undefined {
  if (value === 'bearer' || value === 'anthropic') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const header = readString((value as Record<string, unknown>)['header'])
    if (header) return { header }
  }
  return undefined
}

function readModelMapping(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return undefined
  if (entries.some(([, v]) => typeof v !== 'string')) return undefined
  return Object.fromEntries(entries) as Record<string, string>
}

function readModelPricing(value: unknown): ModelPricing | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  if (typeof raw['input'] !== 'number' || typeof raw['output'] !== 'number') return undefined
  const pricing: ModelPricing = { input: raw['input'], output: raw['output'] }
  if (typeof raw['cacheRead'] === 'number') pricing.cacheRead = raw['cacheRead']
  if (typeof raw['cacheWrite'] === 'number') pricing.cacheWrite = raw['cacheWrite']
  return pricing
}

function readPricing(value: unknown): Record<string, ModelPricing> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return undefined
  const result: Record<string, ModelPricing> = {}
  for (const [model, raw] of entries) {
    const pricing = readModelPricing(raw)
    if (!pricing) return undefined
    result[model] = pricing
  }
  return result
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  if (value.some((entry) => typeof entry !== 'string')) return undefined
  return value as string[]
}

export async function readProviderConnection(itemDir: string): Promise<ProviderConnection> {
  try {
    const raw = JSON.parse(await readFile(join(itemDir, 'config.json'), 'utf-8')) as Record<string, unknown>
    return {
      apiKey: readString(raw['apiKey']) ?? readString(raw['token']),
      baseUrl:
        readString(raw['baseUrl']) ??
        readString(raw['apiUrl']) ??
        readString(raw['endpoint']) ??
        'https://api.openai.com/v1',
      authType: readAuthType(raw['authType']),
      modelMapping: readModelMapping(raw['modelMapping']),
      pricingUrl: readString(raw['pricingUrl']),
      pricing: readPricing(raw['pricing']),
      homepage: readString(raw['homepage']),
      endpointPath: readString(raw['endpointPath']),
      upstreamProtocol: readString(raw['upstreamProtocol']),
      level: readNumber(raw['level']),
      whitelist: readStringArray(raw['whitelist']),
      healthCheck: readBoolean(raw['healthCheck']),
    }
  } catch {
    return {}
  }
}

export async function duplicateProviderConnection(
  sourceDir: string,
  targetDir: string,
  newSlug: string
): Promise<void> {
  await mkdir(targetDir, { recursive: true })

  const manifestRaw = JSON.parse(
    await readFile(join(sourceDir, 'manifest.json'), 'utf-8')
  ) as Record<string, unknown>
  const manifest = {
    ...manifestRaw,
    slug: newSlug,
    id: newSlug,
    name: `${String(manifestRaw['name'])} 副本`,
  }
  await writeFile(join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  let config = '{}'
  try {
    config = await readFile(join(sourceDir, 'config.json'), 'utf-8')
  } catch {
    // source has no config.json — fall back to an empty object
  }
  await writeFile(join(targetDir, 'config.json'), config)
}
