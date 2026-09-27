// All money is integer cents. Floats never touch a stored value.

export const MAX_CENTS = 99_999_999 // $999,999.99

/** "850", "850.5", "$1,200.50" → cents. Anything else (0, negative, letters, 3+ decimals) → null. */
export function parseAmount(input: string): number | null {
  const s = input.trim().replace(/^\$/, '').replace(/,/g, '')
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s)
  if (!m) return null
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return cents > 0 && cents <= MAX_CENTS ? cents : null
}

const whole = new Intl.NumberFormat('en-AU', {
  style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0,
})
const exact = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })

/** 428000 → "$4,280", 85050 → "$850.50", -124000 → "−$1,240" (real minus sign). */
export function formatCents(cents: number): string {
  const abs = Math.abs(Math.round(cents))
  const s = (abs % 100 === 0 ? whole : exact).format(abs / 100)
  return cents < 0 ? `−${s}` : s
}
