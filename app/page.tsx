import MoneyScreen from '@/components/MoneyScreen'
import { BUSINESS_TZ, ENTRY_COLUMNS, PAGE_SIZE, type Entry } from '@/lib/entries'
import { createClient } from '@/lib/supabase/server'

export default async function Home({ searchParams }: {
  searchParams: Promise<{ show?: string | string[] }>
}) {
  // ?show=24 after two taps of Load more. Whole pages only, capped so a hand-typed URL can't ask for everything.
  const show = Math.min(Math.max(Math.ceil(Number((await searchParams).show) / PAGE_SIZE) || 1, 1), 50) * PAGE_SIZE
  const supabase = await createClient()
  const [claims, totals, recent, pastCustomers] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc('month_totals', { tz: BUSINESS_TZ }).single<{ money_in: number; money_out: number }>(),
    supabase.rpc('month_entries', { tz: BUSINESS_TZ }).select(ENTRY_COLUMNS)
      .order('occurred_at', { ascending: false }).limit(show + 1), // one extra tells us there's more
    // ponytail: scans the last 500 jobs for names; a distinct SQL view if customer lists get huge.
    supabase.from('entries').select('customer').eq('type', 'in')
      .order('occurred_at', { ascending: false }).limit(500).overrideTypes<{ customer: string }[]>(),
  ])
  if (claims.error) throw claims.error
  if (totals.error) throw totals.error
  if (recent.error) throw recent.error
  if (pastCustomers.error) throw pastCustomers.error

  const rows = recent.data as Entry[]

  // Distinct, most recent first, ignoring case ("smith" and "Smith" are the same person).
  const seen = new Set<string>()
  const customers = pastCustomers.data
    .map((row) => row.customer)
    .filter((name) => !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()))

  return (
    <MoneyScreen
      month={new Intl.DateTimeFormat('en-AU', { month: 'long', timeZone: BUSINESS_TZ }).format()}
      // null for the demo; otherwise the account's email, so a typo'd sign-in is obvious.
      email={claims.data?.claims.is_anonymous ? null : claims.data?.claims.email ?? null}
      totals={{ moneyIn: Number(totals.data.money_in), moneyOut: Number(totals.data.money_out) }}
      recent={rows.slice(0, show)}
      show={show}
      more={rows.length > show}
      customers={customers}
    />
  )
}
