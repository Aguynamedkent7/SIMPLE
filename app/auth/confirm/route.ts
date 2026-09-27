import type { EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TYPES: EmailOtpType[] = ['email', 'signup', 'recovery', 'email_change']

/** Where the confirm and reset emails link to. Verifies the one-time token and signs the user in.
 * Uses the token hash rather than a PKCE code, so the link works on a different device too. */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType
  if (tokenHash && TYPES.includes(type)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) redirect(type === 'recovery' ? '/update-password' : '/')
  }
  redirect('/login?link=expired')
}
