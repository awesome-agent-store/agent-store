'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

type Category = 'all' | 'provider' | 'skill' | 'mcp'

interface CategoryTabsProps {
  active: Category
}

const TAB_VALUES: Category[] = ['all', 'provider', 'skill', 'mcp']

export function CategoryTabs({ active }: CategoryTabsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('store.categories')

  function handleSelect(value: Category) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete('category')
    } else {
      params.set('category', value)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div role="tablist" className="flex gap-1 rounded-lg border border-store-border bg-store-panel p-1">
      {TAB_VALUES.map((value) => (
        <button
          key={value}
          role="tab"
          aria-selected={active === value}
          onClick={() => handleSelect(value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            active === value
              ? 'bg-store-panel-2 text-store-text'
              : 'text-store-text-2 hover:text-store-text'
          }`}
        >
          {t(value)}
        </button>
      ))}
    </div>
  )
}
