'use client'

import type { Item } from '@aas/types'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

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

  function go(next: number) {
    setIndex(((next % items.length) + items.length) % items.length)
    resetTimer()
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-store-border bg-store-panel p-6">
      <Link href={`/store/${current.category}/${current.slug}`} className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-store-text">{current.name}</h2>
        <p className="line-clamp-2 text-sm text-store-text-2">{current.description}</p>
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              aria-label={`跳转到第 ${i + 1} 项`}
              onClick={() => go(i)}
              className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-store-accent' : 'bg-store-text-3'}`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="上一个" onClick={() => go(index - 1)} className="text-store-text-2 hover:text-store-text">
            <ChevronLeft size={18} />
          </button>
          <button type="button" aria-label="下一个" onClick={() => go(index + 1)} className="text-store-text-2 hover:text-store-text">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
