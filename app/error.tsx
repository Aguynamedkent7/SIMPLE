'use client'

import { useEffect } from 'react'

/** Shown when the page itself fails to load, e.g. the database didn't answer. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error])

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-6">
      <h1 className="font-sign text-[2.5rem] leading-none font-extrabold">Couldn’t load your numbers.</h1>
      <p className="mt-3 text-steel">
        Nothing you saved is lost. Check your signal, then try again.
      </p>
      <button
        onClick={retry}
        className="mt-8 h-16 w-full rounded-2xl bg-hivis font-sign text-[1.75rem] font-bold text-[#1b2226] active:scale-[0.98] active:bg-hivis-press"
      >
        Try again
      </button>
    </main>
  )
}
