'use client'

/**
 * Sprint Ø6.0 — Regnskabsstatus + manuel e-conomic-eksport på fakturaen.
 *
 * Selvhentende via getInvoiceAccountingStatusAction (afledt af eksisterende
 * integration). Viser: Ikke eksporteret / Klar / Eksporteret / Fejl, og en
 * "Eksportér til e-conomic"-knap (gated settings.economic). Pæn besked når
 * integrationen ikke er opsat. Cost-free — ingen hemmeligheder, ingen kost.
 */

import { useCallback, useEffect, useState, useTransition } from 'react'
import {
  AlertCircle, BookCheck, CloudUpload, Info, Loader2, Lock, RefreshCw,
} from 'lucide-react'
import {
  getInvoiceAccountingStatusAction,
  exportInvoiceToEconomicAction,
  type InvoiceAccountingState,
} from '@/lib/actions/accounting'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { hasPermission } from '@/lib/auth/permissions'

const STATUS_SKIN: Record<
  InvoiceAccountingState['status'],
  { label: string; cls: string }
> = {
  not_exported: { label: 'Ikke eksporteret', cls: 'bg-gray-100 text-gray-700 ring-gray-300' },
  ready: { label: 'Klar til eksport', cls: 'bg-blue-100 text-blue-800 ring-blue-300' },
  exported: { label: 'Eksporteret', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
  error: { label: 'Fejl ved eksport', cls: 'bg-red-100 text-red-800 ring-red-300' },
}

export function InvoiceAccountingPanel({ invoiceId }: { invoiceId: string }) {
  const { role } = useUserRole()
  const canExport = hasPermission(role, 'settings.economic')
  const [state, setState] = useState<InvoiceAccountingState | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setState(await getInvoiceAccountingStatusAction(invoiceId))
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    void load()
  }, [load])

  const handleExport = () => {
    if (!canExport) return
    startTransition(async () => {
      const res = await exportInvoiceToEconomicAction(invoiceId)
      setFlash({ ok: res.ok, text: res.message })
      setTimeout(() => setFlash(null), 7000)
      await load()
    })
  }

  if (loading || !state) {
    return (
      <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
        <div className="px-4 py-2 border-b bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <BookCheck className="w-4 h-4 text-gray-500" /> Regnskab (e-conomic)
          </h3>
        </div>
        <div className="px-4 py-3 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Henter regnskabsstatus…
        </div>
      </div>
    )
  }

  if (!state.ok) {
    return (
      <div className="bg-white rounded-lg ring-1 ring-gray-200 px-4 py-3 text-sm text-gray-600 flex items-center gap-2">
        <Lock className="w-4 h-4 text-gray-400" /> {state.message ?? 'Ingen adgang til regnskabsstatus.'}
      </div>
    )
  }

  const skin = STATUS_SKIN[state.status]
  const showExport =
    canExport && state.integration_ready && state.status !== 'exported'

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <BookCheck className="w-4 h-4 text-gray-500" /> Regnskab (e-conomic)
        </h3>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Opdater
        </button>
      </div>

      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] uppercase tracking-wide px-2 py-0.5 rounded ring-1 ${skin.cls}`}>
            {skin.label}
          </span>
          {state.external_id && (
            <span className="text-xs text-gray-500 font-mono">e-conomic: {state.external_id}</span>
          )}
        </div>

        {state.status === 'exported' && state.exported_at && (
          <p className="text-xs text-gray-500">
            Eksporteret {new Intl.DateTimeFormat('da-DK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(state.exported_at))}.
          </p>
        )}
        {state.status === 'error' && state.error && (
          <div className="rounded ring-1 ring-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800 flex items-start gap-1">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {state.error}
          </div>
        )}

        {!state.integration_ready && (
          <div className="rounded ring-1 ring-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 flex items-start gap-1">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            e-conomic er ikke opsat endnu. Når integrationen er konfigureret, kan fakturaer eksporteres herfra.
          </div>
        )}

        {flash && (
          <div className={`text-xs rounded px-3 py-1.5 ring-1 ${flash.ok ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-red-50 text-red-900 ring-red-200'}`}>
            {flash.text}
          </div>
        )}

        {showExport && (
          <div className="pt-1">
            <button
              type="button"
              onClick={handleExport}
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
              {state.status === 'error' ? 'Prøv eksport igen' : 'Eksportér til e-conomic'}
            </button>
          </div>
        )}

        <p className="text-[11px] text-gray-400 pt-1">
          Kun salgs-/fakturadata sendes til regnskab — ingen interne tal.
        </p>
      </div>
    </div>
  )
}
