'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'

interface SearchInputProps {
  defaultValue?: string
}

export function SearchInput({ defaultValue = '' }: SearchInputProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('store.search')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.trim()
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set('q', value)
    } else {
      params.delete('q')
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const placeholder = t('placeholder')

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <Search size={16} className="text-store-text-3" />
      </div>
      <input
        type="search"
        defaultValue={defaultValue}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={placeholder}
        data-pending={isPending ? '' : undefined}
        className="w-full rounded-lg border border-store-border bg-store-panel py-2 pl-9 pr-4 text-sm text-store-text placeholder:text-store-text-3 focus:border-store-border-strong focus:outline-none"
      />
    </div>
  )
}
