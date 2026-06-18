import { getItems } from '@/lib/queries/items'
import { ItemCard } from '@/components/ItemCard'
import { CategoryTabs } from '@/components/CategoryTabs'
import { SearchInput } from '@/components/SearchInput'
import { Suspense } from 'react'

interface StorePageProps {
  searchParams: {
    category?: string
    q?: string
    offset?: string
  }
}

export const revalidate = 30

export default async function StorePage({ searchParams }: StorePageProps) {
  const rawCategory = searchParams.category
  const category =
    rawCategory === 'provider' || rawCategory === 'skill' || rawCategory === 'mcp'
      ? rawCategory
      : null

  const { data: items } = await getItems({
    category,
    q: searchParams.q,
    offset: Number(searchParams.offset ?? '0'),
    limit: 24,
  })

  const activeTab = category ?? 'all'

  return (
    <main className="py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-ray-fg">Store</h1>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}>
            <SearchInput defaultValue={searchParams.q} />
          </Suspense>
          <Suspense fallback={null}>
            <CategoryTabs active={activeTab as 'all' | 'provider' | 'skill' | 'mcp'} />
          </Suspense>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl border border-ray-border bg-ray-surface-1">
          <p className="text-ray-fg-muted">No items found.</p>
        </div>
      )}
    </main>
  )
}
