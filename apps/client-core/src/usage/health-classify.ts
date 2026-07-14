export type HealthErrorKind = 'auth' | 'rate_limit' | 'overload' | 'server' | 'network'

/** Classify an attempt outcome. Returns null for outcomes that are not a provider-health failure. */
export function classifyOutcome(statusCode: number | null): HealthErrorKind | null {
  if (statusCode === null) return 'network'
  if (statusCode === 401 || statusCode === 403) return 'auth'
  if (statusCode === 429) return 'rate_limit'
  if (statusCode === 503 || statusCode === 529) return 'overload'
  if (statusCode >= 500) return 'server'
  return null // 2xx/3xx and ordinary 4xx are not provider-health failures
}
