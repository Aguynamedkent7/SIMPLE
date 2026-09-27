'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/** `field` says which input the error is about, so the form can put it right under that input.
 * `done` replaces the form with a message. `values` refills the form after an error. */
export type FormState = {
  error?: string
  field?: string
  done?: string
  values?: Record<string, string>
}

const email = z.string().trim().min(1, 'Enter your email address.')
  .pipe(z.email('Enter a full email address, like sam@example.com.'))
  .pipe(z.string().max(254, 'That email address is too long.'))
// Same rules as Supabase Auth (supabase/config.toml and SECURITY.md), checked here first for a clear message.
const newPassword = z.string().min(1, 'Choose a password.')
  .min(12, 'Use at least 12 characters.')
  .max(72, 'Use 72 characters or fewer.') // bcrypt's limit
  .regex(/\p{L}/u, 'Add at least one letter.')
  .regex(/\d/, 'Add at least one number.')
const businessName = z.string().trim().min(1, 'Enter your business name.')
  .max(80, 'Keep it to 80 characters.')
  .regex(/^\P{Cc}*$/u, 'Use letters, numbers and punctuation only.')
const code = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your app.')

const read = (form: FormData, name: string) => String(form.get(name) ?? '')
// Turnstile puts its token in this hidden field. Supabase Auth checks it; we only pass it on.
const captchaToken = (form: FormData) => read(form, 'cf-turnstile-response') || undefined
// Where email links land. Supabase Auth only follows it if it's on the project's redirect allowlist.
const confirmUrl = async (next = '') =>
  `${(await headers()).get('origin') ?? ''}/auth/confirm${next && `?next=${next}`}`

function invalid(error: z.ZodError, values: Record<string, string>): FormState {
  const issue = error.issues[0]
  return { error: issue.message, field: String(issue.path[0]), values }
}

export async function logIn(_: FormState, form: FormData): Promise<FormState> {
  const values = { email: read(form, 'email').trim() }
  const parsed = z.object({
    email,
    password: z.string().min(1, 'Enter your password.').max(72, WRONG),
  }).safeParse({ email: values.email, password: read(form, 'password') })
  if (!parsed.success) return invalid(parsed.error, values)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    ...parsed.data, options: { captchaToken: captchaToken(form) },
  })
  if (error) return { error: authMessage(error.code), values }
  redirect('/') // the money screen asks for the 2-step code if they've turned it on
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const values = { business: read(form, 'business'), email: read(form, 'email').trim() }
  const parsed = z.object({ business: businessName, email, password: newPassword })
    .safeParse({ ...values, password: read(form, 'password') })
  if (!parsed.success) return invalid(parsed.error, values)

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    // The signup trigger makes the business from this. The user can't pick an existing one.
    options: {
      data: { business_name: parsed.data.business },
      captchaToken: captchaToken(form),
      emailRedirectTo: await confirmUrl(),
    },
  })
  if (error) {
    return { error: authMessage(error.code), field: error.code === 'weak_password' ? 'password' : undefined, values }
  }
  if (data.session) redirect('/') // only when email confirmation is off
  // Same answer whether or not the email already had an account.
  return { done: 'Check your email to confirm your account. The link opens One Login.' }
}

export async function requestReset(_: FormState, form: FormData): Promise<FormState> {
  const values = { email: read(form, 'email').trim() }
  const parsed = email.safeParse(values.email)
  if (!parsed.success) return invalid(parsed.error, values)

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    captchaToken: captchaToken(form),
    redirectTo: await confirmUrl('update-password'),
  })
  // Rate limits and the robot check say so. Nothing else tells you whether the email has an account.
  if (error && (error.code === 'captcha_failed' || error.code?.startsWith('over_'))) {
    return { error: authMessage(error.code), values }
  }
  return { done: 'If that email has an account, we’ve sent a reset link. It works for an hour.' }
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ password: newPassword }).safeParse({ password: read(form, 'password') })
  if (!parsed.success) return invalid(parsed.error, {})

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { error: authMessage(error.code), field: 'password' }
  }
  redirect('/')
}

/** The second step of 2-step login: the 6-digit code from their authenticator app. */
export async function verifyMfa(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ code }).safeParse({ code: read(form, 'code') })
  if (!parsed.success) return invalid(parsed.error, {})

  const supabase = await createClient()
  const { data } = await supabase.auth.mfa.listFactors()
  const factor = data?.totp[0]
  if (!factor) redirect('/')
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data.code })
  if (error) return { error: authMessage(error.code), field: 'code' }
  redirect('/')
}

const WRONG = 'Email or password is wrong.'

function authMessage(code: string | undefined): string {
  switch (code) {
    case 'invalid_credentials':
      return WRONG
    case 'email_not_confirmed': // only said when the password was right, so it gives nothing away
      return 'Confirm your email first. Tap the link we sent you, then log in.'
    case 'weak_password':
      return 'That password is too easy to guess or has shown up in a data breach. Pick another.'
    case 'same_password':
      return 'That’s your current password. Pick a new one.'
    case 'mfa_verification_failed':
    case 'mfa_challenge_expired':
      return 'That code didn’t work. Enter the newest code from your app.'
    case 'captcha_failed':
      return 'We couldn’t check you’re a person. Wait a moment, then try again.'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many tries. Wait a few minutes, then try again.'
    case 'signup_disabled':
      return 'New accounts are switched off right now.'
    default:
      return 'Something went wrong. Check your connection and try again.'
  }
}
