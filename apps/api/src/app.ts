import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { desc, eq, sql } from 'drizzle-orm'
import { verifyWebhook, type WebhookEvent, type WebhookEventData } from '@waffo/pancake-ts'
import { getItems, getItemBySlug, getPublisherBySlug, getPublisherItems } from './queries'
import { getDb, type DbEnv } from './db/client'
import { itemVersions, items, reviews } from './db/schema'
import type { NeonAuthEnv } from './neon-auth'
import { getWaffoClient, proProductId, checkoutSuccessUrl, wantsTrial, type WaffoEnv, type BillingPlan } from './waffo'
import { subscriptionRecordFromEvent } from './billing'
import { getAuthUser } from './auth'
import { getMyItems } from './publisher-items'
import {
  isWebhookProcessed,
  markWebhookProcessed,
  upsertSubscription,
  getPlanByEmail,
  getPlanByUserId,
} from './subscription-queries'

// On Cloudflare Workers, secrets arrive as the fetch handler's `env` (Hono c.env).
// On local Bun (Bun.serve), c.env is the Bun server object with no such keys, so
// getDb()/getWaffoClient() fall back to process.env.
export const app = new Hono<{ Bindings: WaffoEnv & DbEnv & NeonAuthEnv }>()

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

// Bump the real install count (called by the client after a successful install).
app.post('/api/items/:slug/install', async (c) => {
  const slug = c.req.param('slug')
  try {
    const db = getDb(c.env)
    const updated = await db
      .update(items)
      .set({ downloads: sql`${items.downloads} + 1` })
      .where(eq(items.slug, slug))
      .returning({ downloads: items.downloads })
    if (updated.length === 0) return c.json({ error: 'Not found' }, 404)
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Failed to record install' }, 500)
  }
})

// ── User reviews ─────────────────────────────────────────────────────────────

// Public list of an item's reviews (most recent first).
app.get('/api/items/:slug/reviews', async (c) => {
  const slug = c.req.param('slug')
  try {
    const db = getDb(c.env)
    const data = await db
      .select({
        author_name: reviews.authorName,
        rating: reviews.rating,
        body: reviews.body,
        updated_at: reviews.updatedAt,
      })
      .from(reviews)
      .where(eq(reviews.itemSlug, slug))
      .orderBy(desc(reviews.updatedAt))
      .limit(50)
    return c.json({ reviews: data })
  } catch {
    return c.json({ error: 'Failed to load reviews' }, 500)
  }
})

// Submit (or update) the caller's review, then recompute the item's aggregate
// rating + review_count. One review per user per item (upsert).
app.post('/api/items/:slug/reviews', async (c) => {
  const slug = c.req.param('slug')
  const user = await getAuthUser(c.env, c.req.header('Authorization'))
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const body = (await c.req.json().catch(() => ({}))) as { rating?: number; body?: string }
  const rating = Math.round(Number(body.rating))
  if (!(rating >= 1 && rating <= 5)) return c.json({ error: 'rating must be an integer 1-5' }, 400)
  try {
    const db = getDb(c.env)
    // reviews has no updated_at trigger (only items/subscriptions do), so set it
    // explicitly on the conflict-update path; fresh inserts default it to now().
    const reviewBody = typeof body.body === 'string' ? body.body.slice(0, 2000) : null
    await db
      .insert(reviews)
      .values({
        itemSlug: slug,
        userId: user.id,
        authorName: user.username ?? null,
        rating,
        body: reviewBody,
      })
      .onConflictDoUpdate({
        target: [reviews.itemSlug, reviews.userId],
        set: {
          authorName: user.username ?? null,
          rating,
          body: reviewBody,
          updatedAt: sql`now()`,
        },
      })
    const rows = await db.select({ rating: reviews.rating }).from(reviews).where(eq(reviews.itemSlug, slug))
    const count = rows.length
    const avg = count > 0 ? rows.reduce((s, r) => s + r.rating, 0) / count : 0
    const rounded = Math.round(avg * 10) / 10
    await db.update(items).set({ rating: String(rounded), reviewCount: count }).where(eq(items.slug, slug))
    return c.json({ ok: true, rating: rounded, reviewCount: count })
  } catch {
    return c.json({ error: 'Failed to submit review' }, 500)
  }
})

// Version history for an item (most recent first). Recorded by the registry sync.
app.get('/api/items/:slug/versions', async (c) => {
  const slug = c.req.param('slug')
  try {
    const db = getDb(c.env)
    const data = await db
      .select({ version: itemVersions.version, published_at: itemVersions.publishedAt })
      .from(itemVersions)
      .where(eq(itemVersions.itemSlug, slug))
      .orderBy(desc(itemVersions.publishedAt))
      .limit(50)
    return c.json({ versions: data })
  } catch {
    return c.json({ error: 'Failed to load versions' }, 500)
  }
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

// ── Billing (Waffo Pancake, Merchant of Record) ──────────────────────────────

// Create a Pro checkout session and return its hosted checkout URL.
// Body: { period?: 'monthly' | 'yearly', email?: string, successUrl?: string }
app.post('/api/billing/checkout', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    period?: BillingPlan
    email?: string
    successUrl?: string
    trial?: boolean
  }
  const period: BillingPlan =
    body.period === 'yearly' ? 'yearly' : body.period === 'lifetime' ? 'lifetime' : 'monthly'
  const withTrial = wantsTrial(period, body.trial)
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

  // Trials de-duplicate on a stable, merchant-controlled buyer identity. An
  // anonymous checkout lets the buyer self-report any email and re-claim the
  // trial, so a trial requires an authenticated identity to bind against.
  if (withTrial && !user) return c.json({ error: 'Sign in to start a free trial' }, 401)

  const buyerEmail = body.email ?? user?.email
  const metadata: Record<string, string> = {}
  if (user) metadata['userId'] = user.id
  if (buyerEmail) metadata['buyerEmail'] = buyerEmail

  const successUrl = body.successUrl ?? checkoutSuccessUrl(c.env)
  // Echoed back on webhooks (event.data.orderMetadata) to bind the subscription.
  const orderMetadata = Object.keys(metadata).length > 0 ? metadata : undefined

  try {
    if (user) {
      // Authenticated checkout binds the order to a merchant-controlled buyer
      // identity (user.id). The order stays tied to this identity even if the
      // buyer edits the email on the checkout form, so trials can't be re-farmed.
      const session = await client.checkout.authenticated.create({
        productId,
        currency: 'USD',
        buyerIdentity: user.id,
        buyerEmail,
        successUrl,
        metadata: orderMetadata,
        // Start on the free trial for subscription checkouts that requested it.
        ...(withTrial ? { withTrial: true } : {}),
      })
      return c.json({ checkoutUrl: session.checkoutUrl, sessionId: session.sessionId })
    }
    // Anonymous checkout has no stable identity (buyer self-reports email), so it
    // must never grant a trial — `withTrial` is guarded off above and pinned false.
    const session = await client.checkout.anonymous.create({
      productId,
      currency: 'USD',
      buyerEmail,
      successUrl,
      metadata: orderMetadata,
      withTrial: false,
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
