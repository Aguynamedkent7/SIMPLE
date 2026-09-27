'use client'

import { useEffect, useRef, useState } from 'react'
import { formatCents } from '@/lib/money'

const DURATION = 700

/** Shows cents as money; when the value changes it counts to the new one and pulses once. */
export default function CountUp({ cents, className, testId }: {
  cents: number
  className?: string
  testId?: string
}) {
  const [shown, setShown] = useState(cents)
  const current = useRef(cents) // what's on screen, so an interrupted count resumes from there
  const el = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const start = current.current
    if (start === cents) return
    const show = (value: number) => setShown((current.current = value))
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return show(cents)

    el.current?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.04)', filter: 'brightness(1.25)' },
        { transform: 'scale(1)' }],
      { duration: 500, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    )
    const t0 = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const p = Math.min((now - t0) / DURATION, 1)
      const eased = 1 - (1 - p) ** 3
      // Whole dollars while moving so the width doesn't flicker between $1,234 and $1,234.56.
      show(p < 1 ? Math.round((start + (cents - start) * eased) / 100) * 100 : cents)
      if (p < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [cents])

  return (
    <span ref={el} data-testid={testId} className={`num inline-block origin-left ${className ?? ''}`}>
      {formatCents(shown)}
    </span>
  )
}
