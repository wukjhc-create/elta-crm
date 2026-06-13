'use client'

/**
 * Sprint Ø3.1 — KOST-FRI faktureringsstatus til sagens overblik.
 *
 * Bruger getServiceCaseBillingStatus (returnerer KUN salgs-/faktureringsdata,
 * ingen intern kost/DB) → kan vises til kontor/salg uden economy.cost_prices.
 * Knappen "Åbn fakturakladde" vises kun når brugeren har adgang.
 */

import { useState, useEffect } from 'react'
import { Receipt, AlertTriangle, CheckCircle2, Clock, ArrowRight } from 'lucide-react'
import {
  getServiceCaseBillingStatus,
  type CaseBillingStatus,
} from '@/lib/actions/service-case-economy'
import { formatCurrency } from '@/lib/utils/format'

const kr = (n: number) => formatCurrency(Number(n), 'DKK', 0)

export function CaseBillingStatusCard({
  caseId,
  canOpenFakturakladde = false,
  onOpenFakturakladde,
}: {
  caseId: string
  canOpenFakturakladde?: boolean
  onOpenFakturakladde?: () => void
}) {
  const [data, setData] = useState<CaseBillingStatus | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getServiceCaseBillingStatus(caseId).then((r) => {
      if (r.success && r.data) setData(r.data)
      setLoaded(true)
    })
  }, [caseId])

  if (!loaded || !data) return null

  const parts: string[] = []
  if (data.unbilled_time_logs > 0) parts.push(`${data.unbilled_time_logs} timerække${data.unbilled_time_logs > 1 ? 'r' : ''}`)
  if (data.unbilled_materials > 0) parts.push(`${data.unbilled_materials} materialelinje${data.unbilled_materials > 1 ? 'r' : ''}`)
  if (data.unbilled_other > 0) parts.push(`${data.unbilled_other} øvrige`)
  const partsTxt = parts.join(' og ')

  const cfg = {
    no_work: { tone: 'bg-gray-50 ring-gray-200', icon: <Receipt className="w-5 h-5 text-gray-400" />, title: 'Intet at fakturere endnu' },
    ready_to_bill: { tone: 'bg-emerald-50 ring-emerald-200', icon: <Receipt className="w-5 h-5 text-emerald-600" />, title: 'Klar til fakturering' },
    partially_billed: { tone: 'bg-amber-50 ring-amber-200', icon: <AlertTriangle className="w-5 h-5 text-amber-600" />, title: 'Delvist faktureret' },
    fully_billed: { tone: 'bg-green-50 ring-green-200', icon: <CheckCircle2 className="w-5 h-5 text-green-600" />, title: 'Fuldt faktureret' },
  }[data.status]

  const body = (() => {
    switch (data.status) {
      case 'ready_to_bill':
        return `Denne sag har ${kr(data.unbilled_sale_total)} klar til fakturering${partsTxt ? ` fordelt på ${partsTxt}` : ''}.`
      case 'partially_billed':
        return `Denne sag er delvist faktureret. Der er stadig ${kr(data.unbilled_sale_total)} ikke faktureret${partsTxt ? ` (${partsTxt})` : ''}.`
      case 'fully_billed':
        return 'Alt registreret arbejde på sagen er faktureret.'
      default:
        return 'Der er endnu ikke registreret fakturerbare timer, materialer eller øvrige omkostninger.'
    }
  })()

  const showButton = canOpenFakturakladde && data.unbilled_count > 0

  return (
    <div className={`rounded-lg ring-1 ${cfg.tone} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="shrink-0 mt-0.5">{cfg.icon}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">{cfg.title}</h3>
            <p className="text-sm text-gray-700 mt-0.5">{body}</p>
            {data.has_open_timer && (
              <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Der findes en åben timer. Luk timeren før fakturering.
              </p>
            )}
            {data.billed_line_count > 0 && data.status !== 'fully_billed' && (
              <p className="text-[11px] text-gray-500 mt-1">{data.billed_line_count} linje(r) allerede fakturalåst.</p>
            )}
          </div>
        </div>
        {showButton && (
          <button
            type="button"
            onClick={onOpenFakturakladde}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Åbn fakturakladde <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
