import Link from 'next/link'
import { getOperationalExceptions, type OpCount } from '@/lib/actions/operational-exceptions'

const LABELS: Array<{ key: keyof Awaited<ReturnType<typeof getOperationalExceptions>>; title: string }> = [
  { key: 'callbacks', title: 'Tilbageringninger' },
  { key: 'unlinkedMail', title: 'Mail uden sag' },
  { key: 'missingPoa', title: 'Sager uden fuldmagt' },
  { key: 'supplierReview', title: 'Leverandørfakturaer til gennemgang' },
  { key: 'rateGaps', title: 'Medarbejdere uden sats' },
  { key: 'jobsToday', title: 'Job i dag' },
  { key: 'jobsWeek', title: 'Job denne uge' },
]

function Cell({ title, item }: { title: string; item: OpCount }) {
  if (item.state === 'hidden') return null
  const body = item.state === 'unknown' ? 'Ukendt' : String(item.count)
  const inner = (
    <>
      <p className="text-xs text-gray-500">{title}</p>
      <p className={`mt-1 text-2xl font-semibold ${item.state === 'unknown' ? 'text-amber-800' : 'text-gray-900'}`}>{body}</p>
      {item.note && <p className="mt-1 text-xs text-gray-500">{item.note}</p>}
    </>
  )
  const className = `rounded-lg border p-3 ${item.state === 'unknown' ? 'border-amber-200 bg-amber-50' : 'bg-white'}`
  if (!item.href) return <div className={className}>{inner}</div>
  return <Link href={item.href} className={`${className} block hover:border-gray-400`}>{inner}</Link>
}

export async function OperationalExceptions() {
  let data: Awaited<ReturnType<typeof getOperationalExceptions>>
  try {
    data = await getOperationalExceptions()
  } catch {
    return <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Driftstallene kunne ikke hentes. Det betyder ikke, at der er nul.</p>
  }
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold">Undtagelser</h2>
      <p className="text-xs text-gray-500">Køer der kræver et menneske. Et ukendt tal er ikke 0. Ufaktureret arbejde står i styringscockpittet.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {LABELS.map((item) => <Cell key={item.key} title={item.title} item={data[item.key]} />)}
      </div>
    </section>
  )
}
