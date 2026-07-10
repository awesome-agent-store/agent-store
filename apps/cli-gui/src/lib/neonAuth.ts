// Desktop OAuth config. Neon Auth rejects custom-scheme OAuth callbacks, so the
// desktop signs in via the web store's relay page (/auth/desktop), which
// deep-links a JWT back to the app's custom scheme.

/** The custom-scheme URL the store relay deep-links back to; a registered Tauri deep link. */
export const AUTH_REDIRECT_URL = 'agent-store://auth-callback'

/** Base URL of the web store, which hosts the OAuth relay page. Override for local dev with VITE_STORE_URL. */
export function getStoreBaseUrl(): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env
  return env?.['VITE_STORE_URL'] || 'https://agent-store.panghuli.tech'
}

/** Best-effort decode of the `email` claim from a Neon Auth (Better Auth) JWT. */
export function emailFromJwt(token: string): string | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(json) as { email?: unknown }
    return typeof payload.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}
