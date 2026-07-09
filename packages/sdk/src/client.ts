import type { Item, Publisher, Plan, UserReview, ItemVersion } from '@as/types'

export type Result<T> = { data: T; error: null } | { data: null; error: string }

export interface GetItemsParams {
  category?: 'provider' | 'skill' | 'mcp'
  q?: string
  limit?: number
  offset?: number
  sort?: 'downloads' | 'created'
}

export interface SubmitManifest {
  slug: string
  name: string
  description: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  compatibleWith: string[]
  tags: string[]
  installHook: { steps: unknown[] }
  metadata: Record<string, unknown>
}

export interface PublisherWithItems {
  publisher: Publisher
  items: Item[]
}

export class StoreClient {
  readonly baseUrl: string
  private readonly fetchInit?: RequestInit
  private readonly timeoutMs?: number

  constructor(baseUrl = 'http://localhost:3000', options: { fetchInit?: RequestInit; timeoutMs?: number } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.fetchInit = options.fetchInit
    this.timeoutMs = options.timeoutMs
  }

  /** Wraps fetch with the configured fetchInit + an optional timeout; abort/timeout errors propagate like any other network error. */
  private async _fetch(url: string, init?: RequestInit): Promise<Response> {
    const mergedInit: RequestInit = { ...this.fetchInit, ...init }
    if (this.timeoutMs == null) return fetch(url, mergedInit)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      return await fetch(url, { ...mergedInit, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  async getItems(params: GetItemsParams = {}): Promise<Result<Item[]>> {
    try {
      const url = new URL(`${this.baseUrl}/api/items`)
      if (params.category) url.searchParams.set('category', params.category)
      if (params.q) url.searchParams.set('q', params.q)
      if (params.limit != null) url.searchParams.set('limit', String(params.limit))
      if (params.offset != null) url.searchParams.set('offset', String(params.offset))
      if (params.sort) url.searchParams.set('sort', params.sort)

      const res = await this._fetch(url.toString())
      const json = await res.json() as { items?: Item[]; error?: string }

      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}` }
      if (json.items == null) return { data: null, error: 'No items in response' }
      return { data: json.items, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async getItemBySlug(slug: string): Promise<Result<Item>> {
    try {
      const res = await this._fetch(`${this.baseUrl}/api/items/${encodeURIComponent(slug)}`)
      const json = await res.json() as { item?: Item; error?: string }

      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}` }
      if (!json.item) return { data: null, error: 'No item in response' }
      return { data: json.item, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Best-effort: bump a package's real install count. Never throws. */
  async recordInstall(slug: string): Promise<void> {
    try {
      await this._fetch(`${this.baseUrl}/api/items/${encodeURIComponent(slug)}/install`, { method: 'POST' })
    } catch {
      /* install counting is non-critical */
    }
  }

  /** Public list of an item's user reviews (most recent first). */
  async getReviews(slug: string): Promise<Result<UserReview[]>> {
    try {
      const res = await this._fetch(`${this.baseUrl}/api/items/${encodeURIComponent(slug)}/reviews`)
      const json = (await res.json()) as {
        reviews?: { author_name: string | null; rating: number; body: string | null; updated_at: string }[]
        error?: string
      }
      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}` }
      const reviews = (json.reviews ?? []).map((r) => ({
        authorName: r.author_name,
        rating: r.rating,
        body: r.body,
        updatedAt: r.updated_at,
      }))
      return { data: reviews, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Public version history for an item (most recent first). */
  async getVersions(slug: string): Promise<Result<ItemVersion[]>> {
    try {
      const res = await this._fetch(`${this.baseUrl}/api/items/${encodeURIComponent(slug)}/versions`)
      const json = (await res.json()) as { versions?: { version: string; published_at: string }[]; error?: string }
      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}` }
      const versions = (json.versions ?? []).map((v) => ({ version: v.version, publishedAt: v.published_at }))
      return { data: versions, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Submit or update the authenticated user's review for an item. */
  async submitReview(
    slug: string,
    token: string,
    rating: number,
    body?: string
  ): Promise<Result<{ rating: number; reviewCount: number }>> {
    try {
      const res = await this._fetch(`${this.baseUrl}/api/items/${encodeURIComponent(slug)}/reviews`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ rating, body }),
      })
      const json = (await res.json()) as { rating?: number; reviewCount?: number; error?: string }
      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}` }
      return { data: { rating: json.rating ?? 0, reviewCount: json.reviewCount ?? 0 }, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async getPublisher(slug: string): Promise<Result<PublisherWithItems>> {
    try {
      const res = await this._fetch(`${this.baseUrl}/api/publishers/${encodeURIComponent(slug)}`)
      const json = await res.json() as { publisher?: Publisher; items?: Item[]; error?: string }

      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}` }
      if (!json.publisher) return { data: null, error: 'No publisher in response' }
      return { data: { publisher: json.publisher, items: json.items ?? [] }, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Returns the authenticated publisher's own items (any status). */
  async getMyItems(token: string): Promise<Result<Item[]>> {
    try {
      const res = await this._fetch(`${this.baseUrl}/api/me/items`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json() as { items?: Item[]; error?: string }

      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}` }
      if (json.items == null) return { data: null, error: 'No items in response' }
      return { data: json.items, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Resolves the authenticated user's plan from their Supabase session token. */
  async getMyEntitlements(token: string): Promise<Result<{ plan: Plan }>> {
    try {
      const res = await this._fetch(`${this.baseUrl}/api/me/entitlements`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json() as { plan?: Plan; error?: string }

      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}` }
      if (!json.plan) return { data: null, error: 'No plan in response' }
      return { data: { plan: json.plan }, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Creates a Pro checkout session; pass the session token to bind the subscription to the user. */
  async createCheckout(
    body: { period: 'monthly' | 'yearly' | 'lifetime'; email?: string; trial?: boolean },
    options: { token?: string } = {}
  ): Promise<Result<{ checkoutUrl: string }>> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (options.token) headers['Authorization'] = `Bearer ${options.token}`

      const res = await this._fetch(`${this.baseUrl}/api/billing/checkout`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const json = await res.json() as { checkoutUrl?: string; error?: string }

      if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}` }
      if (!json.checkoutUrl) return { data: null, error: 'No checkoutUrl in response' }
      return { data: { checkoutUrl: json.checkoutUrl }, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
