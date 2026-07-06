'use client'

import type { Item } from '@as/types'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { CATEGORY_META, CategoryGlyph, TIER_META, formatDownloads } from '@/lib/item-meta'

interface FeaturedCarouselProps {
  items: Item[]
}

const AUTOPLAY_MS = 5000

export function FeaturedCarousel({ items }: FeaturedCarouselProps) {
  const [index, setIndex] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (items.length <= 1) return
    timerRef.current = setInterval(() => {
      if (document.hidden) return
      setIndex((i) => (i + 1) % items.length)
    }, AUTOPLAY_MS)
  }

  useEffect(() => {
    resetTimer()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  if (items.length === 0) return null

  const current = items[index % items.length]
  const cat = CATEGORY_META[current.category]
  const tier = TIER_META[current.publisher.tier]

  function go(next: number) {
    setIndex(((next % items.length) + items.length) % items.length)
    resetTimer()
  }

  return (
    <div className="relative">
      <Link
        href={`/store/${current.category}/${current.slug}`}
        className="flex min-h-[128px] cursor-pointer items-center gap-6 rounded-2xl border border-store-accent p-6"
        style={{ background: 'linear-gradient(120deg, var(--accent-soft), transparent 62%), var(--panel)' }}
      >
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-[30px]"
          style={{ background: cat.soft, color: cat.color }}
        >
          <CategoryGlyph category={current.category} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-store-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-store-accent">
              本周精选
            </span>
            <span className="rounded bg-store-code-bg px-2 py-0.5 text-[10.5px] font-semibold text-store-text-2">
              {cat.label}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <h2 className="truncate font-mono text-xl font-bold text-store-text">{current.name}</h2>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{ background: tier.soft, color: tier.color }}
            >
              {tier.label}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 max-w-[560px] text-[13px] leading-relaxed text-store-text-2">
            {current.description}
          </p>
          <div className="mt-3 flex items-center gap-4 font-mono text-xs">
            <span className="text-store-text-3">↓ {formatDownloads(current.downloads)}</span>
            <span className="text-store-star">★ {current.rating.toFixed(1)}</span>
            <span className="text-store-text-3">v{current.version}</span>
          </div>
        </div>
      </Link>

      <button
        type="button"
        aria-label="上一个"
        onClick={() => go(index - 1)}
        className="absolute left-3 top-1/2 flex h-[30px] w-[30px] -translate-y-1/2 items-center justify-center rounded-full border border-store-border bg-store-panel text-store-text-2 hover:border-store-accent hover:text-store-text"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        aria-label="下一个"
        onClick={() => go(index + 1)}
        className="absolute right-3 top-1/2 flex h-[30px] w-[30px] -translate-y-1/2 items-center justify-center rounded-full border border-store-border bg-store-panel text-store-text-2 hover:border-store-accent hover:text-store-text"
      >
        <ChevronRight size={16} />
      </button>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            aria-label={`跳转到第 ${i + 1} 项`}
            onClick={() => go(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-5 bg-store-accent' : 'w-1.5 bg-store-text-3'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
