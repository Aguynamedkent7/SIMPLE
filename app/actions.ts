'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { MAX_CENTS } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'

export type ActionResult = { error?: string }

const text = z.string().trim().min(1).max(80)
const entrySchema = z.object({
  id: z.uuid(),
  type: z.enum(['in', 'out']),
  customer: text.nullable(),
  description: text,
  amount_cents: z.number().int().positive().max(MAX_CENTS),
  // Only sent when Undo restores a deleted entry. New entries get the database's now().
  occurred_at: z.iso.datetime({ offset: true }).optional(),
}).refine((e) => (e.type === 'in') === (e.customer !== null)) // jobs have a customer, costs don't

/** Save a job ('in') or a cost ('out'). The client picks the id so Undo can find the row. */
export async function addEntry(input: unknown): Promise<ActionResult> {
  const parsed = entrySchema.safeParse(input)
  if (!parsed.success) return { error: 'That entry is missing something. Check it and try again.' }

  const supabase = await createClient()
  const { error } = await supabase.from('entries').insert(parsed.data)
  if (error) return { error: 'Couldn’t save that. Try again.' }
  refresh()
  return {}
}

export async function deleteEntry(id: unknown): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) return { error: 'Couldn’t find that entry.' }

  const supabase = await createClient()
  const { error } = await supabase.from('entries').delete().eq('id', parsed.data)
  if (error) return { error: 'Couldn’t delete that. Try again.' }
  refresh()
  return {}
}

export async function signOut() {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
  redirect('/login')
}
