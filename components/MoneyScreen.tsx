'use client'

import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from 'react'
import { flushSync } from 'react-dom'
import Link from 'next/link'
import { addEntry, deleteEntry, signOut, signOutEverywhere, type ActionResult } from '@/app/actions'
import type { Entry, Totals } from '@/lib/entries'
import EntrySheet, { type EntryKind, type NewEntry } from './EntrySheet'
import ProfitHero, { label } from './ProfitHero'
import RecentList from './RecentList'
import Toast, { type ToastData } from './Toast'

type State = Totals & { recent: Entry[]; show: number }
type Change = { add: Entry } | { remove: Entry }

// Applies a change locally so the screen updates the instant Save is tapped.
function apply(state: State, change: Change): State {
  const entry = 'add' in change ? change.add : change.remove
  const sign = 'add' in change ? 1 : -1
  const delta = sign * entry.amount_cents
  const recent = 'add' in change
    ? [entry, ...state.recent].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .slice(0, state.show)
    : state.recent.filter((e) => e.id !== entry.id)
  return entry.type === 'in'
    ? { ...state, moneyIn: state.moneyIn + delta, recent }
    : { ...state, moneyOut: state.moneyOut + delta, recent }
}

export default function MoneyScreen({ month, business, email, totals, recent, show, more, customers }: {
  month: string
  business: string
  email: string
  totals: Totals
  recent: Entry[]
  show: number
  more: boolean
  customers: string[]
}) {
  const [state, applyOptimistic] = useOptimistic({ ...totals, recent, show }, apply)
  const scrolled = useScrolledPast(400)
  const [, startTransition] = useTransition()
  const [toast, setToast] = useState<ToastData | null>(null)
  const [sheet, setSheet] = useState<{ kind: EntryKind; count: number }>({ kind: 'in', count: 0 })
  const dialog = useRef<HTMLDialogElement>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const say = (message: string, undo?: () => void) => setToast({ id: Date.now(), message, undo })

  // Optimistic change + server action. On failure the optimistic state rolls back by itself.
  function run(change: Change, action: () => Promise<ActionResult>, done?: () => void) {
    const entry = 'add' in change ? change.add : change.remove
    const lost = entry.type === 'in' ? 'This job wasn’t saved.' : 'This wasn’t saved.'
    if (!navigator.onLine) return say(`You’re offline. ${lost}`)
    startTransition(async () => {
      applyOptimistic(change)
      const result = await action().catch((): ActionResult => ({
        error: navigator.onLine ? 'Something went wrong. Try again.' : `You’re offline. ${lost}`,
      }))
      if (result.error) say(result.error)
      else done?.()
    })
  }

  function save(input: NewEntry | Entry, toast = true) {
    const entry: Entry = { id: crypto.randomUUID(), occurred_at: new Date().toISOString(), ...input }
    // A brand-new entry takes the server's clock; a restored one keeps its original time.
    const payload = 'id' in input ? input : { ...input, id: entry.id }
    run({ add: entry }, () => addEntry(payload), () => {
      navigator.vibrate?.(10)
      if (toast) say(entry.type === 'in' ? 'Job saved' : 'Saved', () => remove(entry, false))
    })
  }

  function remove(entry: Entry, toast = true) {
    run({ remove: entry }, () => deleteEntry(entry.id), () => {
      if (toast) say('Deleted', () => save(entry, false))
    })
  }

  function openSheet(kind: EntryKind) {
    // Synchronous render + focus inside the tap, so iOS raises the keyboard.
    flushSync(() => setSheet(({ count }) => ({ kind, count: count + 1 })))
    history.pushState({ ...history.state, sheet: true }, '')
    dialog.current?.showModal()
    dialog.current?.querySelector('input')?.focus()
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-[480px] flex-col px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(10rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <h1 className="font-sign text-[2rem] font-bold">{month}</h1>
        <button popoverTarget="account" className="-mr-3 h-12 px-3 text-[15px] font-medium text-steel">
          Menu
        </button>
        <div id="account" popover="auto" className="menu">
          <p className="truncate px-4 pt-3 pb-2 text-sm text-steel">{email}</p>
          <Link href="/account/2-step" className="menu-item">2-step login</Link>
          <form action={signOut}><button className="menu-item">Log out</button></form>
          <form action={signOutEverywhere}><button className="menu-item">Log out everywhere</button></form>
        </div>
      </header>
      <p className="truncate text-[15px] text-steel">{business}</p>

      <ProfitHero moneyIn={state.moneyIn} moneyOut={state.moneyOut} />

      <section aria-labelledby="recent" className="mt-9">
        <h2 id="recent" className={label}>Recent</h2>
        <RecentList entries={state.recent} onDelete={remove} more={more} show={show} />
      </section>

      <div className="fixed inset-x-0 bottom-0 bg-linear-to-t from-concrete from-60% to-transparent pt-10 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-[480px] px-6">
          <Toast toast={toast} onDone={clearToast} />
          <button
            onClick={() => openSheet('in')}
            className="h-16 w-full rounded-2xl bg-hivis font-sign text-[1.75rem] font-bold text-[#1b2226] shadow-(--hivis-shadow) transition-transform active:scale-[0.98] active:bg-hivis-press"
          >
            Job done
          </button>
          <div className="mt-2 flex">
            <button onClick={() => openSheet('out')}
              className="h-12 flex-1 rounded-2xl border-2 border-line bg-concrete font-semibold active:bg-line">
              Spent
            </button>
            <button
              aria-label="Back to top"
              inert={!scrolled}
              onClick={() => scrollTo({
                top: 0,
                behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
              })}
              // Always rendered, so it can slide in and out instead of popping.
              className={`grid h-12 shrink-0 place-items-center overflow-hidden rounded-2xl border-line bg-concrete transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] active:bg-line ${
                scrolled ? 'ml-2 w-12 border-2 opacity-100' : 'ml-0 w-0 border-0 opacity-0'}`}
            >
              <svg viewBox="0 0 16 16" className="size-5" aria-hidden="true">
                <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <EntrySheet ref={dialog} kind={sheet.kind} openCount={sheet.count} customers={customers}
        onSave={(entry) => save(entry)} />
    </main>
  )
}

/** True once the page has scrolled more than `px` down. */
function useScrolledPast(px: number) {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const update = () => setPast(scrollY > px)
    addEventListener('scroll', update, { passive: true })
    return () => removeEventListener('scroll', update)
  }, [px])
  return past
}
