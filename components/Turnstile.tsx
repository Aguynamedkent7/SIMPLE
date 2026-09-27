'use client'

import { useEffect, useRef } from 'react'

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

let script: Promise<TurnstileApi> | undefined
function loadTurnstile() {
  // Created by our own (nonce'd) code, so the strict CSP lets it run.
  return script ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve((window as unknown as { turnstile: TurnstileApi }).turnstile)
    s.onerror = () => { script = undefined; reject(new Error('Turnstile failed to load')) }
    document.head.append(s)
  })
}

/** Cloudflare Turnstile bot check. Invisible unless Cloudflare wants a tap. It adds a hidden
 * `cf-turnstile-response` field to the form, which Supabase Auth verifies. The site key comes
 * from the server (TURNSTILE_SITE_KEY); without one it renders nothing (local dev, CAPTCHA off).
 * Tokens are single-use: pass a new `reset` value after each submit to get a fresh one. */
export default function Turnstile({ siteKey, reset }: { siteKey?: string; reset: unknown }) {
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null)

  useEffect(() => {
    if (!siteKey) return
    let gone = false
    loadTurnstile().then((api) => {
      if (gone || !box.current) return
      widget.current = {
        api,
        id: api.render(box.current, { sitekey: siteKey, size: 'flexible', appearance: 'interaction-only' }),
      }
    }).catch(() => {}) // the server's "couldn't check you're a person" message covers it
    return () => {
      gone = true
      if (widget.current) widget.current.api.remove(widget.current.id)
      widget.current = null
    }
  }, [siteKey])

  useEffect(() => {
    if (widget.current) widget.current.api.reset(widget.current.id)
  }, [reset])

  return siteKey ? <div ref={box} /> : null
}
