import { NextRequest, NextResponse } from 'next/server'
import { getItems } from '@/lib/queries/items'
import type { GetItemsOptions } from '@/lib/queries/items'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const rawCategory = searchParams.get('category')
  const category =
    rawCategory === 'provider' || rawCategory === 'skill' || rawCategory === 'mcp'
      ? rawCategory
      : null

  const options: GetItemsOptions = {
    category,
    q: searchParams.get('q') ?? undefined,
    limit: Math.min(Number(searchParams.get('limit') ?? '20'), 100),
    offset: Number(searchParams.get('offset') ?? '0'),
    sort: searchParams.get('sort') === 'created' ? 'created' : 'downloads',
  }

  const { data, error } = await getItems(options)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
  }

  return NextResponse.json({ items: data })
}
