import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Entitlements } from '@as/types'
import { openExternal } from '../lib/openExternal'
import { onDeepLink } from '../lib/deepLink'
import { getStoreBaseUrl, getAuthScheme, emailFromJwt } from '../lib/neonAuth'
import { callRpc } from '../lib/rpc'
import { useEntitlement } from './Entitlement'

export type AuthProviderName = 'github' | 'google'

/** Desktop session: a Neon Auth JWT handed back by the store relay, plus its email claim. */
interface DesktopSession {
  token: string
  email: string | null
}

interface AuthValue {
  email: string | null
  signedIn: boolean
  /** Current session access token, for authenticating store API calls (e.g. checkout binding). */
  accessToken: string | null
  /** Whether sign-in is available (always true — the store relay handles auth). */
  configured: boolean
  signIn: (provider: AuthProviderName) => Promise<void>
  /** Called by the deep-link handler with the agent-store://auth-callback URL. */
  completeSignIn: (callbackUrl: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { refresh: refreshEntitlements } = useEntitlement()
  const [session, setSession] = useState<DesktopSession | null>(null)

  // On session change, sync (or clear) the locally cached plan, then refresh the
  // entitlement UI. Failures leave the last-known cached plan untouched.
  async function applySession(next: DesktopSession | null) {
    setSession(next)
    try {
      if (next) await callRpc<Entitlements>('syncEntitlement', [next.token])
      else await callRpc<Entitlements>('clearEntitlement')
    } catch {
      // keep cached plan
    }
    refreshEntitlements()
  }

  useEffect(() => {
    let active = true
    // The OAuth browser flow deep-links back to agent-store://auth-callback?token=…; complete it here.
    let unlistenDeepLink = () => {}
    void onDeepLink((url) => void completeSignIn(url)).then((u) => {
      if (active) unlistenDeepLink = u
      else u()
    })
    return () => {
      active = false
      unlistenDeepLink()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function signIn(provider: AuthProviderName) {
    // Neon Auth rejects custom-scheme callbacks, so sign in through the web
    // store's relay page; it completes the OAuth round-trip in the system
    // browser and deep-links a JWT back to this build's scheme. Pass our scheme
    // so the relay bounces the token to the right build (dev vs release).
    await openExternal(`${getStoreBaseUrl()}/auth/desktop?provider=${provider}&scheme=${getAuthScheme()}`)
  }

  async function completeSignIn(callbackUrl: string) {
    const token = new URL(callbackUrl).searchParams.get('token')
    if (!token) return
    await applySession({ token, email: emailFromJwt(token) })
  }

  async function signOut() {
    await applySession(null)
  }

  return (
    <AuthContext.Provider
      value={{
        email: session?.email ?? null,
        signedIn: session != null,
        accessToken: session?.token ?? null,
        configured: true,
        signIn,
        completeSignIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
