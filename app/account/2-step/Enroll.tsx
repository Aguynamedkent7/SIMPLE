'use client'

import { useActionState, useState, useTransition } from 'react'
import { CodeField } from '@/app/(auth)/forms'
import { confirmEnroll, startEnroll, type Enrollment } from './actions'

const primary = 'h-14 w-full rounded-2xl bg-ink font-semibold text-concrete active:scale-[0.98] disabled:opacity-70'

export default function Enroll() {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [starting, start] = useTransition()
  const [state, action, pending] = useActionState(confirmEnroll, {})

  if (!enrollment || 'error' in enrollment) {
    return (
      <div className="mt-8">
        <button disabled={starting} className={primary}
          onClick={() => start(async () => setEnrollment(await startEnroll()))}>
          {starting ? 'Setting up…' : 'Turn on 2-step login'}
        </button>
        {enrollment && <p role="alert" className="mt-3 text-red">{enrollment.error}</p>}
      </div>
    )
  }
  return (
    <form action={action} className="mt-8 space-y-4" noValidate>
      <p>1. Scan this with an authenticator app (Google Authenticator, 1Password, Authy…).</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI SVG from Supabase */}
      <img src={enrollment.qr} alt="QR code for your authenticator app"
        className="mx-auto size-52 rounded-xl bg-white p-2" />
      <p className="text-sm text-steel">
        Can’t scan? Type this key instead: <span className="num break-all select-all">{enrollment.secret}</span>
      </p>
      <p>2. Type the 6-digit code it shows.</p>
      <input type="hidden" name="factorId" value={enrollment.factorId} />
      <CodeField state={state} />
      <button disabled={pending} className={primary}>{pending ? 'Checking…' : 'Turn it on'}</button>
    </form>
  )
}
