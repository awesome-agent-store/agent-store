import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { verifyWebhook, type WebhookEvent, type WebhookEventData } from '@waffo/pancake-ts'
import { getItems, getItemBySlug, getPublisherBySlug, getPublisherItems } from './queries'
import type { SupabaseEnv } from './supabase'
import { getWaffoClient, proProductId, checkoutSuccessUrl, type WaffoEnv, type BillingPlan } from './waffo'
import { subscriptionRecordFromEvent } from './billing'
import { getAuthUser } from './auth'
import { getMyItems, createItem, validateCreateItem, type CreateItemInput } from './publisher-items'
import { isAdmin, getPendingItems, setItemStatus } from './admin'
import {
  isWebhookProcessed,
  markWebhookProcessed,
  upsertSubscription,
  getPlanByEmail,
  getPlanByUserId,
} from './subscription-queries'

// On Cloudflare Workers, secrets arrive as the fetch handler's `env` (Hono c.env).
// On local Bun (Bun.serve), c.env is the Bun server object with no such keys, so
// getSupabase()/getWaffoClient() fall back to process.env.
export const app = new Hono<{ Bindings: SupabaseEnv & WaffoEnv }>()

app.use('/api/*', cors())

app.get('/', (c) => c.json({ ok: true, service: 'as-api' }))

app.get('/api/items', async (c) => {
  const rawCategory = c.req.query('category')
  const category =
    rawCategory === 'provider' || rawCategory === 'skill' || rawCategory === 'mcp' ? rawCategory : null

  const { data, error } = await getItems(c.env, {
    category,
    q: c.req.query('q') ?? undefined,
    limit: Math.min(Number(c.req.query('limit') ?? '20'), 100),
    offset: Number(c.req.query('offset') ?? '0'),
    sort: c.req.query('sort') === 'created' ? 'created' : 'downloads',
  })

  if (error) return c.json({ error: 'Failed to fetch items' }, 500)
  return c.json({ items: data })
})

app.get('/api/items/:slug', async (c) => {
  const { data, error } = await getItemBySlug(c.env, c.req.param('slug'))
  if (error) return c.json({ error: 'Failed to fetch item' }, 500)
  if (!data) return c.json({ error: 'Not found' }, 404)
  return c.json({ item: data })
})

app.get('/api/publishers/:slug', async (c) => {
  const slug = c.req.param('slug')
  const [publisherResult, itemsResult] = await Promise.all([
    getPublisherBySlug(c.env, slug),
    getPublisherItems(c.env, slug),
  ])

  if (publisherResult.error) return c.json({ error: 'Failed to fetch publisher' }, 500)
  if (!publisherResult.data) return c.json({ error: 'Not found' }, 404)
  return c.json({ publisher: publisherResult.data, items: itemsResult.data })
})

// ── Publisher (authenticated) ────────────────────────────────────────────────

// The authenticated publisher's own items (any status), for their dashboard.
app.get('/api/me/items', async (c) => {
  const user = await getAuthUser(c.env, c.req.header('Authorization'))
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (!user.username) return c.json({ error: 'GitHub username not found' }, 422)
  const { data, error } = await getMyItems(c.env, user.username)
  if (error) return c.json({ error: 'Failed to fetch items' }, 500)
  return c.json({ items: data })
})

// Admin: list all pending items for review (crawler-sourced or user-submitted).
app.get('/api/admin/pending', async (c) => {
  const user = await getAuthUser(c.env, c.req.header('Authorization'))
  if (!isAdmin(user, c.env)) return c.json({ error: 'Forbidden' }, 403)
  const { data, error } = await getPendingItems(c.env)
  if (error) return c.json({ error: 'Failed to fetch pending items' }, 500)
  return c.json({ items: data })
})

// Admin: approve (→ published) or reject (→ rejected) a pending item.
app.post('/api/admin/items/:id/review', async (c) => {
  const user = await getAuthUser(c.env, c.req.header('Authorization'))
  if (!isAdmin(user, c.env)) return c.json({ error: 'Forbidden' }, 403)
  const body = (await c.req.json().catch(() => ({}))) as { action?: string }
  if (body.action !== 'approve' && body.action !== 'reject') return c.json({ error: 'Invalid action' }, 422)
  const { error } = await setItemStatus(c.env, c.req.param('id'), body.action === 'approve' ? 'published' : 'rejected')
  if (error) return c.json({ error: 'Failed to update item' }, 500)
  return c.json({ ok: true })
})

