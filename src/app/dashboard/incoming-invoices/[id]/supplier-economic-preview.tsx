'use client'

/**
 * Forhåndsvisning af hvad godkendelse/"Bogfør til e-conomic" ville sende —
 * samme mapping som live-bogføringen (lib/economic/supplier-invoice-draft.ts).
 * Intet sendes herfra.
 */

import { useState } from 'react'
import { Eye, Loader2 } from 'lucide-react'
import { getSupplierInvoiceEconomicPreviewAction } from '@/lib/actions/incoming-invoices'
import type { EconomicSupplierInvoicePreview } from '@/lib/services/economic-client'

const fmt = (n: number) => n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function SupplierEconomicPreview({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<EconomicSupplierInvoicePreview | null>(null)

  const toggle = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    setLoading(true)
    setError(null)
    try {
      const res = await getSupplierInvoiceEconomicPreviewAction(invoiceId)
      if (res.ok) setData(res.data)
      else setError(res.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-900"
      >
        <Eye className="w-3.5 h-3.5" /> {open ? 'Skjul e-conomic-forhåndsvisning' : 'Vis hvad der bogføres i e-conomic'}
      </button>
      {open && (
        <div className="mt-2 rounded ring-1 ring-gray-200 bg-gray-50 p-3 space-y-2" data-testid="supplier-economic-preview">
          {loading && <div className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Bygger forhåndsvisning…</div>}
          {error && <div className="text-xs text-red-800">{error}</div>}
          {data && !loading && (
            <>
              <div className="text-xs text-gray-600">
                Leverandørfakturakladde · dato {data.draft.body.date ?? '—'} · fakturanr. {data.draft.body.supplierInvoiceNumber ?? '—'} ·{' '}
                {data.draft.body.supplier.supplierNumber != null ? `leverandør nr. ${data.draft.body.supplier.supplierNumber}` : 'leverandør ikke koblet'}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-1 pr-2">Linje</th>
                    <th className="py-1 pr-2 text-right">Konto</th>
                    <th className="py-1 text-right">Beløb</th>
                  </tr>
                </thead>
                <tbody>
                  {data.draft.body.lines.map((l) => (
                    <tr key={l.lineNumber} className="border-t border-gray-200">
                      <td className="py-1 pr-2">{l.description}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{l.costAccount.accountNumber ?? '—'}</td>
                      <td className="py-1 text-right tabular-nums">{fmt(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs flex justify-between border-t border-gray-300 pt-1">
                <span>Omkostning ekskl. moms</span>
                <span className="tabular-nums font-medium" data-testid="supplier-economic-net">{fmt(data.draft.economicNet)} kr</span>
              </div>
              <div className="text-xs flex justify-between text-gray-500">
                <span>Fakturaen ekskl. moms</span>
                <span className="tabular-nums">{data.draft.invoiceNet == null ? '—' : `${fmt(data.draft.invoiceNet)} kr`}</span>
              </div>
              {data.draft.issues.map((i, k) => (
                <div key={k} className={`text-xs rounded px-2 py-1 ring-1 ${i.severity === 'error' ? 'bg-red-50 text-red-900 ring-red-200' : 'bg-blue-50 text-blue-900 ring-blue-200'}`}>
                  {i.message}
                </div>
              ))}
              {!data.integration_ready && (
                <div className="text-xs text-amber-900">e-conomic er ikke opsat — godkendelse bogfører intet endnu.</div>
              )}
              <p className="text-[11px] text-gray-400">Forhåndsvisning — intet sendes til e-conomic herfra.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
