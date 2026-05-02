import { Metadata } from 'next'
import Link from 'next/link'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'

export const metadata: Metadata = {
  title: 'Fakturaer',
  description: 'Udgående kundefakturaer',
}

export const dynamic = 'force-dynamic'

const fmtAmount = (n: number | null | undefined, ccy = 'DKK') =>
  n == null
    ? '—'
    : new Intl.NumberFormat('da-DK', { style: 'currency', currency: ccy, maximumFractionDigits: 2 }).format(Number(n))

const fmtDate = (s: string | null | undefined) => (s ? s.slice(0, 10) : '—')

export default async function InvoicesPage() {
  let rows: Array<{
    id: string
    invoice_number: string
    customer_id: string | null
    status: string
    payment_status: string
    final_amount: number | null
    currency: string
    due_date: string | null
    created_at: string
  }> = []
  let error: string | null = null
  try {
    const { supabase } = await getAuthenticatedClient()
    const res = await supabase
      .from('invoices')
      .select('id, invoice_number, customer_id, status, payment_status, final_amount, currency, due_date, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (res.error) error = res.error.message
    else rows = (res.data ?? []) as typeof rows
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Fakturaer</h1>
        <p className="text-xs text-gray-500">Udgående kundefakturaer (Phase 5).</p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">
          Kunne ikke hente fakturaer: {error}
        </div>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2">Faktura nr</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Betalingsstatus</th>
              <th className="px-3 py-2">Forfald</th>
              <th className="px-3 py-2 text-right">Beløb</th>
              <th className="px-3 py-2">Oprettet</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !error && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400 text-xs">Ingen fakturaer endnu.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 font-mono">
                  {r.customer_id ? (
                    <Link href={`/dashboard/customers/${r.customer_id}`} className="text-emerald-700 hover:underline">{r.invoice_number}</Link>
                  ) : r.invoice_number}
                </td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">{r.payment_status}</td>
                <td className="px-3 py-2 text-xs">{fmtDate(r.due_date)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtAmount(r.final_amount, r.currency)}</td>
                <td className="px-3 py-2 text-xs">{fmtDate(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
