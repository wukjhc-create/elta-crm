'use client'

/**
 * N53: salgstragt pr. måned — nye kunder → tilbud → sendt → accepteret → faktureret (salgsværdier, ingen kost).
 */
import { TrendingUp } from 'lucide-react'
import type { SalesFunnel } from '@/lib/reports/sales-funnel'

const kr = (n: number) => new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(n)
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('da-DK', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const pct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('da-DK', { maximumFractionDigits: 1 })} %`)

export function SalesFunnelTable({ data }: { data: SalesFunnel | null }) {
  if (!data) return null
  const t = data.totals
  return (
    <div className="bg-white rounded-lg border p-6" data-testid="report-sales-funnel">
      <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-gray-400" />
        Salgstragt
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Sendt-rate {pct(t.sent_rate)} af oprettede tilbud · vinderrate {pct(t.win_rate)} af sendte. Accepteret værdi og faktureret er ekskl. moms (kreditnotaer trukket fra; faktura i udstedelsesmåneden).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 font-medium text-gray-500">Måned</th>
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
                <td className="py-2 text-gray-900">{monthLabel(m.month)}</td>
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
