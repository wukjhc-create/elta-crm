'use client'

import { copenhagenParts } from '@/lib/utils/copenhagen-time'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  createTestIncomingInvoiceAction,
  listIncomingInvoicesAction,
  type IncomingInvoiceListItem,
} from '@/lib/actions/incoming-invoices'
import { Button } from '@/components/ui/button'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { UploadInvoiceButton } from './upload-invoice-button'
import { incomingInvoiceStatusLabel } from '@/lib/invoices/incoming-invoice-status'
import {
  incomingDueBadge,
  matchesIncomingDueFilter,
  INCOMING_DUE_FILTERS,
  INCOMING_DUE_FILTER_LABELS,
  INCOMING_DUE_BADGE_CONFIG,
  type IncomingDueFilter,
} from '@/lib/invoices/incoming-invoice-due'

const TEST_INVOICE_PREFIX = 'TEST-'
const TEST_SUPPLIER_NAME = 'TEST Leverandør ApS'

function isTestRow(r: IncomingInvoiceListItem): boolean {
  return (
    (r.invoice_number ?? '').startsWith(TEST_INVOICE_PREFIX) ||
    r.supplier_name === TEST_SUPPLIER_NAME
  )
}

type FilterKey = 'needs_review' | 'awaiting_approval' | 'approved' | 'rejected' | 'posted' | 'missing_file' | 'not_invoice' | 'all'

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'needs_review',      label: 'Kræver gennemgang' },
  { key: 'awaiting_approval', label: 'Afventer godkendelse' },
  { key: 'approved',          label: 'Godkendt' },
  { key: 'rejected',          label: 'Afvist' },
  { key: 'posted',            label: 'Bogført' },
  { key: 'missing_file',      label: 'Mangler bilag' },
  // N68: privat afsender uden leverandør/beløb — gennemgå og afvis dem der ikke er leverandørfakturaer
  { key: 'not_invoice',       label: 'Ikke en faktura?' },
  { key: 'all',               label: 'Alle' },
]

interface CountMap {
  awaiting_approval: number
  needs_review: number
  approved: number
  rejected: number
  posted: number
  missing_file: number
}

const fmtAmount = (n: number | null, ccy = 'DKK') =>
  n == null
    ? 'Beløb mangler'
    : new Intl.NumberFormat('da-DK', { style: 'currency', currency: ccy, maximumFractionDigits: 2 }).format(n)

const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '—')

const fmtPct = (n: number | null) =>
  n == null ? '—' : `${Math.round(n * 100)} %`

function emptyListText(due: IncomingDueFilter | null): string {
  if (due) return 'Ingen godkendte fakturaer med dette forfald. Vælg Alle under Forfald, eller en anden kategori.'
  return 'Ingen fakturaer i denne kategori. Vælg en anden kategori, eller Alle.'
}

