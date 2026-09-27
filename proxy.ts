import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { cookieOptions, supabaseEnv } from '@/lib/supabase/server'

// Signed-out pages. A signed-in visit goes home instead.
const SIGNED_OUT_ONLY = ['/login', '/signup', '/reset-password']

/** Strict CSP: scripts run only with this request's nonce (or were loaded by one that did). */
function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV === 'development'
  return [
    "default-src 'self'",
    // https: is ignored by browsers that understand 'strict-dynamic'; it's the fallback for old ones.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' data:", // data: for the 2-step login QR code
    "font-src 'self'",
    // The browser never talks to Supabase directly: every call goes through our server.
    "connect-src 'self'",
    'frame-src https://challenges.cloudflare.com', // Turnstile
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

// Refreshes the Supabase session, keeps signed-out people on the login pages, and sets the CSP.
export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID())
  const csp = contentSecurityPolicy(nonce)
  const next = () => {
    // Next.js reads the nonce from the request's CSP header and puts it on its own scripts.
    const headers = new Headers(request.headers) // fresh copy: picks up refreshed session cookies
    headers.set('content-security-policy', csp)
    const res = NextResponse.next({ request: { headers } })
    res.headers.set('Content-Security-Policy', csp)
    return res
  }

  let response = next()
  const supabase = createServerClient(
    ...supabaseEnv(),
    {
      cookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = next()
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options))
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    },
  )

  // getClaims verifies the JWT signature; getSession would trust whatever the cookie says.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)
  const path = request.nextUrl.pathname

  // Server Actions answer for themselves ("You've been logged out…"); a redirect would only confuse them.
  // /auth/* (email links, sign-out) works whether or not there's a session.
  let to: string | null = null
  if (!request.headers.has('next-action') && !path.startsWith('/auth/')) {
    const publicPage = SIGNED_OUT_ONLY.includes(path)
    if (!signedIn && !publicPage) to = '/login'
    else if (signedIn && publicPage) to = '/'
  }
  if (!to) return response
  // Carry any refreshed session cookies across the redirect.
  const redirect = NextResponse.redirect(new URL(to, request.url))
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}

export const config = {
  // Pages only: skip Next internals, the manifest and static files.
  matcher: ['/((?!_next/|manifest.webmanifest|.*\\.(?:ico|png|svg|webp|txt)$).*)'],
}
