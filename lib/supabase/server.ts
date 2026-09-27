import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** Server-only Supabase settings. Throws with a fix-it message if .env.local isn't filled in. */
export function supabaseEnv(): [url: string, key: string] {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see .env.example)')
  return [url, key]
}

/** Supabase client for Server Components and Server Actions, bound to the request's cookies. */
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    ...supabaseEnv(),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Called from a Server Component, where cookies are read-only. proxy.ts refreshes them.
          }
        },
      },
    },
  )
}
