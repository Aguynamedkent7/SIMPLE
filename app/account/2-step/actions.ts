'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { FormState } from '@/app/(auth)/actions'
import { createClient } from '@/lib/supabase/server'

export type Enrollment = { factorId: string; qr: string; secret: string } | { error: string }

/** Step 1: a new authenticator secret, shown as a QR code. Not active until a code is confirmed. */
export async function startEnroll(): Promise<Enrollment> {
  const supabase = await createClient()
  // Clear half-finished attempts so they don't pile up.
  const { data: factors } = await supabase.auth.mfa.listFactors()
  for (const f of factors?.all ?? []) {
    if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp', issuer: 'One Login', friendlyName: 'Authenticator app',
  })
  if (error) return { error: 'Couldn’t start 2-step login. Reload and try again.' }
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}

/** Step 2: the first code proves the app is set up. The session moves to aal2 (2-step done). */
export async function confirmEnroll(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({
    factorId: z.uuid(),
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your app.'),
  }).safeParse({ factorId: form.get('factorId'), code: form.get('code') })
  if (!parsed.success) return { error: parsed.error.issues[0].message, field: 'code' }

  const supabase = await createClient()
  const { error } = await supabase.auth.mfa.challengeAndVerify(parsed.data)
  if (error) return { error: 'That code didn’t work. Enter the newest code from your app.', field: 'code' }
  redirect('/')
}

/** Only works from a session that already did 2-step login (Supabase Auth enforces aal2). */
export async function turnOff() {
  const supabase = await createClient()
  const { data } = await supabase.auth.mfa.listFactors()
  for (const f of data?.totp ?? []) await supabase.auth.mfa.unenroll({ factorId: f.id })
  // Refresh so the session's aal drops back and the cookie's factor list is current.
  await supabase.auth.refreshSession()
  redirect('/account/2-step')
}
