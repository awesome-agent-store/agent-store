import { NextResponse } from 'next/server'

// Sign out via the same-origin Neon Auth proxy, then clear the session cookie by
// forwarding the proxy's Set-Cookie to the browser and return home.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin

  const res = await fetch(`${origin}/api/auth/sign-out`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      cookie: request.headers.get('cookie') ?? '',
    },
    // Better Auth's sign-out rejects an empty JSON body (FST_ERR_CTP_EMPTY_JSON_BODY).
    body: '{}',
  }).catch(() => null)

  const redirect = NextResponse.redirect(new URL('/', request.url))
  const setCookie = res?.headers.get('set-cookie')
  if (setCookie) redirect.headers.set('set-cookie', setCookie)
  return redirect
}
