'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type LoginState = { error?: string; email?: string }

/** "Try it now": anonymous session plus a realistic month of demo data. */
export async function tryDemo(): Promise<LoginState> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInAnonymously()
  if (error) return { error: authMessage(error.code) }

  const { error: seedError } = await supabase.rpc('seed_demo')
  if (seedError) throw seedError
  redirect('/')
}

const credentials = z.object({
  email: z.email('Enter a full email address, like sam@example.com.'),
  password: z.string().min(6, 'Your password needs at least 6 characters.'),
})

/** One button: signs in, or creates the account if this email is new. */
export async function signInWithEmail(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '').trim()
  const parsed = credentials.safeParse({ email, password: form.get('password') })
  if (!parsed.success) return { error: parsed.error.issues[0].message, email }

  const supabase = await createClient()
  const signIn = await supabase.auth.signInWithPassword(parsed.data)
  if (!signIn.error) redirect('/')
  if (signIn.error.code !== 'invalid_credentials') {
    return { error: authMessage(signIn.error.code), email }
  }

  // Wrong password, or no account yet. Signing up tells us which.
  const signUp = await supabase.auth.signUp(parsed.data)
  if (signUp.error) return { error: authMessage(signUp.error.code), email }
  if (!signUp.data.session) {
    return { error: 'Check your inbox and tap the link to confirm, then sign in.', email }
  }
  redirect('/')
}

function authMessage(code: string | undefined): string {
  switch (code) {
    case 'user_already_exists':
    case 'email_exists':
      return 'That password doesn’t match this email. Try again.'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many tries. Wait a minute, then try again.'
    case 'weak_password':
      return 'Pick a longer password with a mix of letters and numbers.'
    case 'anonymous_provider_disabled':
      return 'The demo is switched off right now. Sign in with email instead.'
    default:
      return 'Couldn’t sign you in. Check your connection and try again.'
  }
}
