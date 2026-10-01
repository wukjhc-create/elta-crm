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
  AlertCircle, BookCheck, CloudUpload, Eye, Info, Loader2, Lock, RefreshCw,
} from 'lucide-react'
import {
  getInvoiceAccountingStatusAction,
  exportInvoiceToEconomicAction,
  getEconomicInvoicePreviewAction,
  type InvoiceAccountingState,
} from '@/lib/actions/accounting'
import type { EconomicInvoicePreview } from '@/lib/services/economic-client'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { hasPermission } from '@/lib/auth/permissions'

const STATUS_SKIN: Record<
  InvoiceAccountingState['status'],
  { label: string; cls: string }
> = {
  not_exported: { label: 'Ikke eksporteret', cls: 'bg-gray-100 text-gray-700 ring-gray-300' },
  ready: { label: 'Klar til eksport', cls: 'bg-blue-100 text-blue-800 ring-blue-300' },
  needs_fix: { label: 'Kræver rettelse før eksport', cls: 'bg-amber-100 text-amber-900 ring-amber-300' },
  exported: { label: 'Eksporteret', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
  error: { label: 'Fejl ved eksport', cls: 'bg-red-100 text-red-800 ring-red-300' },
}

const fmtNum = (n: number) =>
  n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function InvoiceAccountingPanel({ invoiceId }: { invoiceId: string }) {
  const { role } = useUserRole()
  const canExport = hasPermission(role, 'settings.economic')
  const [state, setState] = useState<InvoiceAccountingState | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)
  const [preview, setPreview] = useState<EconomicInvoicePreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)

  const togglePreview = async () => {
    if (previewOpen) { setPreviewOpen(false); return }
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const res = await getEconomicInvoicePreviewAction(invoiceId)
      if (res.ok) setPreview(res.data)
      else setPreviewError(res.message)
    } finally {
      setPreviewLoading(false)
    }
  }

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
    canExport && state.integration_ready && state.status !== 'exported' && state.status !== 'needs_fix'

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

        {state.status === 'needs_fix' && state.blocking_issues.length > 0 && (
          <div className="rounded ring-1 ring-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 space-y-0.5" data-testid="economic-blocking">
            {state.blocking_issues.map((m, i) => (
              <div key={i} className="flex items-start gap-1"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {m}</div>
            ))}
            <div className="text-amber-800">Ret fakturaen (eller kreditér og genudsted) før den kan eksporteres.</div>
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

        {canExport && state.status !== 'exported' && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => void togglePreview()}
              className="inline-flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-900"
              aria-expanded={previewOpen}
            >
              <Eye className="w-3.5 h-3.5" /> {previewOpen ? 'Skjul forhåndsvisning' : 'Vis hvad der sendes til e-conomic'}
            </button>
            {previewOpen && (
              <div className="mt-2 rounded ring-1 ring-gray-200 bg-gray-50 p-3 space-y-2" data-testid="economic-preview">
                {previewLoading && (
                  <div className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Bygger forhåndsvisning…</div>
                )}
                {previewError && <div className="text-xs text-red-800">{previewError}</div>}
                {preview && !previewLoading && (
                  <>
                    <div className="text-xs text-gray-600">
                      Fakturakladde i e-conomic · dato {preview.draft.body.date} · reference {preview.draft.body.references.other} ·{' '}
                      {preview.draft.body.customer.customerNumber != null ? `kunde nr. ${preview.draft.body.customer.customerNumber}` : 'ny kunde'}
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="py-1 pr-2">Linje</th>
                          <th className="py-1 pr-2 text-right">Antal</th>
                          <th className="py-1 pr-2 text-right">Enhedspris</th>
                          <th className="py-1 text-right">Beløb</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.draft.body.lines.map((l) => (
                          <tr key={l.lineNumber} className="border-t border-gray-200">
                            <td className="py-1 pr-2">{l.description}</td>
                            <td className="py-1 pr-2 text-right tabular-nums">{fmtNum(l.quantity)}</td>
                            <td className="py-1 pr-2 text-right tabular-nums">{fmtNum(l.unitNetPrice)}</td>
                            <td className="py-1 text-right tabular-nums">{fmtNum(Math.round(l.quantity * l.unitNetPrice * 100) / 100)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="text-xs flex justify-between border-t border-gray-300 pt-1">
                      <span>e-conomic ekskl. moms</span>
                      <span className="tabular-nums font-medium" data-testid="economic-preview-net">{fmtNum(preview.draft.economicNet)} kr</span>
                    </div>
                    <div className="text-xs flex justify-between text-gray-500">
                      <span>Fakturaen ekskl. moms</span>
                      <span className="tabular-nums">{fmtNum(preview.draft.crmNet)} kr</span>
                    </div>
                    {preview.draft.issues.map((i, k) => (
                      <div
                        key={k}
                        className={`text-xs rounded px-2 py-1 ring-1 ${i.severity === 'error' ? 'bg-red-50 text-red-900 ring-red-200' : 'bg-blue-50 text-blue-900 ring-blue-200'}`}
                      >
                        {i.message}
                      </div>
                    ))}
                    {preview.draft.canPost && (
                      <div className="text-xs text-emerald-800">Kladden stemmer med fakturaen.</div>
                    )}
                    <p className="text-[11px] text-gray-400">Forhåndsvisning — intet sendes til e-conomic herfra.</p>
                  </>
                )}
              </div>
            )}
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
