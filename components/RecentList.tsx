'use client'

import { useState } from 'react'
import type { Entry } from '@/lib/entries'
import { formatCents } from '@/lib/money'

/** This month's latest entries. Tap one to reveal Delete. */
export default function RecentList({ entries, onDelete }: {
  entries: Entry[]
  onDelete: (entry: Entry) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (entries.length === 0) {
    return (
      <p className="mt-4 text-steel">No jobs yet this month. Tap Job done when you finish one.</p>
    )
  }
  return (
    <ul className="mt-2 divide-y divide-line">
      {entries.map((entry) => {
        const open = openId === entry.id
        const label = entry.type === 'in'
          ? `${entry.customer} · ${entry.description}` : entry.description
        return (
          <li key={entry.id} className="flex items-center gap-3">
            <button
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : entry.id)}
              className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 text-left"
            >
              <span className="truncate">{label}</span>
              <span className={`num shrink-0 text-xl font-bold ${entry.type === 'out' ? 'text-red' : ''}`}>
                {formatCents(entry.type === 'out' ? -entry.amount_cents : entry.amount_cents)}
              </span>
            </button>
            {open && (
              <button
                onClick={() => { setOpenId(null); onDelete(entry) }}
                className="h-12 shrink-0 rounded-xl bg-red px-4 font-semibold text-concrete"
              >
                Delete
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
