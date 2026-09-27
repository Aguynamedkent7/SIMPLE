'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { signOut } from '@/app/actions'
import Turnstile from '@/components/Turnstile'
import {
  logIn, requestReset, signUp, updatePassword, verifyMfa, type FormState,
} from './actions'

const input = 'mt-1.5 h-14 w-full rounded-xl border-2 border-line bg-surface px-4 text-[17px] ' +
  'outline-none focus:border-ink aria-invalid:border-red'
const primary = 'h-14 w-full rounded-2xl bg-ink font-semibold text-concrete active:scale-[0.98] disabled:opacity-70'
const quiet = 'flex h-12 items-center justify-center font-medium text-steel'

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(logIn, {})
  const form = useFocusError(state)
  return (
    <form ref={form} action={action} className="mt-auto space-y-4 pt-12" noValidate>
      {notice && <p role="status" className="rounded-xl bg-surface p-4">{notice}</p>}
      <Field name="email" label="Email" type="email" autoComplete="email" inputMode="email"
        maxLength={254} state={state} />
      <PasswordField label="Password" autoComplete="current-password" state={state} />
      <Turnstile reset={state} />
      <FormError state={state} />
      <button disabled={pending} className={primary}>{pending ? 'Logging in…' : 'Log in'}</button>
      <div className="flex justify-between">
        <Link href="/reset-password" className={quiet}>Forgot password?</Link>
        <Link href="/signup" className={quiet}>Create account</Link>
      </div>
    </form>
  )
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, {})
  const form = useFocusError(state)
  if (state.done) return <Done message={state.done} />
  return (
    <form ref={form} action={action} className="mt-auto space-y-4 pt-12" noValidate>
      <Field name="business" label="Business name" autoComplete="organization" maxLength={80}
        state={state} />
      <Field name="email" label="Email" type="email" autoComplete="email" inputMode="email"
        maxLength={254} state={state} />
      <PasswordField label="Password" autoComplete="new-password" state={state} />
      <Turnstile reset={state} />
      <FormError state={state} />
      <button disabled={pending} className={primary}>{pending ? 'Creating…' : 'Create account'}</button>
      <Link href="/login" className={quiet}>Already have an account? Log in</Link>
    </form>
  )
}

export function ResetForm() {
  const [state, action, pending] = useActionState(requestReset, {})
  const form = useFocusError(state)
  if (state.done) return <Done message={state.done} />
  return (
    <form ref={form} action={action} className="mt-auto space-y-4 pt-12" noValidate>
      <Field name="email" label="Email" type="email" autoComplete="email" inputMode="email"
        maxLength={254} state={state} />
      <Turnstile reset={state} />
      <FormError state={state} />
      <button disabled={pending} className={primary}>{pending ? 'Sending…' : 'Send reset link'}</button>
      <Link href="/login" className={quiet}>Back to log in</Link>
    </form>
  )
}

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, {})
  const form = useFocusError(state)
  return (
    <form ref={form} action={action} className="mt-auto space-y-4 pt-12" noValidate>
      <PasswordField label="New password" autoComplete="new-password" state={state} />
      <FormError state={state} />
      <button disabled={pending} className={primary}>{pending ? 'Saving…' : 'Save password'}</button>
    </form>
  )
}

export function MfaForm() {
  const [state, action, pending] = useActionState(verifyMfa, {})
  const form = useFocusError(state)
  return (
    <div className="mt-auto pt-12">
      <form ref={form} action={action} className="space-y-4" noValidate>
        <CodeField state={state} />
        <button disabled={pending} className={primary}>{pending ? 'Checking…' : 'Continue'}</button>
      </form>
      <form action={signOut}><button className={`${quiet} w-full`}>Log out</button></form>
    </div>
  )
}

/** The 6-digit authenticator code. Phones offer to fill it from the keyboard. */
export function CodeField({ state }: { state: FormState }) {
  return (
    <Field name="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code"
      pattern="[0-9]*" maxLength={6} autoFocus state={state}
      className={`${input} num text-center text-[1.75rem] tracking-[0.3em]`} />
  )
}

function Field({ name, label, state, className = input, ...props }: {
  name: string
  label: string
  state: FormState
} & InputHTMLAttributes<HTMLInputElement>) {
  const error = state.field === name ? state.error : undefined
  return (
    <div>
      <label className="block font-medium">
        {label}
        <input name={name} required defaultValue={state.values?.[name]} aria-invalid={Boolean(error)}
          aria-describedby={error ? `${name}-error` : undefined} className={className} {...props} />
      </label>
      {error && <p id={`${name}-error`} role="alert" className="mt-1.5 text-red">{error}</p>}
    </div>
  )
}

/** Password with a show/hide toggle. New passwords get a live hint of what's still missing. */
function PasswordField({ label, autoComplete, state }: {
  label: string
  autoComplete: 'current-password' | 'new-password'
  state: FormState
}) {
  const [shown, setShown] = useState(false)
  const [value, setValue] = useState('')
  const error = state.field === 'password' ? state.error : undefined
  const isNew = autoComplete === 'new-password'
  return (
    <div>
      <label htmlFor="password" className="block font-medium">{label}</label>
      <div className="relative">
        <input id="password" name="password" type={shown ? 'text' : 'password'} required
          autoComplete={autoComplete} maxLength={72} onChange={(e) => setValue(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={[error && 'password-error', isNew && 'password-hint'].filter(Boolean).join(' ') || undefined}
          className={`${input} pr-20`} />
        <button type="button" onClick={() => setShown(!shown)} aria-pressed={shown}
          aria-label={shown ? 'Hide password' : 'Show password'}
          className="absolute top-1.5 right-0 h-14 px-4 text-[15px] font-medium text-steel">
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <p id="password-error" role="alert" className="mt-1.5 text-red">{error}</p>}
      {isNew && <p id="password-hint" aria-live="polite" className="mt-1.5 text-sm text-steel">{hint(value)}</p>}
    </div>
  )
}

function hint(password: string) {
  if (!password) return 'Use 12 or more characters, with letters and numbers.'
  const short = 12 - password.length
  const missing = [
    short > 0 && `${short} more character${short === 1 ? '' : 's'}`,
    !/\p{L}/u.test(password) && 'a letter',
    !/\d/.test(password) && 'a number',
  ].filter(Boolean)
  return missing.length ? `Needs ${missing.join(', ')}.` : 'Strong enough. ✓'
}

function FormError({ state }: { state: FormState }) {
  return state.error && !state.field ? <p role="alert" className="text-red">{state.error}</p> : null
}

function Done({ message }: { message: string }) {
  return (
    <div className="mt-auto pt-12">
      <p role="status" className="rounded-xl bg-surface p-4 text-[17px]">{message}</p>
      <Link href="/login" className={quiet}>Back to log in</Link>
    </div>
  )
}

/** Put the cursor in the field that needs fixing. */
function useFocusError(state: FormState) {
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state.field) form.current?.querySelector<HTMLInputElement>(`[name=${state.field}]`)?.focus()
  }, [state])
  return form
}
