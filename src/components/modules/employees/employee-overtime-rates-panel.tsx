'use client'

/**
 * Sprint Ø2.6 — overtidssatser på medarbejderkortet.
 *
 * Liste + administration af employee_overtime_rates: seed af standard-satser,
 * inline redigering (multiplikator/kost/salg), aktiv/inaktiv, samt opret ny.
 * Read kræver payroll.view; redigering kræver payroll.edit (canEdit).
 *
 * NB: satserne påvirker IKKE time_logs' beregning endnu (vises tydeligt).
 */

import { useState, useEffect, useCallback, useTransition } from 'react'
import { Clock, Plus, Check, Power } from 'lucide-react'
import {
  listEmployeeOvertimeRates,
  ensureDefaultOvertimeRates,
  createOvertimeRate,
  updateOvertimeRate,
  setOvertimeRateActive,
} from '@/lib/actions/employee-overtime-rates'
import type { EmployeeOvertimeRate } from '@/types/employees.types'

const fmt = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 2 }).format(n)

export function EmployeeOvertimeRatesPanel({
  employeeId,
  canEdit,
}: {
  employeeId: string
  canEdit: boolean
}) {
  const [rates, setRates] = useState<EmployeeOvertimeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [seeded, setSeeded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Ny sats-form
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMult, setNewMult] = useState('1.5')
  const [newCost, setNewCost] = useState('')
  const [newSale, setNewSale] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listEmployeeOvertimeRates(employeeId)
    if (res.success && res.data) setRates(res.data)
    else setError(res.error ?? 'Kunne ikke hente satser')
    setLoading(false)
    return res.success && res.data ? res.data : []
  }, [employeeId])

  useEffect(() => {
    ;(async () => {
      const data = await load()
      // Seed standard-satser ved første åbning (kun hvis tom + redigeringsret).
      if (data.length === 0 && canEdit && !seeded) {
        setSeeded(true)
        const r = await ensureDefaultOvertimeRates(employeeId)
        if (r.success && r.data) setRates(r.data)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId])

  const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) setError(res.error ?? 'Handlingen fejlede')
      await load()
    })
  }

  const addRate = () => {
    const mult = parseFloat(newMult.replace(',', '.'))
    if (!newName.trim() || !Number.isFinite(mult)) {
      setError('Udfyld satsnavn og en gyldig multiplikator')
      return
    }
    if (mult < 0 || mult > 10) {
      setError('Multiplikator skal være mellem 0 og 10')
      return
    }
    // Ø2.12B — bekræft usædvanligt høje kost-/salgssatser (taste-fejl).
    const cN = newCost ? parseFloat(newCost.replace(',', '.')) : null
    const sN = newSale ? parseFloat(newSale.replace(',', '.')) : null
    if (((cN ?? 0) > 5000 || (sN ?? 0) > 5000) &&
        !window.confirm('Kost-/salgssats over 5000 kr/t er usædvanligt højt. Gem alligevel?')) {
      return
    }
    run(async () => {
      const res = await createOvertimeRate(employeeId, {
        name: newName.trim(),
        multiplier: mult,
        cost_rate: newCost ? parseFloat(newCost.replace(',', '.')) : null,
        sale_rate: newSale ? parseFloat(newSale.replace(',', '.')) : null,
      })
      if (res.success) {
        setNewName(''); setNewMult('1.5'); setNewCost(''); setNewSale(''); setShowAdd(false)
      }
      return res
    })
  }

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold">Overtidssatser</h3>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAdd((s) => !s)}
            disabled={pending}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-gray-50"
          >
            <Plus className="w-3.5 h-3.5" /> Ny sats
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-600 bg-gray-50 ring-1 ring-gray-200 rounded px-2 py-1 mb-3">
        Satserne bruges af timeøkonomien, når der oprettes eller ændres timeregistreringer.
        Historiske timer ændres ikke automatisk.
      </p>

      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded p-2">{error}</div>}

      {showAdd && canEdit && (
        <div className="mb-3 grid grid-cols-2 sm:grid-cols-5 gap-2 items-end bg-gray-50 rounded p-2">
          <LabeledInput label="Navn" value={newName} onChange={setNewName} placeholder="fx Nat" />
          <LabeledInput label="Multiplikator" value={newMult} onChange={setNewMult} placeholder="1.5" />
          <LabeledInput label="Kostpris" value={newCost} onChange={setNewCost} placeholder="kr/t" />
          <LabeledInput label="Salgspris" value={newSale} onChange={setNewSale} placeholder="kr/t" />
          <button
            onClick={addRate}
            disabled={pending}
            className="h-9 inline-flex items-center justify-center gap-1 text-sm px-3 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> Tilføj
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Henter…</p>
      ) : rates.length === 0 ? (
        <p className="text-sm text-gray-500 py-2">
          Ingen satser endnu.{canEdit ? ' Standard-satser oprettes automatisk.' : ''}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-left border-b">
                <th className="py-1.5 pr-2 font-medium">Sats</th>
                <th className="py-1.5 px-2 font-medium text-right">Multiplikator</th>
                <th className="py-1.5 px-2 font-medium text-right">Kostpris</th>
                <th className="py-1.5 px-2 font-medium text-right">Salgspris</th>
                <th className="py-1.5 px-2 font-medium text-center">Aktiv</th>
                {canEdit && <th className="py-1.5 pl-2" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rates.map((rate) => (
                <RateRow key={rate.id} rate={rate} canEdit={canEdit} pending={pending} onRun={run} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  function RateRow({
    rate,
    canEdit,
    pending,
    onRun,
  }: {
    rate: EmployeeOvertimeRate
    canEdit: boolean
    pending: boolean
    onRun: (fn: () => Promise<{ success: boolean; error?: string }>) => void
  }) {
    const [mult, setMult] = useState(String(rate.multiplier))
    const [cost, setCost] = useState(rate.cost_rate == null ? '' : String(rate.cost_rate))
    const [sale, setSale] = useState(rate.sale_rate == null ? '' : String(rate.sale_rate))
    const dirty =
      mult !== String(rate.multiplier) ||
      cost !== (rate.cost_rate == null ? '' : String(rate.cost_rate)) ||
      sale !== (rate.sale_rate == null ? '' : String(rate.sale_rate))

    if (!canEdit) {
      return (
        <tr className={rate.is_active ? '' : 'opacity-50'}>
          <td className="py-1.5 pr-2 font-medium">{rate.name}</td>
          <td className="py-1.5 px-2 text-right tabular-nums">{rate.multiplier}×</td>
          <td className="py-1.5 px-2 text-right tabular-nums">{fmt(rate.cost_rate)}</td>
          <td className="py-1.5 px-2 text-right tabular-nums">{fmt(rate.sale_rate)}</td>
          <td className="py-1.5 px-2 text-center">{rate.is_active ? 'Ja' : 'Nej'}</td>
        </tr>
      )
    }

    return (
      <tr className={rate.is_active ? '' : 'opacity-60'}>
        <td className="py-1.5 pr-2 font-medium">{rate.name}</td>
        <td className="py-1.5 px-2">
          <input value={mult} onChange={(e) => setMult(e.target.value)} className="w-16 text-right border rounded px-1 py-0.5" />
        </td>
        <td className="py-1.5 px-2">
          <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="—" className="w-20 text-right border rounded px-1 py-0.5" />
        </td>
        <td className="py-1.5 px-2">
          <input value={sale} onChange={(e) => setSale(e.target.value)} placeholder="—" className="w-20 text-right border rounded px-1 py-0.5" />
        </td>
        <td className="py-1.5 px-2 text-center">
          <button
            onClick={() => onRun(() => setOvertimeRateActive(rate.id, !rate.is_active))}
            disabled={pending}
            title={rate.is_active ? 'Deaktivér' : 'Aktivér'}
            className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${
              rate.is_active ? 'text-emerald-700 border-emerald-200' : 'text-gray-500 border-gray-200'
            }`}
          >
            <Power className="w-3.5 h-3.5" /> {rate.is_active ? 'Aktiv' : 'Inaktiv'}
          </button>
        </td>
        <td className="py-1.5 pl-2 text-right">
          <button
            onClick={() =>
              onRun(() =>
                updateOvertimeRate(rate.id, {
                  multiplier: parseFloat(mult.replace(',', '.')),
                  cost_rate: cost ? parseFloat(cost.replace(',', '.')) : null,
                  sale_rate: sale ? parseFloat(sale.replace(',', '.')) : null,
                })
              )
            }
            disabled={pending || !dirty}
            className="text-xs px-2 py-0.5 rounded bg-gray-900 text-white disabled:opacity-30"
          >
            Gem
          </button>
        </td>
      </tr>
    )
  }
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 border rounded px-2 text-sm"
      />
    </label>
  )
}
