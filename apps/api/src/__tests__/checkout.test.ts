import { test, expect, mock } from 'bun:test'

// Replace the Waffo module so we can capture what createSession receives without
// hitting the live payment API. wantsTrial keeps its real rule (no trial for lifetime).
let lastSession: Record<string, unknown> | null = null
mock.module('../waffo', () => ({
  proProductId: (_env: unknown, plan: string) => (plan === 'lifetime' ? 'prod_life' : 'prod_sub'),
  getWaffoClient: () => ({
    checkout: {
      createSession: async (args: Record<string, unknown>) => {
        lastSession = args
        return { checkoutUrl: 'https://pay.example/cs', sessionId: 'cs_1' }
      },
    },
  }),
  checkoutSuccessUrl: () => 'https://store.example/thanks',
  wantsTrial: (plan: string, trial: boolean | undefined) => trial === true && plan !== 'lifetime',
}))

const { app } = await import('../app')

async function checkout(body: unknown) {
  lastSession = null
  return app.fetch(
    new Request('http://localhost/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

test('a trial checkout for a subscription passes withTrial to Waffo', async () => {
  const res = await checkout({ period: 'monthly', trial: true, email: 'a@b.co' })
  expect(res.status).toBe(200)
  expect(lastSession?.['withTrial']).toBe(true)
  expect(lastSession?.['productId']).toBe('prod_sub')
})

test('lifetime never starts a trial even when requested', async () => {
  const res = await checkout({ period: 'lifetime', trial: true, email: 'a@b.co' })
  expect(res.status).toBe(200)
  expect(lastSession?.['withTrial']).toBeUndefined()
  expect(lastSession?.['productId']).toBe('prod_life')
})

test('a non-trial checkout omits withTrial', async () => {
  const res = await checkout({ period: 'monthly', email: 'a@b.co' })
  expect(res.status).toBe(200)
  expect(lastSession?.['withTrial']).toBeUndefined()
})
