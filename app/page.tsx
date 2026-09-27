import MoneyScreen from '@/components/MoneyScreen'
import { BUSINESS_TZ, ENTRY_COLUMNS, RECENT_LIMIT, type Entry } from '@/lib/entries'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const [totals, recent, pastCustomers] = await Promise.all([
    supabase.rpc('month_totals', { tz: BUSINESS_TZ }).single<{ money_in: number; money_out: number }>(),
    supabase.rpc('month_entries', { tz: BUSINESS_TZ }).select(ENTRY_COLUMNS)
      .order('occurred_at', { ascending: false }).limit(RECENT_LIMIT),
    // ponytail: scans the last 500 jobs for names; a distinct SQL view if customer lists get huge.
    supabase.from('entries').select('customer').eq('type', 'in')
      .order('occurred_at', { ascending: false }).limit(500).overrideTypes<{ customer: string }[]>(),
  ])
  if (totals.error) throw totals.error
  if (recent.error) throw recent.error
  if (pastCustomers.error) throw pastCustomers.error

  // Distinct, most recent first, ignoring case ("smith" and "Smith" are the same person).
  const seen = new Set<string>()
  const customers = pastCustomers.data
    .map((row) => row.customer)
    .filter((name) => !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()))

  return (
    <MoneyScreen
      month={new Intl.DateTimeFormat('en-AU', { month: 'long', timeZone: BUSINESS_TZ }).format()}
      totals={{ moneyIn: Number(totals.data.money_in), moneyOut: Number(totals.data.money_out) }}
      recent={recent.data as Entry[]}
      customers={customers}
    />
  )
}
