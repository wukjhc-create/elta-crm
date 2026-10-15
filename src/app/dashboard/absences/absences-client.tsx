'use client'

/**
 * 00228 (Henrik 2026-10-15): fraværsoversigt — type + periode. Ingen fritekst (helbredsdetaljer gemmes ikke).
 */
import { useCallback, useEffect, useState } from 'react'
import { CalendarOff, Loader2, Plus, Trash2 } from 'lucide-react'
import { createAbsenceAction, deleteAbsenceAction, listAbsencesAction, type AbsenceWithEmployee } from '@/lib/actions/absences'
import { ABSENCE_KINDS, absenceLabel, absencePeriodText } from '@/lib/planning/absence'
import { useToast } from '@/components/ui/toast'

const dayKey = (offset = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(Date.now() + offset * 86_400_000))

export function AbsencesClient({ canManage, employees }: { canManage: boolean; employees: Array<{ id: string; name: string | null }> }) {
  const toast = useToast()
  const [rows, setRows] = useState<AbsenceWithEmployee[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [kind, setKind] = useState<string>('ferie')
  const [from, setFrom] = useState(dayKey())
  const [to, setTo] = useState(dayKey())

  const load = useCallback(async () => {
    const res = await listAbsencesAction(dayKey(-30), dayKey(365))
    if (res.success) { setRows(res.data ?? []); setError(null) } else setError(res.error ?? 'Kunne ikke hente fravær')
  }, [])
  useEffect(() => { void load() }, [load])

  const add = async () => {
    if (!employeeId) { toast.error('Vælg en medarbejder'); return }
    setBusy(true)
    try {
      const res = await createAbsenceAction({ employee_id: employeeId, kind, start_date: from, end_date: to })
      if (!res.success) { toast.error(res.error ?? 'Kunne ikke registrere fravær'); return }
      toast.success('Fravær registreret')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (r: AbsenceWithEmployee) => {
    if (!window.confirm(`Slet ${absenceLabel(r.kind).toLowerCase()} for ${r.employee_name ?? 'medarbejderen'} (${absencePeriodText(r)})?`)) return
    setBusy(true)
    try {
      const res = await deleteAbsenceAction(r.id)
      if (!res.success) { toast.error(res.error ?? 'Kunne ikke slette'); return }
      await load()
    } finally {
      setBusy(false)
    }
  }

  const today = dayKey()
  return (
    <div className="space-y-4" data-testid="absences-page">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><CalendarOff className="w-6 h-6 text-amber-600" /> Fravær</h1>
        <p className="text-sm text-gray-500 mt-1">Ferie, sygdom, kursus m.m. — kun type og periode. Vises i kalenderen og giver en advarsel ved planlægning.</p>
      </div>

      {canManage && (
        <div className="bg-white rounded-lg border p-4 grid grid-cols-1 sm:grid-cols-5 gap-2 items-end" data-testid="absence-form">
          <label className="text-xs text-gray-600 sm:col-span-2">
            Medarbejder
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-0.5 w-full border rounded px-2 py-1.5 text-sm" data-testid="absence-employee">
              <option value="">Vælg…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name ?? '—'}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="mt-0.5 w-full border rounded px-2 py-1.5 text-sm" data-testid="absence-kind">
              {ABSENCE_KINDS.map((k) => <option key={k} value={k}>{absenceLabel(k)}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            Fra
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value) }} className="mt-0.5 w-full border rounded px-2 py-1.5 text-sm" data-testid="absence-from" />
          </label>
          <label className="text-xs text-gray-600">
            Til
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-0.5 w-full border rounded px-2 py-1.5 text-sm" data-testid="absence-to" />
          </label>
          <div className="sm:col-span-5 flex justify-end">
            <button type="button" onClick={add} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60" data-testid="absence-add">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Registrér fravær
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border">
        {error ? (
          <p className="p-4 text-sm text-red-600">{error}</p>
        ) : rows == null ? (
          <p className="p-4 text-sm text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Henter…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">Intet registreret fravær.</p>
        ) : (
          <ul className="divide-y" data-testid="absence-list">
            {rows.map((r) => {
              const now = r.start_date <= today && r.end_date >= today
              return (
                <li key={r.id} className="px-4 py-2.5 flex items-center gap-3 text-sm" data-testid="absence-row">
                  <span className="font-medium text-gray-900 min-w-0 truncate">{r.employee_name ?? '—'}</span>
                  <span className="text-xs rounded bg-amber-50 text-amber-800 px-1.5 py-0.5">{absenceLabel(r.kind)}</span>
                  <span className="text-gray-600">{absencePeriodText(r)}</span>
                  {now && <span className="text-[10px] uppercase tracking-wide text-emerald-700">nu</span>}
                  {canManage && (
                    <button type="button" onClick={() => remove(r)} disabled={busy} className="ml-auto p-1.5 text-gray-400 hover:text-red-600" aria-label="Slet fravær">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
