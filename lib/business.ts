import 'server-only'
import { redirect } from 'next/navigation'
import type { createClient } from '@/lib/supabase/server'

export type Business = { id: string; name: string }

/** The signed-in user's business, read with their own session (RLS decides what they can see).
 * Null when signed out, when the session was revoked, or when 2-step login still needs its code.
 * Every server action gets business_id from here. A business_id from the client is never used. */
export async function getCurrentBusiness(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Business | null> {
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) return null
  const { data } = await supabase
    .from('memberships')
    .select('business_id, businesses(name)')
    .eq('user_id', claims.claims.sub)
    .limit(1) // one business per account this round
    .maybeSingle<{ business_id: string; businesses: { name: string } }>()
  return data ? { id: data.business_id, name: data.businesses.name } : null
}

/** For pages: the business, or a redirect that explains why there isn't one.
 * RLS hides everything from a session that still owes its 2-step code, or that was logged out
 * everywhere. Only then do we pay for a round trip to find out which. */
export async function requireBusiness(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Business> {
  const business = await getCurrentBusiness(supabase)
  if (business) return business
  const { data: claims } = await supabase.auth.getClaims()
  if (claims?.claims.aal === 'aal1') {
    const { data } = await supabase.auth.mfa.listFactors()
    if (data?.totp.length) redirect('/mfa')
  }
  redirect('/auth/signout') // a Server Component can't clear cookies; that route can
}