export function IncomingInvoicesListClient({
  initialRows,
  initialCounts,
  initialListError = null,
  initialCountsError = null,
  initialSendersFailed = false,
}: {
  initialRows: IncomingInvoiceListItem[]
  initialCounts: CountMap
  initialListError?: string | null
  initialCountsError?: string | null
  initialSendersFailed?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { role } = useUserRole()
  const isAdmin = role === 'admin'

  // Sprint Ø9.1 — URL-drevet forfaldsfilter (intern indkøb). Når aktivt vises
  // GODKENDTE fakturaer (afventer bogføring/betaling) filtreret på forfald.
  const dueParam = searchParams.get('due')
  const due: IncomingDueFilter | null =
    dueParam && (INCOMING_DUE_FILTERS as readonly string[]).includes(dueParam)
      ? (dueParam as IncomingDueFilter)
      : null
  const todayIso = copenhagenParts(new Date()).date

  const [rows, setRows] = useState<IncomingInvoiceListItem[]>(initialRows)
  const [rowsTerm, setRowsTerm] = useState('all:needs_review')
  const [listError, setListError] = useState<string | null>(initialListError)
  const [sendersFailed, setSendersFailed] = useState(initialSendersFailed)
  const [filter, setFilter] = useState<FilterKey>('needs_review')
  const listTerm = `${due ?? 'all'}:${due ? 'approved' : filter}`
  const [busy, startTransition] = useTransition()
  const [counts] = useState<CountMap>(initialCounts)
  const [countsError] = useState<string | null>(initialCountsError)
  const [seedBusy, setSeedBusy] = useState(false)
  const [seedMsg, setSeedMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const createTestInvoice = async () => {
    setSeedBusy(true)
    setSeedMsg(null)
    const r = await createTestIncomingInvoiceAction()
    setSeedBusy(false)
    setSeedMsg({ ok: r.ok, text: r.message })
    if (r.ok && r.data && typeof r.data.invoiceId === 'string') {
      router.push(`/dashboard/incoming-invoices/${r.data.invoiceId}`)
    } else {
      // Refresh the current view in case it just appeared at top
      try {
        const next = await listIncomingInvoicesAction({ status: due ? 'approved' : filter })
        if (next.error) {
          setListError(next.error)
          setSendersFailed(false)
        } else {
          setListError(null)
          setRows(next.rows)
          setRowsTerm(listTerm)
          setSendersFailed(!!next.senders_failed)
        }
      } catch {
        setListError('Kunne ikke hente fakturaer')
      }
      setTimeout(() => setSeedMsg(null), 6000)
    }
  }

  // Når forfaldsfilter er aktivt: hent godkendte fakturaer (overblikkets
  // scope); ellers brug det valgte statusfilter.
  useEffect(() => {
    startTransition(async () => {
      try {
        const next = await listIncomingInvoicesAction({ status: due ? 'approved' : filter })
        if (next.error) {
          setListError(next.error)
          setSendersFailed(false)
        } else {
          setListError(null)
          setRows(next.rows)
          setRowsTerm(listTerm)
          setSendersFailed(!!next.senders_failed)
        }
      } catch {
        setListError('Kunne ikke hente fakturaer')
      }
    })
  }, [filter, due])

  const displayRows = useMemo(
    () => (due ? rows.filter((r) => matchesIncomingDueFilter(r.due_date, due, todayIso)) : rows),
    [rows, due, todayIso]
  )

  const setDue = (value: IncomingDueFilter | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('due', value)
    else params.delete('due')
    router.replace(`/dashboard/incoming-invoices?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold break-words min-w-0">Indgående fakturaer</h1>
          <p className="text-xs text-gray-500 break-words min-w-0 max-w-xl">
            Godkend leverandørfakturaer. Ved godkendelse forsøges bogføring til e-conomic. Lykkes det ikke, er fakturaen stadig godkendt.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
        <UploadInvoiceButton />
        {isAdmin && (
          <Button
            type="button"
            onClick={createTestInvoice}
            disabled={seedBusy}
            variant="outline"
            size="sm"
            className="border-amber-300 text-amber-900 hover:bg-amber-50"
          >
            {seedBusy ? 'Opretter…' : '+ Opret test-leverandørfaktura'}
          </Button>
        )}
        </div>
      </div>

      {seedMsg && (
        <div
          className={`text-sm rounded px-3 py-2 ring-1 ${
            seedMsg.ok
              ? 'bg-emerald-50 text-emerald-900 ring-emerald-200'
              : 'bg-red-50 text-red-900 ring-red-200'
          }`}
        >
          {seedMsg.text}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = countFor(counts, f.key, countsError != null)
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-sm border transition ${
                active
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200'
              }`}
            >
              {f.label}
              {count != null && (
                <span className={`ml-2 inline-block min-w-[22px] text-center text-xs px-1.5 rounded ${
                  active ? 'bg-white/20' : 'bg-gray-100'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Sprint Ø9.1 — forfaldsfilter (intern indkøb, kun godkendte) */}
      <div className="flex flex-wrap items-center gap-2 break-words min-w-0">
        <span className="text-xs text-gray-500 break-words min-w-0">Forfald:</span>
        <button
          type="button"
          aria-pressed={!due}
          onClick={() => setDue(null)}
          className={`px-2.5 py-1 rounded-full text-xs ring-1 ${!due ? 'bg-gray-800 text-white ring-gray-800' : 'bg-white text-gray-600 ring-gray-300 hover:bg-gray-50'}`}
        >Alle</button>
        {INCOMING_DUE_FILTERS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={due === d}
            onClick={() => setDue(d)}
            className={`px-2.5 py-1 rounded-full text-xs ring-1 ${due === d ? 'bg-amber-600 text-white ring-amber-600' : 'bg-white text-gray-700 ring-gray-300 hover:bg-amber-50'}`}
          >{INCOMING_DUE_FILTER_LABELS[d]}</button>
        ))}
        {due && <span className="text-[11px] text-gray-400 break-words min-w-0">Viser godkendte fakturaer (afventer bogføring/betaling)</span>}
      </div>

      {countsError && (
        <p className="text-sm text-red-700 break-words min-w-0" data-testid="incoming-invoices-counts-error">
          {countsError}. Det tælles ikke som 0.
        </p>
      )}
      {listError && (
        <p className="text-sm text-red-700 break-words min-w-0" data-testid="incoming-invoices-load-error">
          {listError}{rowsTerm === listTerm && rows.length > 0 ? '. De tidligere fakturaer bliver.' : '. Det tælles ikke som ingen fakturaer.'}
        </p>
      )}
      {!listError && sendersFailed && (
        <p className="text-sm text-red-700 break-words min-w-0" data-testid="incoming-invoices-senders-error">
          Afsendere kunne ikke hentes. Det tælles ikke som rigtige fakturaer.
        </p>
      )}

      <div className="md:hidden border rounded overflow-hidden bg-white divide-y" data-testid="incoming-invoices-mobile-list">
        {busy && (
          <p className="px-3 py-6 text-center text-gray-400 text-xs">Henter…</p>
        )}
        {!busy && !listError && displayRows.length === 0 && (
          <p className="px-3 py-6 text-center text-gray-400 text-xs">{emptyListText(due)}</p>
        )}
        {!busy && rowsTerm === listTerm && displayRows.map((r) => {
          const isTest = isTestRow(r)
          return (
            <div key={r.id} className={`p-4 ${isTest ? 'bg-amber-50/40' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <Link href={`/dashboard/incoming-invoices/${r.id}`} className="font-medium text-emerald-700 hover:underline break-words min-w-0">
                  {r.supplier_name || 'Leverandør mangler'}
                </Link>
                <StatusBadge row={r} />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {r.probably_not_invoice && <NotInvoiceBadge />}
                {r.duplicate_of_id && <DuplicateBadge />}
                {isTest && <TestBadge />}
                <span className="font-mono text-xs text-gray-700 break-all">{r.invoice_number ?? '—'}</span>
              </div>
              <p className="font-medium text-gray-900 mt-2 break-words min-w-0">{fmtAmount(r.amount_incl_vat, r.currency)}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                <span>Faktura {fmtDate(r.invoice_date)}</span>
                <DueMarks dueDate={r.due_date} todayIso={todayIso} withLabel />
              </div>
              <p className="mt-2 text-xs">
                <Confidence row={r} />
              </p>
              <div className="mt-3">
                <Link href={`/dashboard/incoming-invoices/${r.id}`}>
                  <Button size="sm" variant="outline" aria-label={openInvoiceLabel(r)}>Åbn</Button>
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      <div className="hidden md:block border rounded overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2">Leverandør</th>
              <th className="px-3 py-2">Faktura nr</th>
              <th className="px-3 py-2 text-right">Beløb</th>
              <th className="px-3 py-2">Faktura dato</th>
              <th className="px-3 py-2">Forfald</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Konfidens</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {busy && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400 text-xs">Henter…</td></tr>
            )}
            {!busy && !listError && displayRows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400 text-xs">{emptyListText(due)}</td></tr>
            )}
            {!busy && rowsTerm === listTerm && displayRows.map((r) => {
              const isTest = isTestRow(r)
              return (
              <tr key={r.id} className={`border-t hover:bg-gray-50 ${isTest ? 'bg-amber-50/40' : ''}`}>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <Link href={`/dashboard/incoming-invoices/${r.id}`} className="font-medium text-emerald-700 hover:underline break-words min-w-0">
                      {r.supplier_name || 'Leverandør mangler'}
                    </Link>
                    {r.probably_not_invoice && <NotInvoiceBadge />}
                    {r.duplicate_of_id && <DuplicateBadge />}
                    {isTest && <TestBadge />}
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-xs break-words min-w-0">{r.invoice_number ?? '—'}</td>
                <td className="px-3 py-2 text-right font-medium break-words min-w-0">{fmtAmount(r.amount_incl_vat, r.currency)}</td>
                <td className="px-3 py-2 text-xs break-words min-w-0">{fmtDate(r.invoice_date)}</td>
                <td className="px-3 py-2 text-xs break-words min-w-0">
                  <DueMarks dueDate={r.due_date} todayIso={todayIso} />
                </td>
                <td className="px-3 py-2 break-words min-w-0"><StatusBadge row={r} /></td>
                <td className="px-3 py-2 text-right text-xs break-words min-w-0">
                  <Confidence row={r} />
                </td>
                <td className="px-3 py-2 text-right break-words min-w-0">
                  <Link href={`/dashboard/incoming-invoices/${r.id}`}>
                    <Button size="sm" variant="outline" aria-label={openInvoiceLabel(r)}>Åbn</Button>
                  </Link>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function openInvoiceLabel(r: IncomingInvoiceListItem): string {
  return `Åbn faktura ${r.invoice_number || r.supplier_name || 'uden nummer'}`
}

function countFor(c: CountMap, k: FilterKey, failed: boolean): number | null {
  if (failed || k === 'all' || k === 'not_invoice') return null // N68: tælles ikke på forhånd (kræver afsender-opslag)
  return c[k] ?? 0
}

function DuplicateBadge() {
  return (
    <span
      className="inline-block text-[10px] uppercase tracking-wide bg-red-100 text-red-800 px-1.5 py-0.5 rounded"
      data-testid="invoice-duplicate-badge"
      title="Samme fil eller samme leverandør og fakturanummer findes allerede. Status og bogføring er uændret."
    >
      Dublet
    </span>
  )
}

function NotInvoiceBadge() {
  return (
    <span className="inline-block text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded" data-testid="invoice-not-invoice-badge"
      title="Privat afsender (fx gmail/hotmail), ingen leverandør og intet beløb — sandsynligvis en kundemail, ikke en leverandørfaktura">
      Ikke en faktura?
    </span>
  )
}

function TestBadge() {
  return (
    <span className="inline-block text-[10px] uppercase tracking-wide bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
      TEST
    </span>
  )
}

function DueMarks({ dueDate, todayIso, withLabel = false }: { dueDate: string | null; todayIso: string; withLabel?: boolean }) {
  const b = incomingDueBadge(dueDate, todayIso)
  const cfg = INCOMING_DUE_BADGE_CONFIG[b]
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span>{withLabel ? `Forfald ${fmtDate(dueDate)}` : fmtDate(dueDate)}</span>
      {b !== 'ok' && (
        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${cfg.cls}`}>{cfg.label}</span>
      )}
    </span>
  )
}

function Confidence({ row }: { row: IncomingInvoiceListItem }) {
  return (
    <>
      <span className="text-gray-500">parse</span> {fmtPct(row.parse_confidence)}
      <span className="text-gray-400 mx-1">·</span>
      <span className="text-gray-500">match</span> {fmtPct(row.match_confidence)}
    </>
  )
}

function StatusBadge({ row }: { row: IncomingInvoiceListItem }) {
  if (row.requires_manual_review && row.status !== 'rejected' && row.status !== 'approved' && row.status !== 'posted') {
    return <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Kræver gennemgang</span>
  }
  const colour =
    row.status === 'approved'           ? 'bg-emerald-100 text-emerald-800'
    : row.status === 'posted'           ? 'bg-emerald-100 text-emerald-900'
    : row.status === 'rejected'         ? 'bg-red-100 text-red-800'
    : row.status === 'cancelled'        ? 'bg-gray-100 text-gray-700'
    : row.status === 'awaiting_approval' ? 'bg-blue-100 text-blue-800'
    : 'bg-gray-100 text-gray-700'
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colour}`}>{incomingInvoiceStatusLabel(row.status)}</span>
}
