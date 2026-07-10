import { test, expect, mock } from 'bun:test'

// Replace the Waffo module so we can capture which checkout path ran and with
// what params, without hitting the live payment API. wantsTrial keeps its real
// rule (no trial for lifetime).
let lastCall: { method: 'authenticated' | 'anonymous'; args: Record<string, unknown> } | null = null
mock.module('../waffo', () => ({
  proProductId: (_env: unknown, plan: string) => (plan === 'lifetime' ? 'prod_life' : 'prod_sub'),
  getWaffoClient: () => ({
    checkout: {
      authenticated: {
        create: async (args: Record<string, unknown>) => {
          lastCall = { method: 'authenticated', args }
          return { checkoutUrl: 'https://pay.example/auth', sessionId: 'cs_auth' }
        },
      },
      anonymous: {
        create: async (args: Record<string, unknown>) => {
          lastCall = { method: 'anonymous', args }
          return { checkoutUrl: 'https://pay.example/anon', sessionId: 'cs_anon' }
        },
      },
    },
  }),
  checkoutSuccessUrl: () => 'https://store.example/thanks',
  wantsTrial: (plan: string, trial: boolean | undefined) => trial === true && plan !== 'lifetime',
}))

// Resolve a signed-in user only for the `good-token` bearer; anything else is anonymous.
mock.module('../auth', () => ({
  getAuthUser: async (_env: unknown, authHeader: string | undefined | null) => {
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
    return token === 'good-token' ? { id: 'user-1', email: 'user@app.co' } : null
  },
}))

const { app } = await import('../app')

async function checkout(body: unknown, token?: string) {
  lastCall = null
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers['authorization'] = `Bearer ${token}`
  return app.fetch(
    new Request('http://localhost/api/billing/checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  )
}

test('an authenticated trial binds buyerIdentity and passes withTrial', async () => {
  const res = await checkout({ period: 'monthly', trial: true }, 'good-token')
  expect(res.status).toBe(200)
  expect(lastCall?.method).toBe('authenticated')
  expect(lastCall?.args['buyerIdentity']).toBe('user-1')
  expect(lastCall?.args['withTrial']).toBe(true)
  expect(lastCall?.args['productId']).toBe('prod_sub')
})

test('a trial requested without a signed-in user is rejected', async () => {
  const res = await checkout({ period: 'monthly', trial: true, email: 'a@b.co' })
  expect(res.status).toBe(401)
  expect(lastCall).toBeNull()
})

test('an anonymous checkout uses the anonymous path and disables the trial', async () => {
  const res = await checkout({ period: 'monthly', email: 'a@b.co' })
  expect(res.status).toBe(200)
  expect(lastCall?.method).toBe('anonymous')
  expect(lastCall?.args['withTrial']).toBe(false)
  expect(lastCall?.args['buyerEmail']).toBe('a@b.co')
  expect(lastCall?.args['productId']).toBe('prod_sub')
})

test('lifetime never starts a trial even when requested', async () => {
  const res = await checkout({ period: 'lifetime', trial: true, email: 'a@b.co' })
  expect(res.status).toBe(200)
  expect(lastCall?.method).toBe('anonymous')
  expect(lastCall?.args['withTrial']).toBe(false)
  expect(lastCall?.args['productId']).toBe('prod_life')
})
