'use client'

import { useState } from 'react'
import { StoreClient } from '@as/sdk'
import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

interface UpgradeProButtonProps {
  className?: string
  children?: React.ReactNode
}

// Starts a Pro checkout (monthly) via the API server, binding the subscription
// to the signed-in user with their Supabase session token — mirrors the token
// pattern used by PublishModal. On success redirects to the hosted checkout page.
export function UpgradeProButton({ className, children }: UpgradeProButtonProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) {
        setError('请先登录')
        return
      }
      const result = await new StoreClient(API_URL).createCheckout(
        { period: 'monthly' },
        { token: session.access_token },
      )
      if (result.error || !result.data) {
        setError(result.error ?? '发起结算失败')
        return
      }
      window.location.href = result.data.checkoutUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : '发起结算失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={
          className ??
          'flex h-9 items-center rounded-[10px] bg-store-accent px-[15px] text-[12.5px] font-semibold text-white shadow-[0_4px_14px_var(--accent-soft)] hover:brightness-110 disabled:opacity-60'
        }
      >
        {busy ? '跳转中…' : (children ?? '升级 Pro')}
      </button>
      {error && <span className="text-[11px] text-store-red">{error}</span>}
    </div>
  )
}
