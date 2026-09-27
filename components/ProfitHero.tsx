import { formatCents } from '@/lib/money'
import CountUp from './CountUp'

export const label = 'text-[15px] font-medium tracking-[0.01em] text-steel'

/** The one number that matters, with money in and out underneath. */
export default function ProfitHero({ moneyIn, moneyOut }: { moneyIn: number; moneyOut: number }) {
  const profit = moneyIn - moneyOut
  const black = profit >= 0 // Zero counts as in the black.
  const empty = moneyIn === 0 && moneyOut === 0
  // Long figures like −$17,161.25 step down a size so they stay on one line.
  const size = formatCents(profit).length > 10
    ? 'text-[clamp(3.25rem,16vw,5.75rem)]' : 'text-[clamp(4rem,20vw,7rem)]'
  const tone = empty ? 'text-ink' : black ? 'text-black-green' : 'text-red'
  return (
    <section aria-label="This month" className="mt-6">
      <h2 className={label}>Profit</h2>
      <div className={`transition-colors duration-500 ${tone}`}>
        <CountUp
          cents={profit}
          testId="profit"
          className={`-ml-0.5 ${size} leading-[0.95] font-extrabold`}
        />
        <p aria-live="polite" className="mt-1 font-semibold">
          {empty ? 'Nothing logged yet' : black ? 'In the black' : 'In the red'}
        </p>
      </div>
      <dl className="mt-7 grid grid-cols-2 gap-4 border-t-2 border-line pt-5">
        <div>
          <dt className={label}>In</dt>
          <dd><CountUp cents={moneyIn} testId="in" className="text-[2rem] leading-tight font-bold" /></dd>
        </div>
        <div>
          <dt className={label}>Out</dt>
          <dd><CountUp cents={moneyOut} testId="out" className="text-[2rem] leading-tight font-bold" /></dd>
        </div>
      </dl>
    </section>
  )
}
