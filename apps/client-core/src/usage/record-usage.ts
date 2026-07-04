import type { ModelPricing } from '../config/provider'
import { openUsageDb } from './db'
import { parseClaudeUsage, parseOpenAIUsage } from './usage-parser'
import { computeCost, recordRequest } from './logger'

export interface RecordUsageAsyncInput {
  aasHome: string
  providerSlug: string
  target: 'claude' | 'codex'
  model: string
  pricing: Record<string, ModelPricing> | undefined
  bodyStream: ReadableStream<Uint8Array>
  isStreaming: boolean
  statusCode: number
  startedAt: number
  isFallback?: boolean
}

export async function recordUsageAsync(input: RecordUsageAsyncInput): Promise<void> {
  try {
    const bodyText = await new Response(input.bodyStream).text()
    const usage = input.target === 'claude'
      ? parseClaudeUsage(bodyText, input.isStreaming)
      : parseOpenAIUsage(bodyText, input.isStreaming)
    const costUsd = computeCost(input.pricing, input.model, usage)
    const db = openUsageDb(input.aasHome)
    recordRequest(db, {
      providerSlug: input.providerSlug,
      target: input.target,
      model: input.model,
      usage,
      costUsd,
      statusCode: input.statusCode,
      latencyMs: Date.now() - input.startedAt,
      isStreaming: input.isStreaming,
      isFallback: input.isFallback,
    })
  } catch (err) {
    console.error('[usage] failed to record request usage:', err)
  }
}
