'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  approveIncomingInvoiceAction,
  getIncomingInvoiceDetailAction,
  reparseIncomingInvoiceAction,
  rejectIncomingInvoiceAction,
  type IncomingInvoiceDetail,
} from '@/lib/actions/incoming-invoices'
import { Button } from '@/components/ui/button'

const fmtAmount = (n: number | null | undefined, ccy = 'DKK') =>
  n == null
    ? '—'
    : new Intl.NumberFormat('da-DK', { style: 'currency', currency: ccy, maximumFractionDigits: 2 }).format(Number(n))

const fmtDate = (s: string | null | undefined) => (s ? s.slice(0, 10) : '—')
const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(Number(n) * 100)} %`)

const SIGNAL_LABEL: Record<string, string> = {
  vat_match:                 'CVR-match',
  supplier_name_match:       'Navn-match',
  supplier_order_ref_match:  'Leverandør ordre-ref',
  work_order_via_case:       'Sag → arbejdsordre',
  work_order_via_title:      'Arbejdsordre titel',
  customer_address_match:    'Adresse-match',
  duplicate_detected:        'Duplikat fundet',
}

type Msg = { ok: boolean; text: string } | null

export function IncomingInvoiceDetailClient({ initial }: { initial: IncomingInvoiceDetail }) {
  const [detail, setDetail] = useState<IncomingInvoiceDetail>(initial)
  const [busy, startTransition] = useTransition()
  const [msg, setMsg] = useState<Msg>(null)
  const [confirmReview, setConfirmReview] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)

  const inv = detail.invoice
  const review = inv.requires_manual_review
  const terminal = inv.status === 'approved' || inv.status === 'rejected' || inv.status === 'posted' || inv.status === 'cancelled'
  const breakdown = (inv as unknown as { match_breakdown?: Record<string, unknown> }).match_breakdown ?? null

  const refresh = async () => {
    const fresh = await getIncomingInvoiceDetailAction(inv.id)
    if (fresh) setDetail(fresh)
  }

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text })
    setTimeout(() => setMsg(null), 5000)
  }

  const approve = (acknowledge: boolean) => startTransition(async () => {
    const r = await approveIncomingInvoiceAction(inv.id, acknowledge)
    flash(r.ok, r.message)
    if (r.ok) {
      setConfirmReview(false)
      await refresh()
    }
  })

  const reject = () => startTransition(async () => {
    const r = await rejectIncomingInvoiceAction(inv.id, rejectReason)
    flash(r.ok, r.message)
    if (r.ok) {
      setShowReject(false)
      setRejectReason('')
      await refresh()
    }
  })

  const reparse = () => startTransition(async () => {
    const r = await reparseIncomingInvoiceAction(inv.id)
    flash(r.ok, r.message)
    await refresh()
  })

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/incoming-invoices" className="text-xs text-emerald-700 hover:underline">← Indgående fakturaer</Link>
          <h1 className="text-2xl font-semibold mt-1">
            {detail.supplier?.name ?? inv.supplier_name_extracted ?? 'Ukendt leverandør'}
          </h1>
          <p className="text-xs text-gray-500">
            Faktura nr <span className="font-mono">{inv.invoice_number ?? '—'}</span>
            {inv.invoice_date && <> · {fmtDate(inv.invoice_date)}</>}
            {inv.due_date && <> · forfald {fmtDate(inv.due_date)}</>}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold">{fmtAmount(inv.amount_incl_vat, inv.currency)}</div>
          <div className="text-xs text-gray-500">incl. moms</div>
        </div>
      </div>

      {msg && (
        <div className={`text-sm rounded px-3 py-2 ring-1 ${
          msg.ok ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-red-50 text-red-900 ring-red-200'
        }`}>{msg.text}</div>
      )}

      {review && !terminal && (
        <div className="rounded-md bg-amber-50 ring-1 ring-amber-300 px-4 py-3">
          <div className="font-medium text-amber-900">Faktura kræver manuel gennemgang</div>
          <p className="text-sm text-amber-800 mt-1">
            Konfidens er under 70 %. Tjek alle felter omhyggeligt før godkendelse.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Panel title="Status">
          <Row label="Status"           value={<StatusBadge value={inv.status} />} />
          <Row label="Parse status"     value={inv.parse_status} />
          <Row label="Parse konfidens"  value={fmtPct(inv.parse_confidence)} />
          <Row label="Match konfidens"  value={fmtPct(inv.match_confidence)} />
          <Row label="Kræver review"    value={review ? 'JA' : 'nej'} />
          <Row label="Modtaget"         value={fmtDate(inv.created_at)} />
          {inv.posted_at && <Row label="Bogført" value={fmtDate(inv.posted_at)} />}
          {inv.external_invoice_id && <Row label="e-conomic ID" value={<code className="text-xs">{inv.external_invoice_id}</code>} />}
        </Panel>

        <Panel title="Parsede felter">
          <Row label="Leverandør (navn)"  value={inv.supplier_name_extracted ?? '—'} />
          <Row label="CVR/VAT"            value={inv.supplier_vat_number ?? '—'} />
          <Row label="Faktura nr"         value={<span className="font-mono">{inv.invoice_number ?? '—'}</span>} />
          <Row label="Faktura dato"       value={fmtDate(inv.invoice_date)} />
          <Row label="Forfald"            value={fmtDate(inv.due_date)} />
          <Row label="Beløb ekskl moms"   value={fmtAmount(inv.amount_excl_vat, inv.currency)} />
          <Row label="Moms"               value={fmtAmount(inv.vat_amount, inv.currency)} />
          <Row label="Beløb incl moms"    value={fmtAmount(inv.amount_incl_vat, inv.currency)} />
          <Row label="Betalingsreference" value={<span className="font-mono">{inv.payment_reference ?? '—'}</span>} />
          <Row label="IBAN"               value={<span className="font-mono">{inv.iban ?? '—'}</span>} />
        </Panel>

        <Panel title="Match resultat">
          <Row label="Leverandør"
            value={detail.supplier ? (
              <span>{detail.supplier.name} <span className="text-gray-400">({detail.supplier.code ?? '—'})</span></span>
            ) : <span className="text-amber-700">Ikke matchet</span>}
          />
          <Row label="Tilknyttet sag"
            value={detail.case ? (
              <Link
                href={`/dashboard/orders/${detail.case.case_number}`}
                className="text-emerald-700 hover:underline"
              >
                <span className="font-mono text-xs">{detail.case.case_number}</span>
                <span className="ml-2">{detail.case.project_name || detail.case.title}</span>
                {detail.case.customer_name && (
                  <span className="text-gray-500 ml-1">· {detail.case.customer_name}</span>
                )}
              </Link>
            ) : <span className="text-amber-700">Ikke matchet</span>}
          />
          <Row label="Arbejdsordre"
            value={detail.workOrder ? (
              detail.case ? (
                <Link
                  href={`/dashboard/orders/${detail.case.case_number}?tab=planlaegning`}
                  className="text-gray-700 hover:underline"
                >
                  {detail.workOrder.title}
                </Link>
              ) : (
                <span className="text-gray-700">{detail.workOrder.title}</span>
              )
            ) : <span className="text-gray-400">Ingen specifik WO</span>}
          />
          {inv.duplicate_of_id && (
            <Row label="Duplikat af"
              value={<Link href={`/dashboard/incoming-invoices/${inv.duplicate_of_id}`} className="text-red-700 hover:underline">{inv.duplicate_of_id}</Link>}
            />
          )}
        </Panel>
      </div>

      {breakdown && (
        <Panel title="Match-breakdown">
          <div className="space-y-1.5">
            {Object.entries(breakdown).map(([k, v]) => {
              if (k === 'reasons' || k === 'total') return null
              const score = Number(v) || 0
              return (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-44 text-gray-500">{SIGNAL_LABEL[k] ?? k}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                    <div className={`h-2 ${score > 0 ? 'bg-emerald-500' : 'bg-gray-200'}`} style={{ width: `${Math.min(100, score * 100)}%` }} />
                  </div>
                  <span className="w-12 text-right font-mono">{score.toFixed(2)}</span>
                </div>
              )
            })}
            <div className="flex items-center gap-2 text-xs pt-1 border-t">
              <span className="w-44 font-medium">Total</span>
              <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                <div className="h-2 bg-blue-500" style={{ width: `${Math.min(100, Number(breakdown.total ?? 0) * 100)}%` }} />
              </div>
              <span className="w-12 text-right font-mono font-medium">{Number(breakdown.total ?? 0).toFixed(2)}</span>
            </div>
            {Array.isArray(breakdown.reasons) && breakdown.reasons.length > 0 && (
              <div className="text-xs text-gray-500 mt-2">
                <span className="font-medium">Årsager:</span> {(breakdown.reasons as string[]).map((r) => (
                  <code key={r} className="ml-2 bg-gray-100 px-1 rounded">{r}</code>
                ))}
              </div>
            )}
          </div>
        </Panel>
      )}

      <Panel title={`Linjer (${detail.lines.length})`}>
        {detail.lines.length === 0 ? (
          <p className="text-xs text-gray-400">Ingen linjer ekstraheret.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-2 py-1">#</th>
                  <th className="px-2 py-1">Beskrivelse</th>
                  <th className="px-2 py-1 text-right">Antal</th>
                  <th className="px-2 py-1">Enhed</th>
                  <th className="px-2 py-1 text-right">Stk-pris</th>
                  <th className="px-2 py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-2 py-1">{l.line_number}</td>
                    <td className="px-2 py-1">{l.description ?? '—'}</td>
                    <td className="px-2 py-1 text-right">{l.quantity ?? '—'}</td>
                    <td className="px-2 py-1">{l.unit ?? '—'}</td>
                    <td className="px-2 py-1 text-right">{fmtAmount(l.unit_price, inv.currency)}</td>
                    <td className="px-2 py-1 text-right font-medium">{fmtAmount(l.total_price, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Fil">
        {inv.file_url ? (
          <div className="flex items-center gap-3 text-sm">
            <a href={inv.file_url} target="_blank" rel="noopener noreferrer"
              className="text-emerald-700 hover:underline">
              Hent {inv.file_name ?? 'fil'} ({inv.mime_type ?? 'ukendt'})
            </a>
            {inv.mime_type?.includes('pdf') && (
              <a href={inv.file_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-gray-500 hover:underline">[åbn i ny fane]</a>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400">Ingen fil tilknyttet (kilde: {inv.source}).</p>
        )}
      </Panel>

      <Panel title="Handlinger">
        {terminal ? (
          <p className="text-xs text-gray-500">
            Faktura er allerede {inv.status} — ingen yderligere handlinger.
          </p>
        ) : showReject ? (
          <div className="space-y-2">
            <textarea
              rows={3}
              className="w-full border rounded px-2 py-1.5 text-sm"
              placeholder="Begrundelse for afvisning…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowReject(false); setRejectReason('') }} disabled={busy}>Annullér</Button>
              <Button onClick={reject} disabled={busy || rejectReason.trim().length < 3}>Bekræft afvisning</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {review && (
              <label className="flex items-start gap-2 text-sm bg-amber-50 ring-1 ring-amber-200 p-3 rounded">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmReview}
                  onChange={(e) => setConfirmReview(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Jeg bekræfter</span> at jeg har gennemgået fakturaen
                  manuelt og at felterne er korrekte.
                </span>
              </label>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => approve(false)}
                disabled={busy || review}>
                Godkend
              </Button>
              {review && (
                <Button onClick={() => approve(true)}
                  disabled={busy || !confirmReview}>
                  Godkend med override
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowReject(true)} disabled={busy}>Afvis</Button>
              <Button variant="outline" onClick={reparse} disabled={busy}>Kør parse + match igen</Button>
            </div>
          </div>
        )}
      </Panel>

      <Panel title={`Audit log (${detail.audit.length})`}>
        {detail.audit.length === 0 ? (
          <p className="text-xs text-gray-400">Ingen log-poster.</p>
        ) : (
          <div className="space-y-2">
            {detail.audit.map((a) => (
              <div key={a.id} className={`text-xs rounded p-2 ring-1 ${
                a.ok ? 'bg-gray-50 ring-gray-200' : 'bg-red-50 ring-red-200'
              }`}>
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {a.action} {a.actor_name && <span className="text-gray-500">· {a.actor_name}</span>}
                  </span>
                  <span className="text-gray-500">{fmtDate(a.created_at)} {a.created_at.slice(11, 19)}</span>
                </div>
                {a.message && <div className="mt-0.5 text-gray-700">{a.message}</div>}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 py-1 text-sm border-b last:border-b-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right text-gray-900">{value}</span>
    </div>
  )
}

function StatusBadge({ value }: { value: string }) {
  const colour =
    value === 'approved'           ? 'bg-emerald-100 text-emerald-800'
    : value === 'posted'           ? 'bg-emerald-100 text-emerald-900'
    : value === 'rejected'         ? 'bg-red-100 text-red-800'
    : value === 'cancelled'        ? 'bg-gray-100 text-gray-700'
    : value === 'awaiting_approval' ? 'bg-blue-100 text-blue-800'
    : 'bg-gray-100 text-gray-700'
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colour}`}>{value}</span>
}
