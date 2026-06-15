'use client'

/**
 * Sprint Ø4.8 — Eksportér betalingsopfølgningsliste til CSV.
 *
 * Genbruger projektets CSV-mønster (generateCsv/downloadCsv — semikolon,
 * UTF-8 BOM, escaping). Datakilde: exportPaymentFollowupAction (cost-free,
 * ÉN invoices-aggregat + ÉN customers-query). Respekterer aktivt
 * betalingsfilter. KUN kontaktinfo + salgs/faktura-data — ingen kost.
 */

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { exportPaymentFollowupAction } from '@/lib/actions/invoices'
import type { PaymentFilterKey } from '@/app/dashboard/customers/customer-payment-filter'
import { generateCsv, downloadCsv } from '@/lib/utils/csv-export'
import { PAYMENT_EXPORT_COLUMNS } from '@/lib/invoices/payment-export-columns'
import { useToast } from '@/components/ui/toast'

const FILE_LABEL: Record<PaymentFilterKey, string> = {
  all: 'betalingsliste',
  overdue: 'forfaldne-kunder',
  outstanding: 'udestaaende-kunder',
  late_payer: 'ofte-forsinkede-kunder',
  on_time: 'betaler-til-tiden-kunder',
  no_data: 'ingen-betalingsdata-kunder',
}

const WHAT_EXPORTS: Record<PaymentFilterKey, string> = {
  all: 'kunder med udestående (inkl. forfaldne)',
  overdue: 'kunder med forfaldne fakturaer',
  outstanding: 'kunder med udestående',
  late_payer: 'ofte forsinkede kunder',
  on_time: 'kunder der betaler til tiden',
  no_data: 'kunder uden betalingsdata',
}

export function PaymentExportButton({ paymentFilter }: { paymentFilter: PaymentFilterKey }) {
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  async function handleExport() {
    setLoading(true)
    try {
      const res = await exportPaymentFollowupAction(paymentFilter)
      if (!res.ok) {
        toast.error(res.message ?? 'Eksport fejlede. Prøv igen.')
        return
      }
      if (res.rows.length === 0) {
        toast.error('Der er ingen kunder i denne betalingsvisning at eksportere.')
        return
      }
      const csv = generateCsv(res.rows, PAYMENT_EXPORT_COLUMNS)
      const date = new Date().toISOString().slice(0, 10)
      downloadCsv(csv, `elta-drift-${FILE_LABEL[paymentFilter]}-${date}.csv`)
      toast.success(`${res.rows.length} kunde(r) eksporteret.`)
    } catch {
      toast.error('Eksport fejlede. Prøv igen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      title={`Eksportér ${WHAT_EXPORTS[paymentFilter]} til CSV`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      Eksportér CSV
    </button>
  )
}
