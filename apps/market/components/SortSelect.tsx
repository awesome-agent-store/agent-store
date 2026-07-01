'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

type Sort = 'downloads' | 'created' | 'rating'

interface SortSelectProps {
  active: Sort
}

const OPTIONS: { value: Sort; key: 'all' | 'new' | 'popular' | 'rating' }[] = [
  { value: 'downloads', key: 'all' },
  { value: 'created', key: 'new' },
  { value: 'downloads', key: 'popular' },
  { value: 'rating', key: 'rating' },
]

export function SortSelect({ active }: SortSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('store.sort')

  function handleSelect(value: Sort) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex gap-1 text-sm text-store-text-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => handleSelect(opt.value)}
          aria-pressed={active === opt.value}
          className={`rounded-md px-2 py-1 ${active === opt.value ? 'text-store-text' : 'hover:text-store-text'}`}
        >
          {t(opt.key)}
        </button>
      ))}
    </div>
  )
}
