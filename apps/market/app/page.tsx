import { getFeaturedItems, getNewItems } from '@/lib/queries/items'
import { ItemCard } from '@/components/ItemCard'

export const revalidate = 60 // ISR: revalidate every 60 seconds

export default async function HomePage() {
  const [featured, newest] = await Promise.all([
    getFeaturedItems(),
    getNewItems(),
  ])

  return (
    <main className="py-12">
      {/* Hero */}
      <section className="mb-12">
        <h1 className="text-3xl font-semibold tracking-tight text-ray-fg">
          AI Agent Store
        </h1>
        <p className="mt-2 max-w-xl text-ray-fg-secondary">
          Discover and install AI providers, skills, and MCP servers for Claude and Codex.
        </p>
      </section>

      {/* Featured */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-medium text-ray-fg">Featured</h2>
        {featured.data.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.data.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-ray-fg-muted">No items yet.</p>
        )}
      </section>

      {/* New */}
      <section>
        <h2 className="mb-4 text-lg font-medium text-ray-fg">New</h2>
        {newest.data.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {newest.data.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-ray-fg-muted">No items yet.</p>
        )}
      </section>
    </main>
  )
}
