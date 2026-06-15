'use client'

/**
 * Sprint Ø6.3 — e-conomic synklog for bogholderiet.
 *
 * Viser eksportforsøg menneskeligt: tidspunkt, faktura, kunde, status,
 * ekstern reference, dansk fejlbesked, hvem der startede eksporten.
 * "Prøv igen" på fejlede (gated + defensivt på serveren). Ingen secrets,
 * ingen kost/DB/margin.
 */

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, XCircle, MinusCircle, RefreshCw, ExternalLink, FileText, Briefcase, Loader2 } from 'lucide-react'
import { retryInvoiceExportAction, type SyncLogResult, type SyncLogEntry, type SyncLogStatusFilter } from '@/lib/actions/accounting'

const STATUS_FILTERS: { key: SyncLogStatusFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'success', label: 'Succes' },
  { key: 'failed', label: 'Fejl' },
  { key: 'skipped', label: 'Sprunget over' },
]

const STATUS_SKIN: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  success: { label: 'Succes', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: CheckCircle2 },
  failed: { label: 'Fejl', cls: 'bg-red-50 text-red-700 ring-red-200', Icon: XCircle },
  skipped: { label: 'Sprunget over', cls: 'bg-gray-100 text-gray-600 ring-gray-200', Icon: MinusCircle },
}

