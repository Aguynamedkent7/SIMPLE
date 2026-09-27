import Link from 'next/link'
import { requireBusiness } from '@/lib/business'
import { createClient } from '@/lib/supabase/server'
import { turnOff } from './actions'
import Enroll from './Enroll'

export default async function TwoStepPage() {
  const supabase = await createClient()
  await requireBusiness(supabase) // same gate as the money screen
  const { data } = await supabase.auth.mfa.listFactors()
  const on = Boolean(data?.totp.length)

  return (
    <main className="mx-auto flex min-h-svh max-w-[480px] flex-col px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="flex h-12 items-center">
        <Link href="/" className="-ml-3 flex h-12 items-center px-3 text-[15px] font-medium text-steel">← Back</Link>
      </header>
      <h1 className="mt-4 font-sign text-[2.5rem] leading-none font-bold">2-step login</h1>
      {on ? (
        <>
          <p className="mt-4 text-pretty">
            <strong>On.</strong> Logging in asks for your password and a code from your authenticator app.
          </p>
          <form action={turnOff} className="mt-8">
            <button className="h-14 w-full rounded-2xl border-2 border-line font-semibold active:bg-line">
              Turn off 2-step login
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="mt-4 text-pretty text-steel">
            Someone with your password still can’t get in without the code from your phone.
          </p>
          <Enroll />
        </>
      )}
    </main>
  )
}
