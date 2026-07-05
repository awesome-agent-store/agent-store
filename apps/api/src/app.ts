import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getItems, getItemBySlug, getPublisherBySlug, getPublisherItems } from './queries'

export const app = new Hono()

app.use('/api/*', cors())

app.get('/', (c) => c.json({ ok: true, service: 'aas-api' }))

app.get('/api/items', async (c) => {
  const rawCategory = c.req.query('category')
  const category =
    rawCategory === 'provider' || rawCategory === 'skill' || rawCategory === 'mcp' ? rawCategory : null

  const { data, error } = await getItems({
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
  const { data, error } = await getItemBySlug(c.req.param('slug'))
  if (error) return c.json({ error: 'Failed to fetch item' }, 500)
  if (!data) return c.json({ error: 'Not found' }, 404)
  return c.json({ item: data })
})

app.get('/api/publishers/:slug', async (c) => {
  const slug = c.req.param('slug')
  const [publisherResult, itemsResult] = await Promise.all([
    getPublisherBySlug(slug),
    getPublisherItems(slug),
  ])

  if (publisherResult.error) return c.json({ error: 'Failed to fetch publisher' }, 500)
  if (!publisherResult.data) return c.json({ error: 'Not found' }, 404)
  return c.json({ publisher: publisherResult.data, items: itemsResult.data })
})
