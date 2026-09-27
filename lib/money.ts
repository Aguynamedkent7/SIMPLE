// All money is integer cents. Floats never touch a stored value.

export const MAX_CENTS = 99_999_999 // $999,999.99

/** "850", "850.5", "$1,200.50" → cents. Anything else (0, negative, letters, 3+ decimals,
 * "12,5") → null. Commas are only allowed as thousands separators. */
export function parseAmount(input: string): number | null {
  const s = input.trim().replace(/^\$/, '')
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(s)
  if (!m) return null
  const cents = Number(m[1].replace(/,/g, '')) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return cents > 0 && cents <= MAX_CENTS ? cents : null
}

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })

/** 428000 → "$4,280.00", 85050 → "$850.50", -124000 → "−$1,240.00" (real minus sign).
 * Always two decimals, so numbers stacked in a column line up. */
export function formatCents(cents: number): string {
  const abs = Math.abs(Math.round(cents))
  const s = aud.format(abs / 100)
  return cents < 0 ? `−${s}` : s
}
