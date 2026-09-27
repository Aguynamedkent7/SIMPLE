import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-[480px] flex-col px-6 pt-[max(4rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <svg viewBox="0 0 64 64" className="size-16" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="var(--hivis)" />
        <path d="M17 33l10 10 20-22" fill="none" stroke="#1b2226" strokeWidth="7"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h1 className="mt-8 font-sign text-[3.25rem] leading-[0.95] font-extrabold text-balance">
        Know where your month stands.
      </h1>
      <p className="mt-4 text-pretty text-steel">Money in, money out, and what you kept. One screen.</p>
      <LoginForm />
    </main>
  )
}
