'use client'

/**
 * N46: "Vis betalingsposteringen" — præcis den kassekladde-postering e-conomic ville få for kundens betaling (samme
 * builder som live-registreringen). Intet netværk, ingen skrivning. Kun settings.economic (serveren håndhæver).
 */
import { useState } from 'react'
import { Eye, Loader2 } from 'lucide-react'
import { getEconomicPaymentPreviewAction } from '@/lib/actions/accounting'

type Preview = Extract<Awaited<ReturnType<typeof getEconomicPaymentPreviewAction>>, { ok: true }>['data']

const fmt = (n: number) => new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export function InvoicePaymentEconomicPreview({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    setLoading(true)
    setError(null)
    const res = await getEconomicPaymentPreviewAction(invoiceId)
    setLoading(false)
    if (res.ok) setData(res.data)
    else setError(res.message)
  }

  return (
    <div className="pt-1">
      <button type="button" onClick={() => void toggle()} aria-expanded={open} data-testid="economic-payment-preview-toggle"
        className="inline-flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-900">
        <Eye className="w-3.5 h-3.5" /> {open ? 'Skjul betalingspostering' : 'Vis betalingsposteringen til e-conomic'}
      </button>
      {open && (
        <div className="mt-2 rounded ring-1 ring-gray-200 bg-gray-50 p-3 space-y-2" data-testid="economic-payment-preview">
          {loading && <div className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Bygger postering…</div>}
          {error && <div className="text-xs text-red-800">{error}</div>}
          {data && !loading && (
            <>
              <div className="text-xs text-gray-600">
                Kassekladde · dato {data.entry.body.date} · modkonto {data.entry.body.contraAccount.accountNumber ?? '— (mangler i opsætning)'} ·{' '}
                {data.entry.body.customerInvoice.bookedInvoiceNumber != null ? `bogført faktura nr. ${data.entry.body.customerInvoice.bookedInvoiceNumber}` : 'faktura ikke bogført i e-conomic endnu'}
              </div>
              <div className="text-xs flex justify-between border-t border-gray-300 pt-1">
                <span>{data.entry.body.text}</span>
                <span className="tabular-nums font-medium" data-testid="economic-payment-amount">{fmt(data.entry.body.amount)} {data.entry.body.currency.code}</span>
              </div>
              {data.alreadyMarkedPaid && (
                <div className="text-xs rounded px-2 py-1 ring-1 bg-blue-50 text-blue-900 ring-blue-200">Betalingen er allerede registreret i e-conomic — sendes ikke igen.</div>
              )}
              {data.entry.issues.map((i, k) => (
                <div key={k} className={`text-xs rounded px-2 py-1 ring-1 ${i.severity === 'error' ? 'bg-red-50 text-red-900 ring-red-200' : 'bg-blue-50 text-blue-900 ring-blue-200'}`}>{i.message}</div>
              ))}
              <p className="text-[11px] text-gray-400">Forhåndsvisning — intet sendes til e-conomic herfra.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
