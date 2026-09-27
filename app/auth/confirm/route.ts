import type { EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TYPES: EmailOtpType[] = ['email', 'signup', 'recovery', 'email_change']

/** Where the confirm and reset emails link to. Verifies the one-time token and signs the user in.
 * token_hash links (our templates) work on any device. `code` links (Supabase's default templates,
 * PKCE) only work in the browser that asked, so the templates in supabase/templates are preferred. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType
  const code = params.get('code')
  const supabase = await createClient()

  if (tokenHash && TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) redirect(type === 'recovery' ? '/update-password' : '/')
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) redirect(params.get('next') === 'update-password' ? '/update-password' : '/')
  }
  redirect('/login?link=expired')
}
