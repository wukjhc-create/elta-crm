'use client'

/**
 * N53: salgstragt pr. måned — nye kunder → tilbud → sendt → accepteret → faktureret (salgsværdier, ingen kost).
 */
import { TrendingUp } from 'lucide-react'
import { funnelMonthRates, type SalesFunnel } from '@/lib/reports/sales-funnel'

const kr = (n: number) => new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(n)
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('da-DK', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const pct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('da-DK', { maximumFractionDigits: 1 })} %`)

export function SalesFunnelTable({ data, error = false }: { data: SalesFunnel | null; error?: boolean }) {
  if (!data && error) {
    return <p className="text-sm text-red-700 bg-white rounded-lg border p-4 break-words min-w-0">Kunne ikke hente salgstragten. De andre tal på siden er uændrede.</p>
  }
  if (!data) return null
  const t = data.totals
  return (
    <div className="bg-white rounded-lg border p-6 break-words min-w-0" data-testid="report-sales-funnel">
      <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2 break-words min-w-0">
        <TrendingUp className="w-5 h-5 text-gray-400 break-words min-w-0" />
        Salgstragt
      </h3>
      <p className="text-xs text-gray-500 mb-4 break-words min-w-0">
        Sendt-rate {pct(t.sent_rate)} af oprettede tilbud · vinderrate {pct(t.win_rate)} af sendte. Accepteret værdi og faktureret er ekskl. moms (kreditnotaer trukket fra; faktura i udstedelsesmåneden).
      </p>
      <div className="md:hidden space-y-2 break-words min-w-0" data-testid="sales-funnel-mobile">
        {data.months.map((m) => (
          <article key={m.month} className="rounded ring-1 ring-gray-200 p-3 text-sm break-words min-w-0">
            <p className="font-medium text-gray-900 break-words min-w-0">{monthLabel(m.month)}</p>
            <p className="text-xs text-gray-600 break-words min-w-0" data-testid="funnel-month-rates">Sendt {pct(funnelMonthRates(m).sent_rate)} · vundet {pct(funnelMonthRates(m).win_rate)}</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs min-w-0 break-words">
              <div className="min-w-0"><dt className="text-gray-500">Nye kunder</dt><dd className="tabular-nums break-words">{m.new_customers}</dd></div>
              <div className="min-w-0"><dt className="text-gray-500">Tilbud oprettet</dt><dd className="tabular-nums break-words">{m.offers_created}</dd></div>
              <div className="min-w-0"><dt className="text-gray-500">Sendt</dt><dd className="tabular-nums break-words">{m.offers_sent}</dd></div>
              <div className="min-w-0"><dt className="text-gray-500">Accepteret</dt><dd className="tabular-nums break-words">{m.offers_accepted}</dd></div>
              <div className="min-w-0"><dt className="text-gray-500">Accepteret værdi</dt><dd className="tabular-nums break-words">{m.accepted_value ? kr(m.accepted_value) : '—'}</dd></div>
              <div className="min-w-0"><dt className="text-gray-500">Faktureret</dt><dd className="tabular-nums break-words">{m.invoiced_ex_vat ? kr(m.invoiced_ex_vat) : '—'}</dd></div>
            </dl>
          </article>
        ))}
        <article className="rounded bg-gray-50 ring-1 ring-gray-200 p-3 text-sm break-words min-w-0">
          <p className="font-semibold break-words min-w-0">I alt</p>
          <p className="text-xs text-gray-700 mt-1 break-words min-w-0">Nye kunder {t.new_customers} · tilbud {t.offers_created} · sendt {t.offers_sent} · accepteret {t.offers_accepted}</p>
          <p className="text-xs text-gray-700 break-words min-w-0">Accepteret værdi {kr(t.accepted_value)} · faktureret {kr(t.invoiced_ex_vat)}</p>
        </article>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 font-medium text-gray-500 break-words min-w-0">Måned</th>
              <th className="pb-2 font-medium text-gray-500 text-right">Nye kunder</th>
              <th className="pb-2 font-medium text-gray-500 text-right">Tilbud oprettet</th>
              <th className="pb-2 font-medium text-gray-500 text-right">Sendt</th>
              <th className="pb-2 font-medium text-gray-500 text-right">Accepteret</th>
              <th className="pb-2 font-medium text-gray-500 text-right">Accepteret værdi</th>
              <th className="pb-2 font-medium text-gray-500 text-right">Faktureret</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month} className="border-b last:border-b-0" data-testid="funnel-row" data-month={m.month}>
                <td className="py-2 text-gray-900">{monthLabel(m.month)}<div className="text-[11px] font-normal text-gray-600 break-words" data-testid="funnel-month-rates">Sendt {pct(funnelMonthRates(m).sent_rate)} · vundet {pct(funnelMonthRates(m).win_rate)}</div></td>
                <td className="py-2 text-right tabular-nums">{m.new_customers}</td>
                <td className="py-2 text-right tabular-nums">{m.offers_created}</td>
                <td className="py-2 text-right tabular-nums">{m.offers_sent}</td>
                <td className="py-2 text-right tabular-nums">{m.offers_accepted}</td>
                <td className="py-2 text-right tabular-nums">{m.accepted_value ? kr(m.accepted_value) : '—'}</td>
                <td className="py-2 text-right tabular-nums">{m.invoiced_ex_vat ? kr(m.invoiced_ex_vat) : '—'}</td>
              </tr>
            ))}
            <tr className="font-semibold bg-gray-50">
              <td className="py-2">I alt</td>
              <td className="py-2 text-right tabular-nums">{t.new_customers}</td>
              <td className="py-2 text-right tabular-nums">{t.offers_created}</td>
              <td className="py-2 text-right tabular-nums">{t.offers_sent}</td>
              <td className="py-2 text-right tabular-nums">{t.offers_accepted}</td>
              <td className="py-2 text-right tabular-nums">{kr(t.accepted_value)}</td>
              <td className="py-2 text-right tabular-nums">{kr(t.invoiced_ex_vat)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
