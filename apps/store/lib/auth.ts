import { auth } from '@/lib/auth/server'

export interface CurrentUser {
  initial: string
  username: string
  email: string
}

// Resolve the signed-in user for the persistent nav via the Neon Auth (Better
// Auth) session cookie. Returns null when signed out. The web store defaults to
// the logged-out state (design red-line), so any failure is treated as "not
// logged in". `username` is the Better Auth display name (GitHub login for most
// accounts); publisher-scoped lookups that need the exact GitHub login resolve
// it API-side from the token.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const { data } = await auth().getSession()
    const user = data?.user
    if (!user) return null
    const username = user.name ?? ''
    const email = user.email ?? ''
    const initial = (username || email || 'U').charAt(0).toUpperCase()
    return { initial, username, email }
  } catch {
    return null
  }
}