const dkDateTime = (iso: string) =>
  new Intl.DateTimeFormat('da-DK', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

export function SyncLogClient({ initial }: { initial: SyncLogResult }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = (searchParams.get('status') as SyncLogStatusFilter | null) ?? 'all'
  const days = searchParams.get('days')

  const [retrying, startRetry] = useTransition()
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)
  // Lokal optimistisk markering af fakturaer der lige er eksporteret.
  const [exportedNow, setExportedNow] = useState<Set<string>>(new Set())

  const setParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(searchParams.toString())
    if (value) sp.set(key, value)
    else sp.delete(key)
    router.replace(`?${sp.toString()}`, { scroll: false })
  }

  const entries = useMemo(
    () => initial.entries.filter((e) => (status === 'all' ? true : e.status === status)),
    [initial.entries, status]
  )

  const handleRetry = (entry: SyncLogEntry) => {
    if (!entry.invoice_id) return
    setFlash(null)
    setRetryingId(entry.id)
    startRetry(async () => {
      const res = await retryInvoiceExportAction(entry.invoice_id!, entry.id)
      setFlash({ ok: res.ok, text: `${entry.invoice_number ?? 'Faktura'}: ${res.message}` })
      if (res.ok && res.status === 'exported') {
        setExportedNow((s) => new Set(s).add(entry.invoice_id!))
      }
      setRetryingId(null)
    })
  }

  const c = initial.counts

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/settings/economic" className="text-xs text-emerald-700 hover:underline">
            ← Regnskab (e-conomic)
          </Link>
        </div>
        <h1 className="text-2xl font-semibold mt-1">Eksport-log (e-conomic)</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Seneste eksportforsøg. Find og udbedr fejl uden teknisk hjælp.
        </p>
      </div>

      {!initial.integration_ready && (
        <div className="rounded-lg ring-1 ring-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <strong>e-conomic er ikke opsat endnu.</strong> Du kan se historikken, men
          “Prøv igen” er deaktiveret, indtil integrationen er aktiv.{' '}
          <Link href="/dashboard/settings/economic" className="underline font-medium">Opsæt integration</Link>
        </div>
      )}

      {flash && (
        <div className={`rounded-lg px-3 py-2 text-sm ring-1 ${flash.ok ? 'bg-emerald-50 ring-emerald-200 text-emerald-900' : 'bg-red-50 ring-red-200 text-red-900'}`}>
          {flash.text}
        </div>
      )}

      {/* Filtre */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = status === f.key
          const count = f.key === 'all' ? c.all : f.key === 'success' ? c.success : f.key === 'failed' ? c.failed : c.skipped
          return (
            <button
              key={f.key}
              onClick={() => setParam('status', f.key === 'all' ? null : f.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1 ${active ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'}`}
            >
              {f.label}
              <span className={`text-xs ${active ? 'text-emerald-100' : 'text-gray-400'}`}>{count}</span>
            </button>
          )
        })}
        <div className="ml-2 flex items-center gap-1.5 text-sm">
          {[
            { k: null, l: 'Hele perioden' },
            { k: '7', l: '7 dage' },
            { k: '30', l: '30 dage' },
          ].map((d) => (
            <button
              key={d.l}
              onClick={() => setParam('days', d.k)}
              className={`rounded-md px-2.5 py-1 ring-1 ${(days ?? null) === d.k ? 'bg-gray-800 text-white ring-gray-800' : 'bg-white text-gray-600 ring-gray-300 hover:bg-gray-50'}`}
            >
              {d.l}
            </button>
          ))}
        </div>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-3 py-2">Tidspunkt</th>
              <th className="text-left font-medium px-3 py-2">Faktura</th>
              <th className="text-left font-medium px-3 py-2">Kunde</th>
              <th className="text-left font-medium px-3 py-2">Status</th>
              <th className="text-left font-medium px-3 py-2">Ekstern ref.</th>
              <th className="text-left font-medium px-3 py-2">Detaljer</th>
              <th className="text-right font-medium px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                  Ingen eksportforsøg i denne visning.
                </td>
              </tr>
            )}
            {entries.map((e) => {
              const skin = STATUS_SKIN[e.status] ?? STATUS_SKIN.skipped
              const justExported = e.invoice_id ? exportedNow.has(e.invoice_id) : false
              const canRetry = e.retry_eligible && !justExported
              return (
                <tr key={e.id} className="align-top">
                  <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{dkDateTime(e.created_at)}</td>
                  <td className="px-3 py-2.5">
                    {e.invoice_id ? (
                      <Link href={`/dashboard/invoices/${e.invoice_id}`} className="font-mono text-emerald-700 hover:underline inline-flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        {e.invoice_number ?? 'Faktura'}
                      </Link>
                    ) : (
                      <span className="text-gray-400">{e.entity_type === 'customer' ? 'Kunde' : '—'}</span>
                    )}
                    {e.case_number && (
                      <Link href={`/dashboard/orders/${e.case_number}`} className="block text-xs text-gray-500 hover:underline mt-0.5 inline-flex items-center gap-1">
                        <Briefcase className="w-3 h-3" /> {e.case_number}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{e.customer_name ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${skin.cls}`}>
                      <skin.Icon className="w-3 h-3" />
                      {justExported ? 'Eksporteret' : skin.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{e.external_id ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600 max-w-xs">
                    {e.error ? <span className="text-red-700">{e.error}</span> : <span className="text-gray-400">—</span>}
                    {e.started_by && <div className="text-xs text-gray-400 mt-0.5">Startet af {e.started_by}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {e.status === 'failed' && (
                      <button
                        onClick={() => handleRetry(e)}
                        disabled={!canRetry || retrying}
                        title={
                          !initial.integration_ready
                            ? 'Integration ikke opsat'
                            : !e.retry_eligible
                              ? 'Ikke berettiget til genforsøg'
                              : 'Prøv eksporten igen'
                        }
                        className="inline-flex items-center gap-1.5 rounded-md ring-1 ring-emerald-300 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {retrying && retryingId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Prøv igen
                      </button>
                    )}
                    {e.invoice_id && (
                      <Link
                        href={`/dashboard/invoices/${e.invoice_id}`}
                        className="ml-1 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                        title="Åbn faktura"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <XCircle className="w-3 h-3" />
        Kun salgs-/fakturadata og ekstern reference vises — ingen intern kost, margin eller dækningsbidrag.
        Tekniske fejl er oversat; nøgler og headers vises aldrig.
      </p>
    </div>
  )
}
