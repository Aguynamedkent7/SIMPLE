/** One row of money in ('in', a finished job) or out ('out', something spent). */
export type Entry = {
  id: string
  type: 'in' | 'out'
  customer: string | null
  description: string
  amount_cents: number
  occurred_at: string
}

export type Totals = { moneyIn: number; moneyOut: number }

export const ENTRY_COLUMNS = 'id, type, customer, description, amount_cents, occurred_at'
export const BUSINESS_TZ = 'Australia/Sydney'
export const RECENT_LIMIT = 8
