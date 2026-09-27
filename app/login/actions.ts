'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/** `field` says which input the error is about, so the form can put it right under that input. */
export type LoginState = { error?: string; field?: 'email' | 'password'; email?: string }

/** "Try it now": anonymous session plus a realistic month of demo data. */
export async function tryDemo(): Promise<LoginState> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInAnonymously()
  if (error) return { error: authMessage(error.code) }

  const { error: seedError } = await supabase.rpc('seed_demo')
  if (seedError) {
    console.error('seed_demo failed', seedError)
    await supabase.auth.signOut() // don't leave them in an empty demo
    return { error: 'Couldn’t set up the demo. Try again in a moment.' }
  }
  redirect('/')
}

const credentials = z.object({
  email: z.string().min(1, 'Enter your email address.')
    .pipe(z.email('Enter a full email address, like sam@example.com.'))
    .pipe(z.string().max(254, 'That email address is too long.')),
  password: z.string().min(1, 'Enter your password.')
    .min(8, 'Your password needs at least 8 characters.')
    .max(72, 'Your password can be at most 72 characters.'), // Supabase's limit
})

/** One button: signs in, or creates the account if this email is new. */
export async function signInWithEmail(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '').trim()
  const parsed = credentials.safeParse({ email, password: String(form.get('password') ?? '') })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue.message, field: issue.path[0] === 'password' ? 'password' : 'email', email }
  }

  const supabase = await createClient()
  const signIn = await supabase.auth.signInWithPassword(parsed.data)
  if (!signIn.error) redirect('/')
  if (signIn.error.code !== 'invalid_credentials') {
    return { error: authMessage(signIn.error.code), email }
  }
  // ponytail: one button means sign-up reveals whether an email has an account; fine for this app.

  // Wrong password, or no account yet. Signing up tells us which.
  const signUp = await supabase.auth.signUp(parsed.data)
  if (signUp.error) {
    const code = signUp.error.code
    const field = code === 'user_already_exists' || code === 'email_exists' || code === 'weak_password'
      ? 'password' : code === 'email_address_invalid' ? 'email' : undefined
    return { error: authMessage(code), field, email }
  }
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
    case 'email_address_invalid':
      return 'That email address can’t be used. Check it for typos.'
    case 'anonymous_provider_disabled':
      return 'The demo is switched off right now. Sign in with email instead.'
    default:
      return 'Couldn’t sign you in. Check your connection and try again.'
  }
}
