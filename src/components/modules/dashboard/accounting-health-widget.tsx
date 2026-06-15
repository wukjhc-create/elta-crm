'use client'

/**
 * Sprint Ø6.4 — Regnskabs-widget på driftsdashboardet.
 *
 * Gør e-conomic-eksportfejl synlige proaktivt: fejlede eksporter, sendte/
 * betalte fakturaer der ikke er eksporteret, eksporteret 7/30 dage og
 * seneste fejl. Genveje til synklog, fakturaoverblik (regnskabsfilter) og
 * opsætning. Selvhentende via getAccountingHealthSummaryAction.
 *
 * KUN salgs-/fakturadata + ekstern reference — ingen kost/margin/DB/secrets.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  BookCheck, AlertTriangle, Send, CheckCircle2, Loader2, ArrowRight, ListChecks, Settings,
} from 'lucide-react'
import { getAccountingHealthSummaryAction, type AccountingHealthSummary } from '@/lib/actions/accounting'

const fmtDateTime = (s: string) =>
  new Intl.DateTimeFormat('da-DK', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(s))

export function AccountingHealthWidget() {
  const [data, setData] = useState<AccountingHealthSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getAccountingHealthSummaryAction()
      .then((res) => { if (alive) setData(res) })
      .catch(() => { if (alive) setData(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div className="bg-white p-6 rounded-lg border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BookCheck className="w-5 h-5 text-emerald-600" />
          Regnskab (e-conomic)
        </h2>
        <Link href="/dashboard/settings/economic/log" className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
          <ListChecks className="w-3.5 h-3.5" /> Eksport-log
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Henter regnskabsstatus…
        </div>
      ) : !data || !data.ok ? (
        <p className="text-sm text-gray-400 py-4">Kunne ikke hente regnskabsstatus.</p>
      ) : !data.integration_ready ? (
        // Pæn not-configured-state med link til opsætning.
        <div className="rounded-lg ring-1 ring-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <strong>e-conomic er ikke opsat endnu.</strong>
          <p className="mt-0.5 text-amber-800">
            {data.not_exported_count > 0
              ? `${data.not_exported_count} sendte/betalte faktura(er) afventer eksport.`
              : 'Aktivér integrationen for at eksportere fakturaer.'}
          </p>
          <Link href="/dashboard/settings/economic" className="mt-2 inline-flex items-center gap-1 font-medium underline">
            <Settings className="w-3.5 h-3.5" /> Opsæt integration
          </Link>
        </div>
      ) : data.failed_count === 0 && data.not_exported_count === 0 ? (
        // Positiv tom-state.
        <div className="rounded-lg ring-1 ring-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>Alt eksporteret — ingen fejl eller ventende fakturaer.</span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/dashboard/settings/economic/log?status=failed"
              className={`rounded-lg ring-1 px-3 py-2.5 ${data.failed_count > 0 ? 'ring-red-200 bg-red-50 hover:bg-red-100' : 'ring-gray-200 bg-gray-50'}`}
            >
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <AlertTriangle className={`w-3.5 h-3.5 ${data.failed_count > 0 ? 'text-red-600' : 'text-gray-400'}`} />
                Fejlede eksporter
              </div>
              <div className={`text-2xl font-bold mt-0.5 ${data.failed_count > 0 ? 'text-red-700' : 'text-gray-700'}`}>
                {data.failed_count}
              </div>
            </Link>
            <Link
              href="/dashboard/invoices?acc=ready"
              className={`rounded-lg ring-1 px-3 py-2.5 ${data.not_exported_count > 0 ? 'ring-amber-200 bg-amber-50 hover:bg-amber-100' : 'ring-gray-200 bg-gray-50'}`}
            >
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Send className={`w-3.5 h-3.5 ${data.not_exported_count > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
                Ikke eksporteret
              </div>
              <div className={`text-2xl font-bold mt-0.5 ${data.not_exported_count > 0 ? 'text-amber-700' : 'text-gray-700'}`}>
                {data.not_exported_count}
              </div>
            </Link>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500 px-0.5">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Eksporteret: {data.exported_7d} (7 dage) · {data.exported_30d} (30 dage)
            </span>
          </div>

          {data.latest_error && (
            <Link
              href={data.latest_error.invoice_id ? `/dashboard/invoices/${data.latest_error.invoice_id}` : '/dashboard/settings/economic/log?status=failed'}
              className="block rounded-lg ring-1 ring-red-200 bg-red-50 px-3 py-2 text-sm hover:bg-red-100"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-red-800">
                  Seneste fejl{data.latest_error.invoice_number ? ` · ${data.latest_error.invoice_number}` : ''}
                </span>
                <span className="text-xs text-red-500">{fmtDateTime(data.latest_error.at)}</span>
              </div>
              <p className="text-red-700 mt-0.5">{data.latest_error.message}</p>
            </Link>
          )}

          <div className="flex items-center gap-3 pt-1 text-sm">
            <Link href="/dashboard/settings/economic/log" className="inline-flex items-center gap-1 text-emerald-700 hover:underline">
              Synklog <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link href="/dashboard/invoices?acc=ready" className="inline-flex items-center gap-1 text-gray-600 hover:underline">
              Fakturaoverblik <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-3">
        Kun salgs-/fakturadata — ingen intern kost, margin eller dækningsbidrag.
      </p>
    </div>
  )
}
