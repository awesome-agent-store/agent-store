'use client'

import { useState } from 'react'
import type { Item } from '@as/types'
import { StoreClient } from '@as/sdk'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_META } from '@/lib/item-meta'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

export function AdminReview({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState(initialItems)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function review(id: string, action: 'approve' | 'reject') {
    if (busy) return
    setBusy(id)
    setError(null)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await new StoreClient(API_URL).reviewItem(id, action, session?.access_token ?? '')
      if (res.error) {
        setError(res.error)
        return
      }
      setItems((cur) => cur.filter((it) => it.id !== id))
    } finally {
      setBusy(null)
    }
  }

  if (items.length === 0) return <p className="text-store-text-3">没有待审核的条目。</p>

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-xs text-store-red">{error}</p>}
      {items.map((item) => {
        const cat = CATEGORY_META[item.category]
        return (
          <div key={item.id} className="rounded-xl border border-store-border bg-store-panel p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md px-2 py-[3px] text-[10.5px] font-bold" style={{ background: cat.soft, color: cat.color }}>
                    {cat.label}
                  </span>
                  <span className="font-mono text-sm font-semibold text-store-text">{item.name}</span>
                  <span className="text-xs text-store-text-3">{item.publisher?.name}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[13px] text-store-text-2">{item.description}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busy === item.id}
                  onClick={() => review(item.id, 'approve')}
                  className="rounded-lg bg-store-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                >
                  通过
                </button>
                <button
                  type="button"
                  disabled={busy === item.id}
                  onClick={() => review(item.id, 'reject')}
                  className="rounded-lg border border-store-border-strong px-3 py-1.5 text-xs font-semibold text-store-text-2 hover:border-store-red hover:text-store-red disabled:opacity-50"
                >
                  拒绝
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
