'use client'

import { useEffect, useRef, useState } from 'react'
import { formatCents } from '@/lib/money'

const DURATION = 700
const DELAY = 180 // let the entry sheet finish sliding away first

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
      { duration: 500, delay: DELAY, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    )
    const t0 = performance.now() + DELAY
    let frame = requestAnimationFrame(function tick(now) {
      const p = Math.min(Math.max(now - t0, 0) / DURATION, 1)
      const eased = 1 - (1 - p) ** 3
      show(p < 1 ? Math.round(start + (cents - start) * eased) : cents)
      if (p < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [cents])

  // "−$1,234.56" → "−", "1,234", "56": the $ and cents are set small, like a price tag.
  const [, minus, dollars, c] = /^(−?)\$([\d,]+)\.(\d\d)$/.exec(formatCents(shown))!
  return (
    <span ref={el} data-testid={testId}
      className={`num inline-block origin-left whitespace-nowrap ${className ?? ''}`}>
      {minus}<span className="mr-[0.04em] align-[0.38em] text-[0.55em]">$</span>
      <span className="tracking-[-0.02em]">{dollars}</span>
      <span className="align-[0.72em] text-[0.5em] opacity-90">.{c}</span>
    </span>
  )
}
