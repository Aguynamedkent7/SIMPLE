'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getCurrentBusiness } from '@/lib/business'
import { MAX_CENTS } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'

export type ActionResult = { error?: string }

// Single-line text: no control characters (newlines, tabs, NUL) sneaking past the form.
const text = z.string().trim().min(1).max(80).regex(/^\P{Cc}*$/u)
// Strict: an extra key (say, business_id) fails the whole payload instead of being dropped.
const entrySchema = z.strictObject({
  id: z.uuid(),
  type: z.enum(['in', 'out']),
  customer: text.nullable(),
  description: text,
  amount_cents: z.number().int().positive().max(MAX_CENTS),
  // Only sent when Undo restores a deleted entry. New entries get the database's now().
  occurred_at: z.iso.datetime({ offset: true })
    .refine((at) => Date.parse(at) <= Date.now() + 60_000) // never in the future
    .optional(),
}).refine((e) => (e.type === 'in') === (e.customer !== null)) // jobs have a customer, costs don't

/** Save a job ('in') or a cost ('out'). The client picks the id so Undo can find the row. */
export async function addEntry(input: unknown): Promise<ActionResult> {
  const supabase = await createClient()
  const business = await getCurrentBusiness(supabase)
  if (!business) return { error: SIGNED_OUT }
  const parsed = entrySchema.safeParse(input)
  if (!parsed.success) return { error: 'That entry is missing something. Check it and try again.' }

  const { error } = await supabase.from('entries').insert({ ...parsed.data, business_id: business.id })
  if (error) return { error: 'Couldn’t save that. Try again.' }
  refresh()
  return {}
}

export async function deleteEntry(id: unknown): Promise<ActionResult> {
  const supabase = await createClient()
  const business = await getCurrentBusiness(supabase)
  if (!business) return { error: SIGNED_OUT }
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) return { error: 'Couldn’t find that entry.' }

  const { error } = await supabase.from('entries').delete()
    .eq('id', parsed.data).eq('business_id', business.id) // RLS enforces this anyway
  if (error) return { error: 'Couldn’t delete that. Try again.' }
  refresh()
  return {}
}

const SIGNED_OUT = 'You’ve been logged out. Reload the page and log in again.'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}

/** Ends every session on every device. RLS checks the session is live, so they lose access at once. */
export async function signOutEverywhere() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/login')
}
