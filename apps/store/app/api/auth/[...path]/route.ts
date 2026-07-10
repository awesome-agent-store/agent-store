import { auth } from '@/lib/auth/server'

// Same-domain proxy for the Neon Auth (Better Auth) server. All client auth
// calls go to /api/auth/* on this origin; the handler forwards them to the
// remote Neon Auth endpoint and manages the session cookie on our domain.
// auth() is lazy (see lib/auth/server.ts), so the handler is resolved per
// request rather than at build/import time.
type Ctx = { params: Promise<{ path: string[] }> }

export function GET(request: Request, ctx: Ctx): Promise<Response> {
  return auth().handler().GET(request, ctx)
}

export function POST(request: Request, ctx: Ctx): Promise<Response> {
  return auth().handler().POST(request, ctx)
}
