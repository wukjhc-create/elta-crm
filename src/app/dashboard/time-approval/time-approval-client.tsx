'use client'

/**
 * N2 — "Godkend timer" (serviceleder/admin). Ventende registreringer grupperet pr. medarbejder; godkend enkeltvis
 * eller alle for en medarbejder; afvis med begrundelse. Ingen løn-/faktureringseffekt (endnu).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, X, Loader2, AlertCircle, Clock } from 'lucide-react'
import {
  listTimeLogsForApprovalAction,
  approveTimeLogsAction,
  rejectTimeLogAction,
  type ApprovalTimeLog,
  type TimeApprovalStatus,
} from '@/lib/actions/time-approval'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

const TABS: Array<{ key: TimeApprovalStatus; label: string }> = [
  { key: 'pending', label: 'Afventer' },
  { key: 'rejected', label: 'Afvist' },
  { key: 'approved', label: 'Godkendt' },
]

function fmtHours(h: number | null): string {
  return h === null ? '—' : new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(h)
}

function when(l: ApprovalTimeLog): string {
  const s = copenhagenParts(l.start_time)
  const e = l.end_time ? copenhagenParts(l.end_time).clock : 'i gang'
  const d = new Date(`${s.date}T12:00:00Z`).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${d} ${s.clock}–${e}`
}

export function TimeApprovalClient() {
  const [tab, setTab] = useState<TimeApprovalStatus>('pending')
  const [rows, setRows] = useState<ApprovalTimeLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const r = await listTimeLogsForApprovalAction(tab)
    if (!r.success) { setError(r.error ?? 'Kunne ikke hente timer'); setRows([]); return }
    setRows(r.data ?? [])
  }, [tab])

  useEffect(() => { setRows(null); load() }, [load])

  const groups = useMemo(() => {
    const m = new Map<string, { name: string; logs: ApprovalTimeLog[]; total: number }>()
    for (const l of rows ?? []) {
      const g = m.get(l.employee_id) ?? { name: l.employee_name ?? 'Ukendt medarbejder', logs: [], total: 0 }
      g.logs.push(l)
      g.total += l.hours ?? 0
      m.set(l.employee_id, g)
    }
    return [...m.entries()]
  }, [rows])

  const approve = async (ids: string[], key: string) => {
    setBusy(key); setMsg(null); setError(null)
    const r = await approveTimeLogsAction(ids)
    setBusy(null)
    if (!r.success) { setError(r.error ?? 'Kunne ikke godkende'); return }
    setMsg(`${r.data?.updated ?? 0} registrering(er) godkendt${r.data?.skipped ? ` · ${r.data.skipped} sprunget over (egne/igangværende)` : ''}`)
    await load()
  }

  const reject = async () => {
    if (!rejecting) return
    setBusy(rejecting.id); setMsg(null); setError(null)
    const r = await rejectTimeLogAction(rejecting.id, rejecting.reason)
    setBusy(null)
    if (!r.success) { setError(r.error ?? 'Kunne ikke afvise'); return }
    setRejecting(null)
    setMsg('Registreringen er afvist — montøren kan rette den, hvorefter den skal godkendes igen')
    await load()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Godkend timer</h1>
        <p className="text-sm text-gray-600 mt-1">
          Montørernes registrerede timer. Godkendelse påvirker endnu ikke løn eller fakturering.
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${tab === t.key ? 'border-emerald-600 text-emerald-700 font-medium' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
            data-testid={`time-approval-tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
      {msg && <div className="rounded-md bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2 text-sm text-emerald-900" data-testid="time-approval-msg">{msg}</div>}

      {rows === null && (
        <div className="py-10 text-center text-sm text-gray-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Henter timer…</div>
      )}
      {rows !== null && rows.length === 0 && !error && (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 py-10 text-center text-sm text-gray-500">
          <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          {tab === 'pending' ? 'Ingen timer afventer godkendelse' : 'Ingen registreringer'}
        </div>
      )}

      {groups.map(([empId, g]) => {
        const approvable = g.logs.filter((l) => !l.is_own && l.end_time && l.approval_status !== 'approved').map((l) => l.id)
        return (
          <div key={empId} className="bg-white rounded-lg ring-1 ring-gray-200" data-testid="time-approval-group">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50 rounded-t-lg">
              <div className="font-medium text-gray-900">
                {g.name} <span className="text-sm text-gray-500 font-normal">· {g.logs.length} registrering(er) · {fmtHours(Math.round(g.total * 100) / 100)} t</span>
              </div>
              {tab !== 'approved' && approvable.length > 1 && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => approve(approvable, empId)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  data-testid="time-approval-approve-all"
                >
                  {busy === empId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Godkend alle ({approvable.length})
                </button>
              )}
            </div>
            <ul className="divide-y">
              {g.logs.map((l) => (
                <li key={l.id} className="px-4 py-2 flex items-start gap-3 text-sm" data-testid="time-approval-row">
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-900">
                      {when(l)} · <span className="font-medium tabular-nums">{fmtHours(l.hours)} t</span>
                      {!l.billable && <span className="ml-2 text-[10px] uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Ikke fakturerbar</span>}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {l.case_id ? (
                        <Link href={`/dashboard/orders/${l.case_id}`} className="text-emerald-700 hover:underline">{l.case_number ?? 'Sag'}</Link>
                      ) : '—'}
                      {l.case_title ? ` · ${l.case_title}` : ''}{l.work_order_title ? ` · ${l.work_order_title}` : ''}
                      {l.description ? ` · ${l.description}` : ''}
                    </div>
                    {l.approval_status === 'rejected' && l.rejection_reason && (
                      <div className="text-xs text-red-700 mt-0.5">Afvist: {l.rejection_reason}</div>
                    )}
                    {l.approval_status === 'approved' && (
                      <div className="text-xs text-gray-500 mt-0.5">Godkendt{l.approved_by_name ? ` af ${l.approved_by_name}` : ''}</div>
                    )}
                    {rejecting?.id === l.id && (
                      <div className="mt-2 flex gap-2">
                        <input
                          autoFocus
                          value={rejecting.reason}
                          onChange={(e) => setRejecting({ id: l.id, reason: e.target.value })}
                          placeholder="Begrundelse til montøren (fx forkert sag, tid passer ikke)"
                          maxLength={500}
                          className="flex-1 border rounded px-2 py-1 text-sm"
                          data-testid="time-approval-reason"
                        />
                        <button type="button" onClick={reject} disabled={busy !== null} className="px-2.5 py-1 text-xs rounded bg-red-600 text-white disabled:opacity-50" data-testid="time-approval-reject-confirm">Afvis</button>
                        <button type="button" onClick={() => setRejecting(null)} className="px-2.5 py-1 text-xs rounded border">Annuller</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {l.is_own ? (
                      <span className="text-[11px] text-gray-500" title="Egne timer godkendes af en anden">Egne timer</span>
                    ) : !l.end_time ? (
                      <span className="text-[11px] text-gray-500">Timer kører</span>
                    ) : (
                      <>
                        {l.approval_status !== 'approved' && (
                          <button type="button" disabled={busy !== null} onClick={() => approve([l.id], l.id)} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-700 disabled:opacity-40" aria-label="Godkend" data-testid="time-approval-approve">
                            {busy === l.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          </button>
                        )}
                        {l.approval_status !== 'rejected' && (
                          <button type="button" disabled={busy !== null} onClick={() => setRejecting({ id: l.id, reason: '' })} className="p-1.5 rounded hover:bg-red-50 text-red-600 disabled:opacity-40" aria-label="Afvis" data-testid="time-approval-reject">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
