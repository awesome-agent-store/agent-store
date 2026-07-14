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

    // Which custom scheme to deep-link back to. The desktop passes ?scheme= on the
    // first hop (dev builds use agent-store-dev, release uses agent-store); the
    // provider round-trip drops query params, so persist it in sessionStorage and
    // read it back on return. Allowlisted to prevent an arbitrary-scheme redirect.
    const SCHEMES = ['agent-store', 'agent-store-dev']
    function resolveScheme(): string {
      const fromParam = params.get('scheme')
      const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('desktop_auth_scheme') : null
      const s = fromParam ?? stored
      return s && SCHEMES.includes(s) ? s : 'agent-store'
    }

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
        window.location.href = `${resolveScheme()}://auth-callback?token=${encodeURIComponent(token)}`
        return
      }
      // First hop: remember the target scheme across the provider round-trip, then
      // start social sign-in, returning to this page.
      try {
        sessionStorage.setItem('desktop_auth_scheme', resolveScheme())
      } catch {
        // sessionStorage unavailable — fall back to the default scheme on return.
      }
      const p = provider === 'google' ? 'google' : 'github'
      await authClient.signIn.social({ provider: p, callbackURL: '/auth/desktop' })
    }

    void run()
  }, [])

  return <main style={{ padding: 40, fontFamily: 'system-ui', color: 'var(--text-2, #888)' }}>{status}</main>
}
