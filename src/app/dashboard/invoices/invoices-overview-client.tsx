'use client'

/**
 * Sprint Ø3.6 — Cost-free fakturaoverblik på tværs af sager.
 *
 * Hjælper kontoret med at få pengene hjem: summary-cards, filtre
 * (Alle/Kladder/Sendte/Forfaldne/Betalte/Krediterede), forfaldne
 * fremhævet med dage-over-forfald, og manuel "Send påmindelse" på
 * forfaldne (kræver invoices.send + bekræftelse).
 *
 * KUN salgs/faktura-data — ingen kost/margin/DB.
 */

import Link from 'next/link'
import { useCallback, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle, BadgeCheck, Ban, Bell, BookCheck, CloudUpload, Eye, FileDown,
  FileText, Loader2, Receipt, Search, Send,
} from 'lucide-react'
import {
  sendInvoiceReminderAction,
  type InvoiceOverviewRow,
} from '@/lib/actions/invoices'
import { bulkExportInvoicesToEconomicAction } from '@/lib/actions/accounting'
import { formatCurrency } from '@/lib/utils/format'
import {
  FILTERS,
  FILTER_TO_URL,
  EMPTY_TEXT,
  parseFilter,
  type FilterKey,
} from './invoice-filter-url'

// Sprint Ø6.1 — regnskabsstatus-akse (separat ?acc=-param).
type AccKey = 'all' | 'not_exported' | 'ready' | 'exported' | 'error'
const ACC_FILTERS: Array<{ key: AccKey; label: string }> = [
  { key: 'all', label: 'Alle' },
  { key: 'not_exported', label: 'Ikke eksporteret' },
  { key: 'ready', label: 'Klar til eksport' },
  { key: 'exported', label: 'Eksporteret' },
  { key: 'error', label: 'Fejlet' },
]
const ACC_VALID = new Set<AccKey>(ACC_FILTERS.map((f) => f.key))
function parseAcc(raw: string | null): AccKey {
  return raw && ACC_VALID.has(raw as AccKey) ? (raw as AccKey) : 'all'
}
const ACC_SKIN: Record<InvoiceOverviewRow['accounting_status'], { label: string; cls: string }> = {
  not_exported: { label: 'Ikke eksporteret', cls: 'bg-gray-100 text-gray-700' },
  ready: { label: 'Klar', cls: 'bg-blue-100 text-blue-800' },
  exported: { label: 'Eksporteret', cls: 'bg-emerald-100 text-emerald-800' },
  error: { label: 'Fejlet', cls: 'bg-red-100 text-red-800' },
}

const TYPE_PILL: Record<string, { label: string; cls: string }> = {
  deposit: { label: 'Forskud', cls: 'bg-blue-100 text-blue-800' },
  progress: { label: 'A conto', cls: 'bg-purple-100 text-purple-800' },
  final: { label: 'Slutfaktura', cls: 'bg-orange-100 text-orange-800' },
  credit: { label: 'Kreditnota', cls: 'bg-red-100 text-red-800' },
}

function kr(n: number, ccy: string | null): string {
  return formatCurrency(n, ccy || 'DKK', 2)
}
function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Intl.DateTimeFormat('da-DK', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(s.length === 10 ? s + 'T12:00:00' : s)
  )
}

function statusBadge(r: InvoiceOverviewRow): { label: string; cls: string } {
  if (r.voided_at) return { label: 'Annulleret', cls: 'bg-gray-200 text-gray-700' }
  if (r.is_credit_note) return { label: 'Kreditnota', cls: 'bg-red-100 text-red-800' }
  if (r.status === 'paid') return { label: 'Betalt', cls: 'bg-emerald-100 text-emerald-800' }
  if (r.is_overdue) return { label: 'Forfalden', cls: 'bg-rose-100 text-rose-800' }
  if (r.payment_status === 'partial') return { label: 'Delvist betalt', cls: 'bg-yellow-100 text-yellow-800' }
  if (r.status === 'sent') return { label: 'Sendt', cls: 'bg-blue-100 text-blue-800' }
  return { label: 'Kladde', cls: 'bg-gray-100 text-gray-700' }
}

