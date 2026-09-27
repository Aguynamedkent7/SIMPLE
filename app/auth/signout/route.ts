import { redirect } from 'next/navigation'
import { getCurrentBusiness } from '@/lib/business'
import { createClient } from '@/lib/supabase/server'

/** Clears the cookies of a session that no longer works (revoked by Log out everywhere).
 * A live session is sent home instead, so a link from another site can't log anyone out. */
export async function GET() {
  const supabase = await createClient()
  if (await getCurrentBusiness(supabase)) redirect('/')
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}
