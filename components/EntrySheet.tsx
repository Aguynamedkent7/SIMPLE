'use client'

import {
  useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref, type RefObject,
} from 'react'
import { parseAmount } from '@/lib/money'

export type EntryKind = 'in' | 'out'
export type NewEntry = {
  type: EntryKind
  customer: string | null
  description: string
  amount_cents: number
}

/** Slide the sheet down, then actually close the dialog. */
export function closeSheet(dialog: HTMLDialogElement | null) {
  if (!dialog?.open || dialog.dataset.closing) return
  dialog.dataset.closing = ''
  dialog.addEventListener('animationend', () => {
    dialog.close()
    delete dialog.dataset.closing
    dialog.style.transform = ''
  }, { once: true })
}

/** Bottom sheet for Job done and Spent. Open it with showModal() on the dialog ref. */
export default function EntrySheet({ ref, kind, openCount, customers, onSave }: {
  ref: RefObject<HTMLDialogElement | null>
  kind: EntryKind
  openCount: number
  customers: string[]
  onSave: (entry: NewEntry) => void
}) {
  useKeyboardInset(ref)
  const drag = useSwipeDown(ref)

  return (
    <dialog
      ref={ref as Ref<HTMLDialogElement>}
      aria-labelledby="sheet-title"
      className="sheet"
      onCancel={(e) => { e.preventDefault(); closeSheet(ref.current) }}
      onClick={(e) => { if (e.target === ref.current) closeSheet(ref.current) }}
    >
      <div {...drag} className="touch-none px-6 pt-3 pb-1">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-line" />
        <h2 id="sheet-title" className="mt-4 font-sign text-[2rem] leading-none font-bold">
          {kind === 'in' ? 'Job done' : 'Spent'}
        </h2>
      </div>
      <EntryForm
        key={openCount}
        kind={kind}
        customers={customers}
        onSave={(entry) => { onSave(entry); closeSheet(ref.current) }}
      />
    </dialog>
  )
}

const field = 'mt-1.5 h-14 w-full rounded-xl border-2 border-line bg-concrete px-4 text-[17px] ' +
  'outline-none focus:border-ink'

function EntryForm({ kind, customers, onSave }: {
  kind: EntryKind
  customers: string[]
  onSave: (entry: NewEntry) => void
}) {
  const [customer, setCustomer] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const descriptionRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const cents = parseAmount(amount)
  const valid = cents !== null && description.trim() !== '' && (kind === 'out' || customer.trim() !== '')

  const q = customer.trim().toLowerCase()
  const suggestions = kind === 'in'
    ? customers
      .filter((name) => name.toLowerCase() !== q && name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)))
      .slice(0, 3)
    : []


  return (
    <form
      className="space-y-4 px-6 pt-3 pb-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        onSave({
          type: kind,
          customer: kind === 'in' ? customer.trim() : null,
          description: description.trim(),
          amount_cents: cents,
        })
      }}
    >
      {kind === 'in' && (
        <div>
          <label className="block font-medium">
            Customer
            <input value={customer} onChange={(e) => setCustomer(e.target.value)}
              onKeyDown={(e) => nextOnEnter(e, descriptionRef)} enterKeyHint="next" maxLength={80}
              autoComplete="off" autoCapitalize="words" placeholder="Name" className={field} />
          </label>
          {suggestions.length > 0 && (
            <div role="group" aria-label="Past customers" className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((name) => (
                <button key={name} type="button"
                  onClick={() => { setCustomer(name); descriptionRef.current?.focus() }}
                  className="min-h-12 rounded-full border-2 border-line px-4 font-medium active:bg-line">
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <label className="block font-medium">
        {kind === 'in' ? 'Job' : 'What for'}
        <input ref={descriptionRef} value={description}
          onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => nextOnEnter(e, amountRef)}
          enterKeyHint="next" maxLength={80} autoComplete="off" autoCapitalize="sentences"
          placeholder={kind === 'in' ? 'Hot water system' : 'Bunnings supplies'} className={field} />
      </label>
      <label className="block font-medium">
        {kind === 'in' ? 'Price' : 'Amount'}
        <span className="relative block">
          <span aria-hidden="true" className="num pointer-events-none absolute top-1/2 left-4 mt-0.75 -translate-y-1/2 text-xl text-steel">$</span>
          <input ref={amountRef} value={amount} onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal" enterKeyHint="done" maxLength={13} autoComplete="off"
            placeholder="0" className={`${field} num pl-9 text-xl font-bold`} />
        </span>
      </label>
      <button
        disabled={!valid}
        className="mt-2 h-16 w-full rounded-2xl bg-hivis font-sign text-[1.75rem] font-bold text-[#1b2226] transition active:scale-[0.98] active:bg-hivis-press disabled:bg-line disabled:text-steel"
      >
        {kind === 'in' ? 'Save job' : 'Save'}
      </button>
    </form>
  )
}

/** Enter on the keyboard moves to the next field instead of submitting early. */
function nextOnEnter(e: KeyboardEvent, next: RefObject<HTMLInputElement | null>) {
  if (e.key === 'Enter') { e.preventDefault(); next.current?.focus() }
}

/** iOS Safari lets the keyboard cover fixed elements; lift the sheet above it. */
function useKeyboardInset(ref: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => ref.current?.style.setProperty(
      '--kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`)
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [ref])
}

/** Drag the sheet's header down past 80px to close it. */
function useSwipeDown(ref: RefObject<HTMLDialogElement | null>) {
  const startY = useRef<number | null>(null)
  const offset = useRef(0)
  const release = () => {
    const dialog = ref.current
    startY.current = null
    if (!dialog) return
    if (offset.current > 80) return closeSheet(dialog)
    dialog.animate([{ transform: dialog.style.transform }, { transform: 'translateY(0)' }],
      { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
    dialog.style.transform = ''
  }
  return {
    onPointerUp: release,
    onPointerCancel: release,
    onPointerDown(e: PointerEvent) {
      startY.current = e.clientY
      offset.current = 0
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove(e: PointerEvent) {
      const dialog = ref.current
      if (startY.current === null || !dialog) return
      offset.current = Math.max(0, e.clientY - startY.current)
      dialog.style.transform = `translateY(${offset.current}px)`
    },
  }
}
