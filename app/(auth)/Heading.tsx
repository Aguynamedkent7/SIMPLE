export default function Heading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <>
      <h1 className="mt-8 font-sign text-[3.25rem] leading-[0.95] font-extrabold text-balance">{title}</h1>
      {children && <p className="mt-4 text-pretty text-steel">{children}</p>}
    </>
  )
}
