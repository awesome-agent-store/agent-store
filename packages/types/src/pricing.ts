/**
 * Single source of truth for Pro pricing. Consumed by the store pricing page,
 * the checkout API, and the Waffo product-setup scripts so the three never drift
 * (a hardcoded price in one place silently disagreeing with another has bitten us
 * before). Amounts are display amounts in USD (Waffo wants "9.99", not cents).
 */
export const PRICING = {
  currency: 'USD',
  /** Free-trial length in days for the Pro subscription (monthly/yearly). 0 disables it. */
  trialDays: 14,
  monthly: { amount: '9.99', taxCategory: 'saas' },
  yearly: { amount: '99.00', taxCategory: 'saas' },
  lifetime: { amount: '199.00', taxCategory: 'software' },
} as const

export type BillingPeriod = 'monthly' | 'yearly' | 'lifetime'

/** Display price like "$9.99" (keeps cents) / "$99" (drops trailing .00). */
export function formatPrice(period: BillingPeriod): string {
  const n = Number(PRICING[period].amount)
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`
}
