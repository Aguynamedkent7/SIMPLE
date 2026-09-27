import type { NextConfig } from 'next'

// The app only ever acts as the signed-in user. A service role key would bypass every RLS policy,
// so refuse to build if one is anywhere in the environment.
const leaked = Object.keys(process.env).filter((name) => /SERVICE_ROLE|SUPABASE_SECRET/i.test(name))
if (leaked.length) throw new Error(`Remove ${leaked.join(', ')}: this app must never hold a Supabase admin key.`)

// Static headers for every response. The Content-Security-Policy needs a per-request nonce,
// so proxy.ts sets that one.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' }, // old browsers; CSP frame-ancestors covers new ones
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers: async () => [{ source: '/:path*', headers: securityHeaders }],
}

export default nextConfig