// Publish a new item for the authenticated publisher (enters as pending).
app.post('/api/items', async (c) => {
  const user = await getAuthUser(c.env, c.req.header('Authorization'))
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (!user.username) return c.json({ error: 'GitHub username not found' }, 422)

  let body: CreateItemInput
  try {
    body = (await c.req.json()) as CreateItemInput
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const invalid = validateCreateItem(body)
  if (invalid) return c.json({ error: invalid.error }, invalid.status as 422)

  const result = await createItem(c.env, user.username, body)
  if ('error' in result) return c.json({ error: result.error }, result.status as 409 | 422 | 500)
  return c.json({ success: true }, 201)
})

// ── Billing (Waffo Pancake, Merchant of Record) ──────────────────────────────

// Create a Pro checkout session and return its hosted checkout URL.
// Body: { period?: 'monthly' | 'yearly', email?: string, successUrl?: string }
app.post('/api/billing/checkout', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    period?: BillingPlan
    email?: string
    successUrl?: string
  }
  const period: BillingPlan =
    body.period === 'yearly' ? 'yearly' : body.period === 'lifetime' ? 'lifetime' : 'monthly'
  const productId = proProductId(c.env, period)
  if (!productId) return c.json({ error: 'Billing not configured' }, 501)

  let client: ReturnType<typeof getWaffoClient>
  try {
    client = getWaffoClient(c.env)
  } catch {
    return c.json({ error: 'Billing not configured' }, 501)
  }

  // Bind the purchase to the logged-in app user when a valid token is present, so
  // the webhook can link the subscription to their account (buyer_identity).
  const user = await getAuthUser(c.env, c.req.header('Authorization'))
  const buyerEmail = body.email ?? user?.email
  const metadata: Record<string, string> = {}
  if (user) metadata['userId'] = user.id
  if (buyerEmail) metadata['buyerEmail'] = buyerEmail

  try {
    const session = await client.checkout.createSession({
      productId,
      currency: 'USD',
      buyerEmail,
      successUrl: body.successUrl ?? checkoutSuccessUrl(c.env),
      // Echoed back on webhooks (event.data.orderMetadata) to bind the subscription.
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    })
    return c.json({ checkoutUrl: session.checkoutUrl, sessionId: session.sessionId })
  } catch {
    return c.json({ error: 'Failed to create checkout session' }, 502)
  }
})

// Waffo webhook receiver. Verifies the RSA signature over the RAW body, dedups
// on the delivery id, and upserts the subscription. Must respond 200 quickly.
app.post('/api/webhooks/waffo', async (c) => {
  const body = await c.req.text() // raw text — parsing as JSON would break the signature
  const signature = c.req.header('x-waffo-signature')

  let event: WebhookEvent<WebhookEventData>
  try {
    event = verifyWebhook<WebhookEventData>(body, signature)
  } catch {
    return c.text('Invalid signature', 401)
  }

  try {
    if (await isWebhookProcessed(c.env, event.id)) return c.text('OK')
    const record = subscriptionRecordFromEvent(event)
    if (record) await upsertSubscription(c.env, record)
    await markWebhookProcessed(c.env, event.id, event.eventType)
  } catch {
    return c.json({ error: 'Webhook processing failed' }, 500)
  }
  return c.text('OK')
})

// Resolve the entitlement plan for the authenticated user (account-bound). The
// desktop client calls this with its Supabase session token. Returns { plan }.
app.get('/api/me/entitlements', async (c) => {
  const user = await getAuthUser(c.env, c.req.header('Authorization'))
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const plan = await getPlanByUserId(c.env, user.id)
    return c.json({ plan })
  } catch {
    return c.json({ error: 'Failed to resolve entitlements' }, 500)
  }
})

// Legacy email-keyed lookup, kept for the lightweight email-activation fallback.
app.get('/api/entitlements', async (c) => {
  const email = c.req.query('email')
  if (!email) return c.json({ error: 'email is required' }, 400)
  try {
    const plan = await getPlanByEmail(c.env, email)
    return c.json({ plan })
  } catch {
    return c.json({ error: 'Failed to resolve entitlements' }, 500)
  }
})
