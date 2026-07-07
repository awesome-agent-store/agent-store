import { createClient } from '@/lib/supabase/server'
import { StoreClient } from '@as/sdk'
import { AdminReview } from '@/components/AdminReview'

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

export default async function AdminPage() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  if (!token) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="mb-2 text-2xl font-semibold text-store-text">审核队列</h1>
        <p className="text-store-text-3">请先登录。</p>
      </main>
    )
  }

  const { data, error } = await new StoreClient(API_URL).getPendingItems(token)

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="mb-1 text-2xl font-semibold text-store-text">审核队列</h1>
      <p className="mb-6 text-sm text-store-text-3">爬虫抓取与用户提交的待审条目，通过后进入商店。</p>
      {error ? (
        <p className="text-store-text-3">{error === 'Forbidden' ? '你没有审核权限。' : `加载失败：${error}`}</p>
      ) : (
        <AdminReview initialItems={data ?? []} />
      )}
    </main>
  )
}
