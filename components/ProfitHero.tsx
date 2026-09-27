import CountUp from './CountUp'

/** The one number that matters, with money in and out underneath. */
export default function ProfitHero({ moneyIn, moneyOut }: { moneyIn: number; moneyOut: number }) {
  const profit = moneyIn - moneyOut
  const black = profit >= 0 // Zero counts as in the black.
  return (
    <section aria-label="This month" className="mt-6">
      <div className={`transition-colors duration-500 ${black ? 'text-black-green' : 'text-red'}`}>
        <h2 className="text-lg font-semibold">Profit</h2>
        <CountUp
          cents={profit}
          className="-ml-0.5 text-[clamp(4rem,20vw,7rem)] leading-[0.95] font-extrabold tracking-tight"
        />
        <p aria-live="polite" className="mt-1 text-lg font-semibold">
          {black ? 'In the black' : 'In the red'}
        </p>
      </div>
      <dl className="mt-7 grid grid-cols-2 gap-4 border-t-2 border-line pt-5">
        <div>
          <dt className="text-steel">In</dt>
          <dd><CountUp cents={moneyIn} className="text-[2rem] leading-tight font-bold" /></dd>
        </div>
        <div>
          <dt className="text-steel">Out</dt>
          <dd><CountUp cents={moneyOut} className="text-[2rem] leading-tight font-bold" /></dd>
        </div>
      </dl>
    </section>
  )
}
