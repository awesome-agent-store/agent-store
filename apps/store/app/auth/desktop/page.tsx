'use client'

import { useEffect, useState } from 'react'
import { authClient } from '@/lib/auth/client'
import { getAuthToken } from '@/lib/auth/token'

// Desktop (Tauri) OAuth relay. Neon Auth rejects custom-scheme callbacks, so the
// desktop app opens the system browser here instead:
//   1. `/auth/desktop?provider=github` → start Better Auth social sign-in, with
//      the callback pointing back at this same page.
//   2. the provider round-trip returns to `/auth/desktop?neon_auth_session_verifier=…`
//      → the client establishes the same-origin session, we mint a JWT, and hand
//      it to the app via the `agent-store://auth-callback?token=…` deep link.
// When the browser session is still valid, step 1 skips the provider consent, so
// the app can silently refresh an expired token by reopening this page.
export default function DesktopAuthRelay() {
  const [status, setStatus] = useState('正在处理…')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const provider = params.get('provider')
    const hasVerifier = params.has('neon_auth_session_verifier')

    async function run() {
      // Returning from the provider (or already signed in): mint a JWT and deep-link back.
      if (hasVerifier || !provider) {
        await authClient.getSession().catch(() => undefined)
        const token = await getAuthToken()
        if (!token) {
          setStatus('未获取到登录令牌，请重试。')
          return
        }
        setStatus('登录成功，正在返回应用…')
        window.location.href = `agent-store://auth-callback?token=${encodeURIComponent(token)}`
        return
      }
      // First hop: start social sign-in, returning to this page.
      const p = provider === 'google' ? 'google' : 'github'
      await authClient.signIn.social({ provider: p, callbackURL: '/auth/desktop' })
    }

    void run()
  }, [])

  return <main style={{ padding: 40, fontFamily: 'system-ui', color: 'var(--text-2, #888)' }}>{status}</main>
}
