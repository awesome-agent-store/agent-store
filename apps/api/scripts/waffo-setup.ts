/**
 * One-off Waffo Pancake setup: ensures Pro subscription products exist in the
 * merchant's store and registers the webhook. Credentials come from env so no
 * secret is hardcoded:
 *   WAFFO_MERCHANT_ID=... WAFFO_PRIVATE_KEY_PATH=/abs/key.pem \
 *   [WAFFO_WEBHOOK_URL=...] [WAFFO_TEST=true] bun run scripts/waffo-setup.ts
 */
import { readFileSync } from 'fs'
import { WaffoPancake } from '@waffo/pancake-ts'
import { PRICING } from '@as/types'

const merchantId = process.env['WAFFO_MERCHANT_ID']
const keyPath = process.env['WAFFO_PRIVATE_KEY_PATH']
const webhookUrl = process.env['WAFFO_WEBHOOK_URL'] ?? 'https://as-api-test.phenix3443.workers.dev/api/webhooks/waffo'
const testMode = process.env['WAFFO_TEST'] !== 'false'
if (!merchantId || !keyPath) throw new Error('Set WAFFO_MERCHANT_ID and WAFFO_PRIVATE_KEY_PATH')

const client = new WaffoPancake({ merchantId, privateKey: readFileSync(keyPath, 'utf-8') })

const res = await client.graphql.query<{ stores: Array<{ id: string; name: string; status: string }> }>({
  query: `query { stores { id name status } }`,
})
const stores = res.data?.stores ?? []
console.log('stores:', JSON.stringify(stores))
const store = stores[0]
if (!store) throw new Error('No store found for this merchant')
console.log('using store:', store.id, store.name)

const monthly = await client.subscriptionProducts.create({
  storeId: store.id, name: 'Pro Monthly', billingPeriod: 'monthly' as never,
  prices: { USD: { amount: PRICING.monthly.amount, taxIncluded: true, taxCategory: PRICING.monthly.taxCategory } },
  metadata: { trialDays: PRICING.trialDays },
})
const yearly = await client.subscriptionProducts.create({
  storeId: store.id, name: 'Pro Yearly', billingPeriod: 'yearly' as never,
  prices: { USD: { amount: PRICING.yearly.amount, taxIncluded: true, taxCategory: PRICING.yearly.taxCategory } },
  metadata: { trialDays: PRICING.trialDays },
})

await client.webhooks.add({
  storeId: store.id, channel: 'http', url: webhookUrl, testMode,
  events: [
    'order.completed', 'subscription.activated', 'subscription.payment_succeeded',
    'subscription.canceling', 'subscription.uncanceled', 'subscription.updated',
    'subscription.canceled', 'subscription.past_due',
  ] as never,
})

console.log('---RESULT---')
console.log('STORE_ID=' + store.id)
console.log('MONTHLY_PRODUCT_ID=' + monthly.product.id)
console.log('YEARLY_PRODUCT_ID=' + yearly.product.id)
console.log('WEBHOOK=' + webhookUrl + ' (test=' + testMode + ')')
