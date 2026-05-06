'use client'

/**
 * Sprint 6B-4 — invoice detail page.
 *
 * Shows header + customer + sag-link + lines table + status actions.
 * Handles draft / sent / paid lifecycle; no PDF/email/e-conomic in
 * this commit (those land in 6C/6E).
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import {
  ArrowLeft, AlertCircle, Loader2, FileText, ExternalLink,
  Trash2, Send, BadgeCheck, Lock, Info, FileDown, Eye, Mail,
  FileMinus, Ban,
} from 'lucide-react'
import {
  deleteInvoiceDraftAction,
  getCreditedAmountForInvoiceAction,
  getInvoiceDetailAction,
  markInvoicePaidAction,
  markInvoiceSentAction,
  sendInvoiceEmailAction,
  type InvoiceDetail,
} from '@/lib/actions/invoices'
import type { CreditSummary } from '@/lib/services/invoice-credit'
import { CreditNoteDialog } from './credit-note-dialog'
import { formatCurrency } from '@/lib/utils/format'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Kladde',
  sent: 'Sendt',
  paid: 'Betalt',
}

const INVOICE_TYPE_PILL: Record<string, { label: string; bg: string; text: string }> = {
  standard: { label: '',            bg: '',                 text: '' },
  deposit:  { label: 'Forskud',     bg: 'bg-blue-100',      text: 'text-blue-800' },
  progress: { label: 'Rate',        bg: 'bg-purple-100',    text: 'text-purple-800' },
  final:    { label: 'Slutfaktura', bg: 'bg-orange-100',    text: 'text-orange-800' },
  credit:   { label: 'Kreditnota',  bg: 'bg-red-100',       text: 'text-red-800' },
}

const PRED_TYPE_LABEL: Record<string, string> = {
  deposit:  'Forskud',
  progress: 'Rate',
  standard: 'Faktura',
  final:    'Slutfaktura',
  credit:   'Kreditnota',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 ring-gray-300',
  sent: 'bg-blue-100 text-blue-800 ring-blue-300',
  paid: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
}

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Ikke betalt',
  partial: 'Delvis betalt',
  paid: 'Betalt',
}

const PAYMENT_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  partial: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-emerald-100 text-emerald-800',
}

function fmtKr(n: number | null | undefined, currency = 'DKK'): string {
  if (n == null) return '—'
  return formatCurrency(Number(n), currency, 2)
}

function fmtNum(n: number, decimals = 2): string {
  return new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Intl.DateTimeFormat('da-DK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(s.length === 10 ? s + 'T12:00:00' : s))
}

function lineSourceLabel(line: InvoiceDetail['lines'][number]): {
  label: string
  color: string
} {
  if (line.source_time_log_id) return { label: 'Timer', color: 'bg-emerald-100 text-emerald-800' }
  if (line.source_case_material_id) return { label: 'Materiale', color: 'bg-blue-100 text-blue-800' }
  if (line.source_case_other_cost_id) return { label: 'Øvrig', color: 'bg-purple-100 text-purple-800' }
  return { label: 'Manuel', color: 'bg-gray-100 text-gray-700' }
}

export function InvoiceDetailClient({ initial }: { initial: InvoiceDetail }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [detail, setDetail] = useState<InvoiceDetail>(initial)
  const [busy, setBusy] = useState<null | 'send' | 'pay' | 'delete' | 'mail'>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const inv = detail.invoice
  const status = inv.status
  const isDraft = status === 'draft'
  const isSent = status === 'sent'
  const isPaid = status === 'paid'
  const isLocked = isPaid
  const isCreditNote = inv.invoice_type === 'credit'
  const isVoided = !!inv.voided_at

  // Sprint 6F-3 — credit summary state (kun relevant når invoice IKKE er
  // selv en kreditnota og status ≥ sent)
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(null)
  const [creditDialogOpen, setCreditDialogOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (isCreditNote || isDraft) {
      setCreditSummary(null)
      return
    }
    getCreditedAmountForInvoiceAction(inv.id).then((s) => {
      if (cancelled) return
      setCreditSummary(s.ok ? s : null)
    })
    return () => {
      cancelled = true
    }
  }, [inv.id, isCreditNote, isDraft, detail])

  const refresh = async () => {
    const fresh = await getInvoiceDetailAction(inv.id)
    if (fresh) setDetail(fresh)
  }

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text })
    setTimeout(() => setMsg(null), 6000)
  }

  const handleSend = () => {
    if (!isDraft) return
    setBusy('send')
    startTransition(async () => {
      const r = await markInvoiceSentAction(inv.id)
      setBusy(null)
      flash(r.ok, r.message)
      if (r.ok) await refresh()
    })
  }

  const handlePay = () => {
    if (!isSent) return
    const reference = window.prompt('Betalingsreference (valgfri)') ?? null
    setBusy('pay')
    startTransition(async () => {
      const r = await markInvoicePaidAction(inv.id, reference || null)
      setBusy(null)
      flash(r.ok, r.message)
      if (r.ok) await refresh()
    })
  }

  const handleSendMail = () => {
    if (!isDraft) return
    if (!detail.customer?.email) {
      flash(false, 'Kunden mangler email — kan ikke sende faktura')
      return
    }
    if (
      !window.confirm(
        `Send faktura ${inv.invoice_number} til ${detail.customer.email}?\n\n` +
          `PDF vedhæftes automatisk. Status flippes til 'sendt' ved succes. ` +
          `Ingen e-conomic-push i denne sprint.`
      )
    ) {
      return
    }
    setBusy('mail')
    startTransition(async () => {
      const r = await sendInvoiceEmailAction(inv.id)
      setBusy(null)
      flash(r.ok, r.message)
      if (r.ok) await refresh()
    })
  }

  const handleDelete = () => {
    if (!isDraft) return
    if (
      !window.confirm(
        `Slet kladde "${inv.invoice_number}"?\n\n` +
          `Alle kilde-rækker (timer, materialer, øvrige) der er bundet til ` +
          `denne faktura, frigives og bliver fakturerbare igen.`
      )
    ) {
      return
    }
    setBusy('delete')
    startTransition(async () => {
      const r = await deleteInvoiceDraftAction(inv.id)
      setBusy(null)
      flash(r.ok, r.message)
      if (r.ok) {
        // Header har et brief flash før redirect
        setTimeout(() => router.push('/dashboard/invoices'), 600)
      }
    })
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <Link href="/dashboard/invoices" className="text-emerald-700 hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" />
          Fakturaer
        </Link>
        {detail.case && (
          <>
            <span>/</span>
            <Link
              href={`/dashboard/orders/${detail.case.case_number}`}
              className="text-emerald-700 hover:underline inline-flex items-center gap-1"
            >
              <span className="font-mono">{detail.case.case_number}</span>
              {detail.case.project_name || detail.case.title ? (
                <span>· {detail.case.project_name || detail.case.title}</span>
              ) : null}
            </Link>
          </>
        )}
      </div>

      {/* Header card */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <FileText className="w-6 h-6 text-emerald-600" />
              {inv.invoice_number}
              <span
                className={`text-[11px] uppercase tracking-wide px-2 py-0.5 rounded ring-1 ${
                  STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700 ring-gray-300'
                }`}
              >
                {STATUS_LABELS[status] ?? status}
              </span>
              {inv.payment_status && inv.payment_status !== 'pending' && (
                <span
                  className={`text-[11px] uppercase tracking-wide px-2 py-0.5 rounded ${
                    PAYMENT_COLORS[inv.payment_status] ?? 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {PAYMENT_LABELS[inv.payment_status] ?? inv.payment_status}
                </span>
              )}
              {/* Sprint 6D-4 — invoice_type pille */}
              {(() => {
                const t = inv.invoice_type ?? 'standard'
                const pill = INVOICE_TYPE_PILL[t]
                if (!pill?.label) return null
                return (
                  <span
                    className={`text-[11px] uppercase tracking-wide px-2 py-0.5 rounded ${pill.bg} ${pill.text}`}
                  >
                    {pill.label}
                  </span>
                )
              })()}
              {inv.stage_label && (
                <span className="text-[11px] tracking-wide px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                  {inv.stage_label}
                </span>
              )}
              {isVoided && (
                <span className="text-[11px] uppercase tracking-wide px-2 py-0.5 rounded bg-gray-200 text-gray-700 ring-1 ring-gray-400 inline-flex items-center gap-1">
                  <Ban className="w-3 h-3" />
                  Annulleret
                </span>
              )}
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Oprettet {fmtDate(inv.created_at)}
              {inv.sent_at && <> · sendt {fmtDate(inv.sent_at)}</>}
              {inv.paid_at && <> · betalt {fmtDate(inv.paid_at)}</>}
              {inv.due_date && <> · forfald {fmtDate(inv.due_date)}</>}
            </p>
            {/* Sprint 6D-4 — procent + basis info */}
            {inv.billing_percentage != null && inv.amount_basis_value != null && (
              <p className="text-xs text-gray-700 mt-1">
                Beregnes som{' '}
                <strong>
                  {Number(inv.billing_percentage).toLocaleString('da-DK', {
                    minimumFractionDigits: Number(inv.billing_percentage) % 1 === 0 ? 0 : 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  %
                </strong>{' '}
                af{' '}
                {inv.amount_basis === 'contract_sum' ? 'kontraktsum' : 'revideret beløb'}{' '}
                <strong>{fmtKr(Number(inv.amount_basis_value), inv.currency)}</strong>
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold tabular-nums">{fmtKr(inv.final_amount, inv.currency)}</div>
            <div className="text-xs text-gray-500">incl. {fmtKr(inv.tax_amount, inv.currency)} moms</div>
          </div>
        </div>

        {/* PDF actions — always available, even on drafts */}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
          <a
            href={`/api/invoices/${inv.id}/pdf?view=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded ring-1 ring-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50"
          >
            <Eye className="w-3.5 h-3.5" />
            Vis PDF
          </a>
          <a
            href={`/api/invoices/${inv.id}/pdf`}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded ring-1 ring-gray-300 text-gray-700 bg-white hover:bg-gray-50"
          >
            <FileDown className="w-3.5 h-3.5" />
            Download PDF
          </a>
          {isDraft && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-amber-50 text-amber-800 ring-1 ring-amber-200">
              <Info className="w-3 h-3" />
              Kladde har "KLADDE"-vandmærke i PDF
            </span>
          )}
        </div>
      </div>

      {/* Flash */}
      {msg && (
        <div
          className={`text-sm rounded px-3 py-2 ring-1 ${
            msg.ok
              ? 'bg-emerald-50 text-emerald-900 ring-emerald-200'
              : 'bg-red-50 text-red-900 ring-red-200'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Customer + sag */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Kunde">
          {detail.customer ? (
            <div className="text-sm space-y-0.5">
              <Link
                href={`/dashboard/customers/${detail.customer.id}`}
                className="font-medium text-emerald-700 hover:underline inline-flex items-center gap-1"
              >
                {detail.customer.name || '—'}
                <ExternalLink className="w-3 h-3 opacity-60" />
              </Link>
              {detail.customer.cvr && (
                <div className="text-xs text-gray-500">CVR: {detail.customer.cvr}</div>
              )}
              {detail.customer.address && (
                <div className="text-xs text-gray-700">{detail.customer.address}</div>
              )}
              {(detail.customer.zip || detail.customer.city) && (
                <div className="text-xs text-gray-700">
                  {[detail.customer.zip, detail.customer.city].filter(Boolean).join(' ')}
                </div>
              )}
              {detail.customer.email && (
                <div className="text-xs text-gray-500">{detail.customer.email}</div>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-700">
              Ingen kunde tilknyttet — fakturaen kan ikke sendes uden kunde-data.
            </p>
          )}
        </Panel>

        <Panel title="Sag">
          {detail.case ? (
            <div className="text-sm space-y-0.5">
              <Link
                href={`/dashboard/orders/${detail.case.case_number}`}
                className="font-medium text-emerald-700 hover:underline inline-flex items-center gap-1"
              >
                <span className="font-mono text-xs">{detail.case.case_number}</span>
                <span>{detail.case.project_name || detail.case.title || '—'}</span>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </Link>
            </div>
          ) : inv.work_order_id ? (
            <p className="text-xs text-gray-600">
              Linket til arbejdsordre — sag kan udledes via WO i Sprint 6D.
            </p>
          ) : (
            <p className="text-xs text-gray-500">Ingen sag tilknyttet.</p>
          )}
        </Panel>
      </div>

      {/* Notes */}
      {inv.notes && (
        <Panel title="Note">
          <p className="text-sm whitespace-pre-wrap text-gray-800">{inv.notes}</p>
        </Panel>
      )}

      {/* Sprint 6F-3 — "Kreditnota for"-panel når denne ER en kreditnota */}
      {isCreditNote && inv.credit_of_invoice_id && (
        <Panel title="Kreditnota for">
          <div className="text-sm flex items-center justify-between">
            <Link
              href={`/dashboard/invoices/${inv.credit_of_invoice_id}`}
              className="text-emerald-700 hover:underline inline-flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="font-mono">Original faktura</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </Link>
            {inv.credit_reason && (
              <span className="text-xs text-gray-700">
                Begrundelse: <em>{inv.credit_reason}</em>
              </span>
            )}
          </div>
        </Panel>
      )}

      {/* Sprint 6F-3 — kreditstatus banner (på original faktura) */}
      {!isCreditNote && !isDraft && creditSummary && (
        <CreditStatusPanel
          summary={creditSummary}
          isVoided={isVoided}
          onCredit={() => setCreditDialogOpen(true)}
          isPaidOriginal={isPaid}
        />
      )}

      {/* Sprint 6D-4 — predecessor panel for final invoice */}
      {inv.is_final_invoice && detail.predecessors.length > 0 && (
        <Panel title={`Tidligere fakturaer fratrukket (${detail.predecessors.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-2 py-1.5">Faktura nr</th>
                  <th className="px-2 py-1.5">Type</th>
                  <th className="px-2 py-1.5">Label</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5 text-right">Fradrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {detail.predecessors.map((p) => (
                  <tr key={p.invoice_id}>
                    <td className="px-2 py-1.5 font-mono">
                      <Link
                        href={`/dashboard/invoices/${p.invoice_id}`}
                        className="text-emerald-700 hover:underline"
                      >
                        {p.invoice_number}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5">
                      {PRED_TYPE_LABEL[p.invoice_type] ?? p.invoice_type}
                    </td>
                    <td className="px-2 py-1.5 text-gray-700">
                      {p.stage_label ?? '—'}
                    </td>
                    <td className="px-2 py-1.5">{p.status}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium text-red-700">
                      −{fmtKr(p.deduction_amount, inv.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-2 py-1.5 text-right text-xs uppercase tracking-wide text-gray-600">
                    Total fradrag
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-bold text-red-700">
                    −{fmtKr(
                      detail.predecessors.reduce((s, p) => s + p.deduction_amount, 0),
                      inv.currency
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            Disse fradrag indgår allerede som negative linjer i faktura-tabellen
            nedenfor. Sletning af en fratrukket faktura er blokeret af DB ON DELETE
            RESTRICT — slet slutfakturaen først hvis du vil ændre forgængerne.
          </p>
        </Panel>
      )}

      {/* Lines */}
      <Panel title={`Fakturalinjer (${detail.lines.length})`}>
        {detail.lines.length === 0 ? (
          <p className="text-xs text-gray-500">Ingen linjer på fakturaen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-2 py-1.5 w-10">#</th>
                  <th className="px-2 py-1.5">Beskrivelse</th>
                  <th className="px-2 py-1.5">Kilde</th>
                  <th className="px-2 py-1.5 text-right">Antal</th>
                  <th className="px-2 py-1.5">Enhed</th>
                  <th className="px-2 py-1.5 text-right">Stk-pris</th>
                  <th className="px-2 py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {detail.lines.map((l) => {
                  const src = lineSourceLabel(l)
                  return (
                    <tr key={l.id}>
                      <td className="px-2 py-1.5 text-gray-500 tabular-nums">{l.position}</td>
                      <td className="px-2 py-1.5">{l.description}</td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${src.color}`}
                        >
                          {src.label}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(Number(l.quantity), 2)}</td>
                      <td className="px-2 py-1.5 text-gray-600">{l.unit ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtKr(l.unit_price, inv.currency)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtKr(l.total_price, inv.currency)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-sm">
                <tr>
                  <td colSpan={6} className="px-2 py-1.5 text-right text-xs uppercase tracking-wide text-gray-600">
                    Subtotal (ex moms)
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                    {fmtKr(inv.total_amount, inv.currency)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={6} className="px-2 py-1.5 text-right text-xs uppercase tracking-wide text-gray-600">
                    Moms
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                    {fmtKr(inv.tax_amount, inv.currency)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={6} className="px-2 py-2 text-right text-xs uppercase tracking-wide text-gray-700 font-medium">
                    Total inkl. moms
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold text-base">
                    {fmtKr(inv.final_amount, inv.currency)}
                  </td>
                </tr>
                {inv.amount_paid > 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-1.5 text-right text-xs uppercase tracking-wide text-emerald-700">
                      Betalt
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">
                      {fmtKr(inv.amount_paid, inv.currency)}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      {/* Status actions */}
      <Panel title="Handlinger">
        {isLocked && (
          <div className="rounded ring-1 ring-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5" />
            Fakturaen er betalt og låst. Yderligere ændringer skal håndteres som kreditnota (kommer i Sprint 6D).
          </div>
        )}

        {isDraft && (
          <div className="space-y-3">
            <div className="text-xs text-gray-600 flex items-start gap-1">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Kladde-fase. "Send faktura på mail" sender PDF til kundens email
                og flipper status til 'sendt'. e-conomic-push kommer i Sprint 6E.
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSendMail}
                disabled={busy !== null || !detail.customer?.email}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                title={
                  detail.customer?.email
                    ? `Sender til ${detail.customer.email}`
                    : 'Kunden mangler email'
                }
              >
                {busy === 'mail' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                Send faktura på mail
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={busy !== null}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded ring-1 ring-blue-300 text-blue-700 bg-white hover:bg-blue-50 disabled:opacity-60"
                title="Sætter status til 'sendt' uden at sende noget"
              >
                {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Markér som sendt (uden mail)
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy !== null}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded ring-1 ring-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-60"
              >
                {busy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Slet kladde
              </button>
            </div>
            {!detail.customer?.email && (
              <div className="rounded ring-1 ring-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Kunden mangler email — &quot;Send faktura på mail&quot; er deaktiveret. Tilføj email på kunden eller brug &quot;Markér som sendt&quot;.
              </div>
            )}
            <p className="text-[11px] text-gray-500 flex items-start gap-1">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              Slet frigiver alle bundne timer / materialer / øvrige omkostninger på sagen. De bliver fakturerbare igen.
            </p>
          </div>
        )}

        {isSent && !isVoided && (
          <div className="space-y-3">
            <div className="text-xs text-gray-600 flex items-start gap-1">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Status sat til 'sendt'. Bemærk: ingen mail er afsendt automatisk endnu.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePay}
                disabled={busy !== null}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy === 'pay' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />}
                Markér som betalt
              </button>
            </div>
            <p className="text-[11px] text-gray-500 flex items-start gap-1">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              Slet er ikke tilladt på en sendt faktura. Brug kreditnota-flow nedenfor i stedet.
            </p>
          </div>
        )}

        {/* Sprint 6F-3 fix — Annulleret-banner: skjuler både Markér betalt
            og Krediter-knap når voided_at er sat (fuld sendt kreditnota
            har dækket originalen). */}
        {isVoided && !isCreditNote && (
          <div className="rounded ring-1 ring-gray-300 bg-gray-50 px-3 py-3 text-sm text-gray-700 flex items-start gap-2">
            <Ban className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />
            <div>
              <strong>Annulleret via kreditnota.</strong> Ingen yderligere
              betalings- eller kreditnota-handlinger er tilladt på denne
              faktura. Original betaling refunderes uden for systemet.
            </div>
          </div>
        )}

        {/* Sprint 6F-3 — Krediter-knap. Skjuler når:
              - faktura ER en kreditnota
              - status='draft'
              - voided_at er sat (juridisk annulleret)
              - remaining_creditable_ex_vat ≤ 0 (drafts har reserveret hele beløbet)
            Drafts på remaining tæller med så over-credit ikke kan ske. */}
        {!isCreditNote && !isDraft && creditSummary && !creditSummary.is_voided &&
          creditSummary.remaining_creditable_ex_vat > 0 && (
            <div className="border-t pt-3 mt-3">
              <button
                type="button"
                onClick={() => setCreditDialogOpen(true)}
                disabled={busy !== null}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                <FileMinus className="w-3.5 h-3.5" />
                Krediter faktura
              </button>
              <p className="text-[11px] text-gray-500 mt-1 flex items-start gap-1">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                Opretter ny kreditnota med eget fakturanummer. Original-fakturaen
                annulleres først når kreditnotaen markeres som sendt.
              </p>
            </div>
          )}
      </Panel>

      {/* Sprint 6F-3 — credit dialog */}
      {creditSummary && !isCreditNote && (
        <CreditNoteDialog
          open={creditDialogOpen}
          invoiceId={inv.id}
          invoiceNumber={inv.invoice_number}
          currency={inv.currency}
          remainingExVat={creditSummary.remaining_creditable_ex_vat}
          vatRate={
            creditSummary.original_total_ex_vat > 0
              ? creditSummary.original_vat / creditSummary.original_total_ex_vat
              : 0.25
          }
          lines={detail.lines}
          onClose={() => setCreditDialogOpen(false)}
          onCreated={() => setCreditDialogOpen(false)}
        />
      )}
    </div>
  )
}

// =====================================================
// CreditStatusPanel — viser status på original faktura
// =====================================================

function CreditStatusPanel({
  summary,
  isVoided,
  isPaidOriginal,
  onCredit,
}: {
  summary: CreditSummary
  isVoided: boolean
  isPaidOriginal: boolean
  onCredit: () => void
}) {
  const fmtKrLocal = (n: number) => formatCurrency(n, 'DKK', 2)
  const hasCredits = summary.existing_credit_notes.length > 0
  const onlyDrafts = summary.has_only_draft_credits
  const fullyFinalized = summary.is_fully_credited_finalized || isVoided
  // "Delvist krediteret" gælder kun for faktura med ≥1 finalized credit
  // som ikke dækker hele beløbet.
  const partiallyFinalized =
    summary.finalized_credit_count > 0 && !fullyFinalized

  if (!hasCredits && !isVoided) return null

  // Pille-style efter højest-prioritets-state:
  // 1. Annulleret (voided_at sat)
  // 2. Fuldt krediteret (finalized = total, men race-window før voided_at)
  // 3. Delvist krediteret (finalized < total, men > 0)
  // 4. Kreditnota-kladde findes (kun drafts)
  let pill: { label: string; className: string }
  if (isVoided) {
    pill = {
      label: 'Annulleret',
      className: 'bg-gray-200 text-gray-700 ring-1 ring-gray-300',
    }
  } else if (fullyFinalized) {
    pill = {
      label: 'Fuldt krediteret',
      className: 'bg-gray-200 text-gray-700 ring-1 ring-gray-300',
    }
  } else if (partiallyFinalized) {
    pill = {
      label: 'Delvist krediteret',
      className: 'bg-amber-100 text-amber-800',
    }
  } else if (onlyDrafts) {
    pill = {
      label: 'Kreditnota-kladde',
      className: 'bg-yellow-100 text-yellow-900',
    }
  } else {
    pill = {
      label: '—',
      className: 'bg-gray-100 text-gray-700',
    }
  }

  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FileMinus className="w-4 h-4 text-red-600" />
          Kreditteringer
        </h3>
        <span
          className={`text-[11px] uppercase tracking-wide px-2 py-0.5 rounded ${pill.className}`}
        >
          {pill.label}
        </span>
      </div>
      <div className="px-4 py-3 space-y-3">
        {/* Sprint 6F-3 fix — gul advarsel når kun draft credits findes */}
        {onlyDrafts && !isVoided && (
          <div className="rounded ring-1 ring-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-900 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Der findes en kreditnota-kladde, men fakturaen er <strong>ikke
              annulleret endnu</strong>. Send eller markér kreditnotaen som sendt
              for at fuldføre annulleringen — eller slet kladden hvis fakturaen
              alligevel skal stå.
            </span>
          </div>
        )}

        {/* Krediteret X af Y — bruger finalized-tal, ikke draft */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Original beløb</div>
            <div className="tabular-nums font-semibold text-gray-900">
              {fmtKrLocal(summary.original_total_ex_vat)} ekskl.
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Endelig krediteret</div>
            <div className="tabular-nums font-semibold text-red-700">
              −{fmtKrLocal(summary.credited_finalized_ex_vat_total)}
            </div>
            <div className="text-[10px] text-gray-500">
              {summary.finalized_credit_count} sendt/betalt
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Reserveret i kladde</div>
            <div className="tabular-nums font-semibold text-yellow-700">
              −{fmtKrLocal(summary.credited_draft_ex_vat_total)}
            </div>
            <div className="text-[10px] text-gray-500">
              {summary.draft_credit_count} kladde
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Resterende</div>
            <div className="tabular-nums font-semibold text-gray-900">
              {fmtKrLocal(summary.remaining_creditable_ex_vat)}
            </div>
          </div>
        </div>

        {/* Eksisterende kreditnotaer */}
        {hasCredits && (
          <div className="rounded ring-1 ring-gray-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-2 py-1.5">Kreditnota</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5">Begrundelse</th>
                  <th className="px-2 py-1.5 text-right">Beløb</th>
                  <th className="px-2 py-1.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.existing_credit_notes.map((c) => (
                  <tr
                    key={c.id}
                    className={c.status === 'draft' ? 'bg-yellow-50/40' : ''}
                  >
                    <td className="px-2 py-1.5 font-mono">{c.invoice_number}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${
                          c.status === 'draft'
                            ? 'bg-yellow-100 text-yellow-900'
                            : c.status === 'sent'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-gray-700">{c.credit_reason ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium text-red-700">
                      {fmtKrLocal(c.final_amount)}
                    </td>
                    <td className="px-2 py-1.5">
                      <Link
                        href={`/dashboard/invoices/${c.id}`}
                        className="inline-flex items-center text-emerald-700 hover:text-emerald-900"
                        aria-label="Åbn kreditnota"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom messaging + action */}
        {isVoided ? (
          <p className="text-[11px] text-gray-500 flex items-start gap-1">
            <Ban className="w-3 h-3 mt-0.5 shrink-0" />
            Faktura er annulleret via sendt fuld kreditering. Ingen yderligere
            kreditnota er tilladt.
            {isPaidOriginal && (
              <span className="ml-1">
                Original betaling refunderes uden for systemet.
              </span>
            )}
          </p>
        ) : fullyFinalized ? (
          <p className="text-[11px] text-gray-500 flex items-start gap-1">
            <Ban className="w-3 h-3 mt-0.5 shrink-0" />
            Faktura er fuldt krediteret af sendte/betalte kreditnotaer. Ingen
            yderligere kreditnota er tilladt.
          </p>
        ) : summary.remaining_creditable_ex_vat > 0 ? (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onCredit}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded ring-1 ring-red-300 text-red-700 bg-white hover:bg-red-50"
            >
              <FileMinus className="w-3 h-3" />
              Opret yderligere kreditnota
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-gray-500 flex items-start gap-1">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            Drafts har reserveret hele resterende beløb. Send eller slet en
            eksisterende kladde før yderligere kreditnota kan oprettes.
          </p>
        )}
      </div>
    </div>
  )
}

function Panel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
      <div className="px-4 py-2 border-b bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}
