'use client'

import { useEffect } from 'react'

export type ToastData = { id: number; message: string; undo?: () => void }

/** One toast at a time, gone after 5 seconds. Undo is the only action it ever offers. */
export default function Toast({ toast, onDone }: { toast: ToastData | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onDone, 5000)
    return () => clearTimeout(timer)
  }, [toast, onDone])

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-10 flex justify-center px-4">
      {toast && (
        <div
          key={toast.id}
          className="pointer-events-auto flex min-h-14 w-full max-w-[448px] items-center justify-between gap-3 rounded-2xl bg-ink py-1 pr-1 pl-5 text-concrete shadow-lg [animation:toast-in_250ms_cubic-bezier(0.2,0,0,1)]"
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => { toast.undo?.(); onDone() }}
              className="h-12 rounded-xl bg-hivis px-5 font-semibold text-[#1b2226] active:bg-hivis-press"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
