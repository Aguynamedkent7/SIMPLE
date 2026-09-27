import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { cookieOptions, supabaseEnv } from '@/lib/supabase/server'

// Refreshes the Supabase session on every page request and keeps signed-out people on /login.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    ...supabaseEnv(),
    {
      cookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options))
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    },
  )

  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)
  const onLogin = request.nextUrl.pathname === '/login'

  // Server Actions answer for themselves ("You've been signed out…"); a redirect would only confuse them.
  const isAction = request.headers.has('next-action')
  const to = isAction ? null : !signedIn && !onLogin ? '/login' : signedIn && onLogin ? '/' : null
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
