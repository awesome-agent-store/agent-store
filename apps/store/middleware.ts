import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/server'

// Protect /dashboard behind a Neon Auth (Better Auth) session; unauthenticated
// visitors are redirected home (where the login modal lives). auth() is lazy so
// the instance isn't created at build time (it needs a runtime-only secret).
export default function middleware(request: NextRequest) {
  return auth().middleware({ loginUrl: '/' })(request)
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
}
