'use client'

import { useCallback, useOptimistic, useRef, useState, useTransition } from 'react'
import { flushSync } from 'react-dom'
import { addEntry, deleteEntry, signOut, type ActionResult } from '@/app/actions'
import { RECENT_LIMIT, type Entry, type Totals } from '@/lib/entries'
import EntrySheet, { type EntryKind, type NewEntry } from './EntrySheet'
import ProfitHero from './ProfitHero'
import RecentList from './RecentList'
import Toast, { type ToastData } from './Toast'

type State = Totals & { recent: Entry[] }
type Change = { add: Entry } | { remove: Entry }

// Applies a change locally so the screen updates the instant Save is tapped.
function apply(state: State, change: Change): State {
  const entry = 'add' in change ? change.add : change.remove
  const sign = 'add' in change ? 1 : -1
  const delta = sign * entry.amount_cents
  const recent = 'add' in change
    ? [entry, ...state.recent].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .slice(0, RECENT_LIMIT)
    : state.recent.filter((e) => e.id !== entry.id)
  return entry.type === 'in'
    ? { ...state, moneyIn: state.moneyIn + delta, recent }
    : { ...state, moneyOut: state.moneyOut + delta, recent }
}

export default function MoneyScreen({ month, totals, recent, customers }: {
  month: string
  totals: Totals
  recent: Entry[]
  customers: string[]
}) {
  const [state, applyOptimistic] = useOptimistic({ ...totals, recent }, apply)
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
    dialog.current?.showModal()
    dialog.current?.querySelector('input')?.focus()
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(10rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <h1 className="font-sign text-[2rem] font-bold">{month}</h1>
        <form action={signOut}>
          <button className="-mr-3 h-12 px-3 font-medium text-steel">Sign out</button>
        </form>
      </header>

      <ProfitHero moneyIn={state.moneyIn} moneyOut={state.moneyOut} />

      <section aria-labelledby="recent" className="mt-9">
        <h2 id="recent" className="text-lg font-semibold">Recent</h2>
        <RecentList entries={state.recent} onDelete={remove} />
      </section>

      <div className="fixed inset-x-0 bottom-0 bg-linear-to-t from-concrete from-75% to-transparent pt-6 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-[480px] px-6">
          <button
            onClick={() => openSheet('in')}
            className="h-16 w-full rounded-2xl bg-hivis font-sign text-[1.75rem] font-bold text-[#1b2226] shadow-[0_2px_0_rgb(0_0_0/0.12)] transition-transform active:scale-[0.98] active:bg-hivis-press"
          >
            Job done
          </button>
          <button onClick={() => openSheet('out')} className="h-12 w-full font-semibold text-steel">
            Spent
          </button>
        </div>
      </div>

      <Toast toast={toast} onDone={clearToast} />
      <EntrySheet ref={dialog} kind={sheet.kind} openCount={sheet.count} customers={customers}
        onSave={(entry) => save(entry)} />
    </main>
  )
}