function matchesFilter(r: InvoiceOverviewRow, f: FilterKey): boolean {
  switch (f) {
    case 'all':
      return true
    case 'draft':
      return r.status === 'draft' && !r.voided_at
    case 'sent':
      return r.status === 'sent' && !r.voided_at && !r.is_credit_note
    case 'overdue':
      return r.is_overdue
    case 'paid':
      return r.status === 'paid'
    case 'credited':
      return r.is_credit_note || !!r.voided_at
  }
}

export function InvoicesOverviewClient({
  rows,
  canSend,
  canExportAccounting = false,
  accountingReady = false,
}: {
  rows: InvoiceOverviewRow[]
  canSend: boolean
  canExportAccounting?: boolean
  accountingReady?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Sprint Ø4.1 — filter + outstanding er URL-drevet (deep-link + back/forward
  // virker, fordi de udledes direkte af search params ved hver render).
  const filter = parseFilter(searchParams.get('filter'))
  const onlyOutstanding = searchParams.get('outstanding') === '1'
  const acc = parseAcc(searchParams.get('acc'))
  const [search, setSearch] = useState(searchParams.get('q') ?? '')

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') params.delete(k)
        else params.set(k, v)
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)
  const [localRows, setLocalRows] = useState(rows)

  // Sprint Ø6.1 — bulk-eksport: udvalg + resultat pr. faktura.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkPending, startBulk] = useTransition()
  const [bulkResult, setBulkResult] = useState<{ exported: number; skipped: number; failed: number; items: Array<{ invoice_number: string | null; status: string; reason?: string }> } | null>(null)
  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // ---- Summary (cost-free, kun salgsbeløb) ----
  const summary = useMemo(() => {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    let draftCount = 0
    let sentUnpaid = 0
    let overdueCount = 0
    let overdueSum = 0
    let paidThisMonth = 0
    let outstanding = 0
    for (const r of localRows) {
      const active = !r.voided_at && !r.is_credit_note
      if (r.status === 'draft' && !r.voided_at) draftCount += 1
      if (active && r.status === 'sent') {
        sentUnpaid += r.final_amount
        outstanding += r.final_amount
      }
      if (r.is_overdue) {
        overdueCount += 1
        overdueSum += r.final_amount
      }
      if (r.status === 'paid' && r.paid_at && r.paid_at.slice(0, 7) === ym) {
        paidThisMonth += r.final_amount
      }
    }
    return { draftCount, sentUnpaid, overdueCount, overdueSum, paidThisMonth, outstanding }
  }, [localRows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return localRows.filter((r) => {
      if (!matchesFilter(r, filter)) return false
      if (acc !== 'all' && r.accounting_status !== acc) return false
      if (onlyOutstanding && !(r.status === 'sent' && !r.voided_at && !r.is_credit_note)) return false
      if (!q) return true
      return (
        (r.invoice_number ?? '').toLowerCase().includes(q) ||
        (r.customer_name ?? '').toLowerCase().includes(q) ||
        (r.case_number ?? '').toLowerCase().includes(q)
      )
    })
  }, [localRows, filter, acc, search, onlyOutstanding])

  // Bulk-eksport gælder kun ikke-eksporterede valgte fakturaer (action er
  // defensiv og springer ikke-egnede over).
  const selectableIds = useMemo(
    () => filtered.filter((r) => r.accounting_status !== 'exported').map((r) => r.id),
    [filtered]
  )
  const selectedExportable = Array.from(selected).filter((id) => selectableIds.includes(id))

  const handleBulkExport = () => {
    if (!canExportAccounting || !accountingReady || selectedExportable.length === 0) return
    if (!window.confirm(`Eksportér ${selectedExportable.length} valgt(e) faktura(er) til e-conomic?`)) return
    startBulk(async () => {
      const res = await bulkExportInvoicesToEconomicAction(selectedExportable)
      if (res.status === 'not_configured') {
        setFlash({ ok: false, text: 'e-conomic er ikke opsat endnu.' })
        return
      }
      setBulkResult({ exported: res.exported, skipped: res.skipped, failed: res.failed, items: res.items })
      setFlash({ ok: res.failed === 0, text: `Bulk-eksport: ${res.exported} eksporteret, ${res.skipped} sprunget over, ${res.failed} fejl.` })
      // Opdatér status på de eksporterede rækker.
      const exportedIds = new Set(res.items.filter((i) => i.status === 'exported').map((i) => i.invoice_id))
      if (exportedIds.size > 0) {
        setLocalRows((prev) => prev.map((x) => (exportedIds.has(x.id) ? { ...x, accounting_status: 'exported' as const } : x)))
      }
      setSelected(new Set())
    })
  }

  const handleReminder = (r: InvoiceOverviewRow) => {
    if (!canSend) return
    if (
      !window.confirm(
        `Send betalingspåmindelse for faktura ${r.invoice_number} til ${r.customer_email ?? 'kunden'}?\n\n` +
          `Beløb: ${kr(r.final_amount, r.currency)} · forfald ${fmtDate(r.due_date)} (${r.days_overdue} dage over).\n` +
          `Der sendes en mail med påmindelse til kunden.`
      )
    )
      return
    setBusyId(r.id)
    startTransition(async () => {
      const res = await sendInvoiceReminderAction(r.id)
      setBusyId(null)
      setFlash({ ok: res.ok, text: res.message })
      setTimeout(() => setFlash(null), 7000)
      if (res.ok) {
        setLocalRows((prev) =>
          prev.map((x) =>
            x.id === r.id
              ? { ...x, reminder_count: x.reminder_count + 1, last_reminder_at: new Date().toISOString() }
              : x
          )
        )
      }
    })
  }

  const countFor = (f: FilterKey) => localRows.filter((r) => matchesFilter(r, f)).length

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Fakturaoverblik</h1>
        <p className="text-xs text-gray-500">
          Alle udgående kundefakturaer på tværs af sager. Følg op på sendte og forfaldne betalinger.
        </p>
      </div>

      {/* Summary-cards — kun salgsbeløb */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Kladder" value={String(summary.draftCount)} tone="gray" icon={<FileText className="w-4 h-4" />} />
        <SummaryCard label="Sendt — ikke betalt" value={kr(summary.sentUnpaid, 'DKK')} tone="blue" icon={<Send className="w-4 h-4" />} />
        <SummaryCard
          label="Forfaldne"
          value={`${summary.overdueCount} · ${kr(summary.overdueSum, 'DKK')}`}
          tone="rose"
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <SummaryCard label="Betalt denne måned" value={kr(summary.paidThisMonth, 'DKK')} tone="emerald" icon={<BadgeCheck className="w-4 h-4" />} />
        <SummaryCard label="Udestående i alt" value={kr(summary.outstanding, 'DKK')} tone="amber" icon={<Receipt className="w-4 h-4" />} />
      </div>

      {flash && (
        <div
          className={`text-sm rounded px-3 py-2 ring-1 ${
            flash.ok ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-red-50 text-red-900 ring-red-200'
          }`}
        >
          {flash.text}
        </div>
      )}

      {/* Filtre + søgning */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => updateParams({ filter: f.key === 'all' ? null : FILTER_TO_URL[f.key] })}
              className={`px-3 py-1.5 text-xs rounded-lg ring-1 transition ${
                filter === f.key
                  ? 'bg-emerald-600 text-white ring-emerald-600'
                  : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'
              }`}
            >
              {f.label}
              <span className={`ml-1.5 ${filter === f.key ? 'text-emerald-100' : 'text-gray-400'}`}>
                {countFor(f.key)}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={onlyOutstanding}
              onChange={(e) => updateParams({ outstanding: e.target.checked ? '1' : null })}
            />
            Kun udestående
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                updateParams({ q: e.target.value || null })
              }}
              placeholder="Søg fakturanr / kunde / sag"
              className="pl-7 pr-2 py-1.5 text-xs border rounded-lg w-56"
            />
          </div>
        </div>
      </div>

      {/* Sprint Ø6.1 — regnskabsfilter (separat akse) + bulk-eksport */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <span className="text-xs text-gray-500 inline-flex items-center gap-1">
          <BookCheck className="w-3.5 h-3.5" /> Regnskab:
        </span>
        {ACC_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => updateParams({ acc: f.key === 'all' ? null : f.key })}
            className={`px-2.5 py-1 text-xs rounded-lg ring-1 transition ${
              acc === f.key ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label}
            <span className={`ml-1.5 ${acc === f.key ? 'text-emerald-100' : 'text-gray-400'}`}>
              {localRows.filter((r) => r.accounting_status === f.key).length || (f.key === 'all' ? localRows.length : 0)}
            </span>
          </button>
        ))}
        {canExportAccounting && (
          <div className="ml-auto flex items-center gap-2">
            {!accountingReady ? (
              <span className="text-[11px] text-amber-600 inline-flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> e-conomic er ikke opsat endnu
              </span>
            ) : (
              <span className="text-[11px] text-gray-500">{selectedExportable.length} valgt</span>
            )}
            <button
              type="button"
              onClick={handleBulkExport}
              disabled={!accountingReady || selectedExportable.length === 0 || bulkPending}
              title={!accountingReady ? 'e-conomic er ikke opsat endnu' : 'Eksportér valgte fakturaer til e-conomic'}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
              Eksportér valgte til e-conomic
            </button>
          </div>
        )}
      </div>

      {/* Bulk-resultat pr. faktura */}
      {bulkResult && (
        <div className="rounded-lg ring-1 ring-gray-200 bg-white p-3 text-xs">
          <div className="font-medium text-gray-800 mb-1">
            Resultat: {bulkResult.exported} eksporteret · {bulkResult.skipped} sprunget over · {bulkResult.failed} fejl
          </div>
          <ul className="space-y-0.5 max-h-40 overflow-y-auto">
            {bulkResult.items.map((it, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${
                  it.status === 'exported' ? 'bg-emerald-100 text-emerald-800' : it.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {it.status === 'exported' ? 'Eksporteret' : it.status === 'failed' ? 'Fejl' : 'Sprunget over'}
                </span>
                <span className="font-mono text-gray-700">{it.invoice_number ?? '—'}</span>
                {it.reason && <span className="text-gray-500">— {it.reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabel */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                {canExportAccounting && <th className="px-3 py-2 w-8" />}
                <th className="px-3 py-2">Faktura</th>
                <th className="px-3 py-2">Kunde</th>
                <th className="px-3 py-2">Sag</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Regnskab</th>
                <th className="px-3 py-2 text-right">Beløb inkl. moms</th>
                <th className="px-3 py-2">Forfald</th>
                <th className="px-3 py-2 text-right">Handlinger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canExportAccounting ? 9 : 8} className="px-3 py-8 text-center text-gray-400 text-xs">
                    {search.trim()
                      ? `Ingen fakturaer matcher søgningen "${search.trim()}".`
                      : onlyOutstanding && filter === 'sent'
                        ? 'Der er ingen sendte udestående fakturaer lige nu.'
                        : onlyOutstanding
                          ? 'Der er ingen udestående fakturaer lige nu.'
                          : EMPTY_TEXT[filter]}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const sb = statusBadge(r)
                  const pill = r.invoice_type ? TYPE_PILL[r.invoice_type] : undefined
                  return (
                    <tr key={r.id} className={`align-top hover:bg-gray-50 ${r.is_overdue ? 'bg-rose-50/40' : ''}`}>
                      {canExportAccounting && (
                        <td className="px-3 py-2">
                          {r.accounting_status !== 'exported' ? (
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggleSel(r.id)}
                              aria-label={`Vælg faktura ${r.invoice_number ?? ''}`}
                            />
                          ) : null}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <Link href={`/dashboard/invoices/${r.id}`} className="font-mono text-emerald-700 hover:underline">
                          {r.invoice_number ?? '—'}
                        </Link>
                        {pill && (
                          <span className={`block mt-0.5 w-fit px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${pill.cls}`}>
                            {pill.label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-gray-800">{r.customer_name ?? '—'}</div>
                        {r.customer_email && <div className="text-[11px] text-gray-400">{r.customer_email}</div>}
                      </td>
                      <td className="px-3 py-2">
                        {r.case_number ? (
                          <Link href={`/dashboard/orders/${r.case_number}`} className="font-mono text-xs text-emerald-700 hover:underline">
                            {r.case_number}
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${sb.cls}`}>
                          {r.voided_at && <Ban className="w-3 h-3" />}
                          {sb.label}
                        </span>
                        {r.reminder_count > 0 && (
                          <span className="block mt-0.5 text-[10px] text-amber-700">
                            {r.reminder_count} påmindelse{r.reminder_count === 1 ? '' : 'r'} sendt
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${ACC_SKIN[r.accounting_status].cls}`}>
                          {ACC_SKIN[r.accounting_status].label}
                        </span>
                        {r.accounting_external_id && (
                          <span className="block mt-0.5 text-[10px] text-gray-400 font-mono">{r.accounting_external_id}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{kr(r.final_amount, r.currency)}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {r.due_date ? fmtDate(r.due_date) : <span className="text-gray-400">Ingen forfaldsdato</span>}
                        {r.is_overdue && r.days_overdue != null && (
                          <span className="block text-rose-700 font-medium">{r.days_overdue} dage over</span>
                        )}
                        {r.paid_at && <span className="block text-emerald-700">Betalt {fmtDate(r.paid_at)}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/dashboard/invoices/${r.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded ring-1 ring-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs"
                            title="Åbn faktura"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Åbn
                          </Link>
                          <a
                            href={`/api/invoices/${r.id}/pdf?view=1`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded ring-1 ring-gray-300 text-gray-700 hover:bg-gray-50 text-xs"
                            title="Vis PDF"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                          <a
                            href={`/api/invoices/${r.id}/pdf`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded ring-1 ring-gray-300 text-gray-700 hover:bg-gray-50 text-xs"
                            title="Download PDF"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </a>
                          {r.is_overdue && canSend && (
                            <button
                              type="button"
                              onClick={() => handleReminder(r)}
                              disabled={pending && busyId === r.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 text-xs"
                              title={r.customer_email ? `Send påmindelse til ${r.customer_email}` : 'Send betalingspåmindelse'}
                            >
                              {pending && busyId === r.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Bell className="w-3.5 h-3.5" />
                              )}
                              Påmind
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        Omkostningsfrit overblik — kun fakturabeløb inkl. moms. Ingen kost, margin eller
        dækningsbidrag vises. Betalingspåmindelser kræver send-adgang og bekræftes før afsendelse.
      </p>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: string
  tone: 'gray' | 'blue' | 'rose' | 'emerald' | 'amber'
  icon: React.ReactNode
}) {
  const toneCls = {
    gray: 'ring-gray-200 text-gray-700',
    blue: 'ring-blue-200 text-blue-700',
    rose: 'ring-rose-200 text-rose-700',
    emerald: 'ring-emerald-200 text-emerald-700',
    amber: 'ring-amber-200 text-amber-700',
  }[tone]
  return (
    <div className={`rounded-lg ring-1 bg-white px-3 py-2.5 ${toneCls}`}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums text-gray-900">{value}</div>
    </div>
  )
}
