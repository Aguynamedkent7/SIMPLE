'use client'

import { useActionState } from 'react'
import { signInWithEmail, tryDemo, type LoginState } from './actions'

const input = 'mt-1.5 h-14 w-full rounded-xl border-2 border-line bg-surface px-4 text-[17px] ' +
  'outline-none focus:border-ink'

export default function LoginForm() {
  const [demo, runDemo, demoPending] = useActionState<LoginState>(tryDemo, {})
  const [email, runEmail, emailPending] = useActionState(signInWithEmail, {})

  return (
    <div className="mt-auto pt-12">
      <form action={runDemo}>
        <button
          disabled={demoPending}
          className="h-16 w-full rounded-2xl bg-hivis font-sign text-[1.75rem] font-bold text-[#1b2226] transition-transform active:scale-[0.98] active:bg-hivis-press disabled:text-[#1b2226]/60"
        >
          {demoPending ? 'Setting up…' : 'Try it now'}
        </button>
        {demo.error && <p role="alert" className="mt-3 text-red">{demo.error}</p>}
      </form>

      <details className="group mt-4" open={Boolean(email.error)}
        onToggle={(e) => e.currentTarget.open && e.currentTarget.scrollIntoView({ block: 'end', behavior: 'smooth' })}>
        <summary className="flex h-12 cursor-pointer list-none items-center justify-center gap-1.5 font-medium text-steel [&::-webkit-details-marker]:hidden">
          Sign in with email
          <svg viewBox="0 0 12 12" className="size-3 transition-transform group-open:rotate-180" aria-hidden="true">
            <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </summary>
        <form action={runEmail} className="mt-2 space-y-4" noValidate>
          <label className="block font-medium">
            Email
            <input name="email" type="email" autoComplete="email" inputMode="email" required
              defaultValue={email.email} className={input} />
          </label>
          <label className="block font-medium">
            Password
            <input name="password" type="password" autoComplete="current-password" required
              minLength={6} className={input} />
          </label>
          {email.error && <p role="alert" className="text-red">{email.error}</p>}
          <button
            disabled={emailPending}
            className="h-14 w-full rounded-2xl bg-ink font-semibold text-concrete active:scale-[0.98] disabled:opacity-70"
          >
            {emailPending ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-center text-sm text-steel">New here? The same button makes your account.</p>
        </form>
      </details>
    </div>
  )
}
