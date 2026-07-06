'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Box, Settings } from 'lucide-react'
import type { CurrentUser } from '@/lib/auth'
import { ThemeToggle } from './ThemeToggle'
import { LangSwitcher } from './LangSwitcher'
import { LoginModal } from './LoginModal'

interface HeaderProps {
  user: CurrentUser | null
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname()
  const t = useTranslations('store.nav')
  const [loginOpen, setLoginOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  const isStore = pathname.startsWith('/store')
  const isDocs = pathname.startsWith('/docs')
  const isPricing = pathname.startsWith('/pricing')

  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  useEffect(() => {
    if (!settingsOpen) return
    function onClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [settingsOpen])

  const navItemCls = (active: boolean) =>
    `text-[13.5px] transition-colors ${
      active ? 'font-bold text-store-accent' : 'font-medium text-store-text-2 hover:text-store-text'
    }`

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[60px] flex-shrink-0 items-center gap-[18px] border-b border-store-border bg-store-win px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-store-accent text-white">
            <Box size={16} />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-store-text">Agent Store</span>
        </Link>

        <nav className="flex flex-1 items-center justify-center gap-[26px]">
          <Link href="/store" className={navItemCls(isStore)}>
            {t('store')}
          </Link>
          <Link href="/docs" className={navItemCls(isDocs)}>
            {t('docs')}
          </Link>
          <Link href="/pricing" className={navItemCls(isPricing)}>
            {t('pricing')}
          </Link>
        </nav>

        {isStore && (
          <Link
            href="/store?publish=1"
            className="flex h-9 items-center rounded-[10px] bg-store-accent px-[15px] text-[12.5px] font-semibold text-white shadow-[0_4px_14px_var(--accent-soft)] hover:brightness-110"
          >
            {t('publish')}
          </Link>
        )}

        <div className="relative" ref={settingsRef}>
          <button
            type="button"
            aria-label={t('settings')}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-store-border bg-store-panel text-store-text-2 hover:text-store-text"
          >
            <Settings size={17} />
          </button>
          {settingsOpen && (
            <div className="absolute right-0 top-[42px] z-40 w-[230px] overflow-hidden rounded-xl border border-store-border-strong bg-store-win p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-store-text-2">{t('theme')}</span>
                <ThemeToggle />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] font-medium text-store-text-2">{t('language')}</span>
                <LangSwitcher />
              </div>
            </div>
          )}
        </div>

        {user ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label={t('myHome')}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #7c82ff, #b06ad9)' }}
            >
              {user.initial}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-[42px] z-40 w-[190px] overflow-hidden rounded-xl border border-store-border-strong bg-store-win shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
                <div className="border-b border-store-border px-3.5 py-3">
                  <div className="truncate font-mono text-[12.5px] font-bold text-store-text">
                    {user.username || user.email || 'you'}
                  </div>
                  {user.email && <div className="mt-0.5 truncate text-[11px] text-store-text-3">{user.email}</div>}
                </div>
                <Link
                  href={user.username ? `/publisher/${user.username}` : '/dashboard'}
                  onClick={() => setMenuOpen(false)}
                  className="block px-3.5 py-2.5 text-[12.5px] text-store-text-2 hover:bg-store-panel-2 hover:text-store-text"
                >
                  {t('myHome')}
                </Link>
                <Link
                  href="/dashboard"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3.5 py-2.5 text-[12.5px] text-store-text-2 hover:bg-store-panel-2 hover:text-store-text"
                >
                  {t('settings')}
                </Link>
                <a
                  href="/auth/logout"
                  className="block border-t border-store-border px-3.5 py-2.5 text-[12.5px] text-store-red hover:bg-store-panel-2"
                >
                  {t('logout')}
                </a>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLoginOpen(true)}
            className="flex h-9 items-center rounded-[10px] border border-store-border-strong bg-store-panel px-4 text-[12.5px] font-semibold text-store-text hover:border-store-accent"
          >
            {t('login')}
          </button>
        )}
      </header>

      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  )
}
