/**
 * Sync Waffo product prices to the site's pricing page:
 *   Pro monthly $9.99, Pro yearly $99, Lifetime (one-time) $199.
 * Updates existing products in place (no duplicates). Product ids are the same
 * values stored as the API worker's WAFFO_PRODUCT_ID_* secrets.
 *
 *   WAFFO_MERCHANT_ID=... WAFFO_PRIVATE_KEY_PATH=/abs/key.pem \
 *   WAFFO_MONTHLY_ID=PROD_... WAFFO_YEARLY_ID=PROD_... WAFFO_LIFETIME_ID=PROD_... \
 *   bun run scripts/waffo-pricing.ts
 */
import { readFileSync } from 'fs'
import { WaffoPancake } from '@waffo/pancake-ts'
import { PRICING, formatPrice } from '@as/types'

const env = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`Set ${k}`)
  return v
}
const client = new WaffoPancake({
  merchantId: env('WAFFO_MERCHANT_ID'),
  privateKey: readFileSync(env('WAFFO_PRIVATE_KEY_PATH'), 'utf-8'),
})

await client.subscriptionProducts.update({
  id: env('WAFFO_MONTHLY_ID'),
  prices: { USD: { amount: PRICING.monthly.amount, taxIncluded: true, taxCategory: PRICING.monthly.taxCategory } },
  metadata: { trialDays: PRICING.trialDays },
})
await client.subscriptionProducts.update({
  id: env('WAFFO_YEARLY_ID'),
  prices: { USD: { amount: PRICING.yearly.amount, taxIncluded: true, taxCategory: PRICING.yearly.taxCategory } },
  metadata: { trialDays: PRICING.trialDays },
})
await client.onetimeProducts.update({
  id: env('WAFFO_LIFETIME_ID'),
  prices: { USD: { amount: PRICING.lifetime.amount, taxIncluded: true, taxCategory: PRICING.lifetime.taxCategory } },
})

console.log('---RESULT---')
console.log(`monthly -> ${formatPrice('monthly')}, yearly -> ${formatPrice('yearly')}, lifetime -> ${formatPrice('lifetime')} (trial ${PRICING.trialDays}d)`)
