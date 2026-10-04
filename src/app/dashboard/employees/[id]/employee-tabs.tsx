'use client'

/**
 * Medarbejder-faner (privacy / shoulder-surfing, Henrik 2026-10-03). Følsomme data står ikke på overblikket:
 *   - "Økonomi & løn" findes kun for employees.payroll.view og HENTER først data når fanen åbnes; beløb er maskeret
 *     indtil "Vis beløb", maskeres igen når vinduet skjules, og data glemmes når fanen forlades (komponenten afmonteres).
 *   - "Job / Timer" viser timer og job — ingen beløb.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { getEmployeeCompensationAction, getEmployeeWorkSummaryAction } from '@/lib/actions/employees'
import { EmployeeOvertimeRatesView } from '@/components/modules/employees/employee-profile-sections'
import { SensitiveRevealProvider, Sensitive } from '@/components/shared/sensitive-amounts'
import type { EmployeeWithCompensation } from '@/types/employees.types'

export type EmployeeTab = 'overblik' | 'job' | 'dokumenter' | 'oekonomi' | 'login'

export function useEmployeeTab(available: EmployeeTab[]): [EmployeeTab, (t: EmployeeTab) => void] {
  const router = useRouter()
  const sp = useSearchParams()
  const raw = sp.get('tab') as EmployeeTab | null
  const tab = raw && available.includes(raw) ? raw : 'overblik'
  const set = (t: EmployeeTab) => {
    const q = new URLSearchParams(sp.toString())
    if (t === 'overblik') q.delete('tab'); else q.set('tab', t)
    router.replace(`?${q.toString()}`, { scroll: false })
  }
  return [tab, set]
}

const LABELS: Record<EmployeeTab, string> = {
  overblik: 'Overblik', job: 'Job / Timer', dokumenter: 'Dokumenter', oekonomi: 'Økonomi & løn', login: 'Login / Rettigheder',
}

export function EmployeeTabBar({ tabs, active, onSelect }: { tabs: EmployeeTab[]; active: EmployeeTab; onSelect: (t: EmployeeTab) => void }) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-x-auto">
      <div className="flex border-b min-w-max" role="tablist">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active === t}
            onClick={() => onSelect(t)}
            className={`px-4 py-2.5 text-sm -mb-px border-b-2 ${active === t ? 'border-emerald-600 text-emerald-700 font-medium' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
            data-testid={`employee-tab-${t}`}
          >
            {LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  )
}

const dkk = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`)
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString('da-DK', { maximumFractionDigits: 2 })} %`)

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm border-b last:border-b-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 text-right tabular-nums">{value}</span>
    </div>
  )
}

/** Hentes FØRST når fanen åbnes; data forsvinder når fanen forlades (afmontering). */
export function EmployeeEconomyTab({ employeeId }: { employeeId: string }) {
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: { hourly_rate: number | null; cost_rate: number | null; compensation: EmployeeWithCompensation['compensation'] } }>({ loading: true })
  useEffect(() => {
    let alive = true
    getEmployeeCompensationAction(employeeId).then((r) => {
      if (!alive) return
      setState(r.ok ? { loading: false, data: r.data } : { loading: false, error: r.message })
    })
    return () => { alive = false; setState({ loading: true }) }
  }, [employeeId])

  if (state.loading) return <div className="bg-white rounded-lg ring-1 ring-gray-200 p-6 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Henter…</div>
  if (state.error) return <div className="bg-white rounded-lg ring-1 ring-gray-200 p-6 text-sm text-red-700">{state.error}</div>
  const comp = state.data?.compensation
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" data-testid="employee-economy">
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
        <h3 className="text-sm font-semibold mb-2">Satser og løn</h3>
        <SensitiveRevealProvider>
          {comp ? (
            <>
              <Row label="Timeløn" value={<Sensitive>{dkk(comp.hourly_wage)}</Sensitive>} />
              <Row label="Intern kostpris / time" value={<Sensitive>{dkk(comp.internal_cost_rate)}</Sensitive>} />
              <Row label="Salgspris / time" value={<Sensitive>{dkk(comp.sales_rate)}</Sensitive>} />
              <Row label="Pension" value={<Sensitive>{pct(comp.pension_pct)}</Sensitive>} />
              <Row label="Fritvalg" value={<Sensitive>{pct(comp.free_choice_pct)}</Sensitive>} />
              <Row label="Feriepenge" value={<Sensitive>{pct(comp.vacation_pct)}</Sensitive>} />
              <Row label="SH" value={<Sensitive>{pct(comp.sh_pct)}</Sensitive>} />
              <Row label="Overhead" value={<Sensitive>{pct(comp.overhead_pct)}</Sensitive>} />
              <Row label="Sociale omkostninger" value={<Sensitive>{dkk(comp.social_costs)}</Sensitive>} />
              <Row label="Kørselssats / km" value={<Sensitive>{dkk(comp.mileage_rate)}</Sensitive>} />
              <Row label="Reel timekost (beregnet)" value={<Sensitive><strong>{dkk(comp.real_hourly_cost)}</strong></Sensitive>} />
            </>
          ) : (
            <>
              <Row label="Timesats (salg)" value={<Sensitive>{dkk(state.data?.hourly_rate)}</Sensitive>} />
              <Row label="Kostsats" value={<Sensitive>{dkk(state.data?.cost_rate)}</Sensitive>} />
              <p className="text-sm text-gray-500 py-2">Ingen løndetaljer registreret. Sættes på Rediger medarbejder-siden.</p>
            </>
          )}
        </SensitiveRevealProvider>
      </div>
      <EmployeeOvertimeRatesView employeeId={employeeId} />
    </div>
  )
}

const WO_STATUS: Record<string, string> = { planned: 'Planlagt', in_progress: 'I gang', done: 'Udført', cancelled: 'Annulleret' }

export function EmployeeJobTab({ employeeId }: { employeeId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getEmployeeWorkSummaryAction>> | null>(null)
  useEffect(() => { getEmployeeWorkSummaryAction(employeeId).then(setData) }, [employeeId])
  if (!data) return <div className="bg-white rounded-lg ring-1 ring-gray-200 p-6 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Henter…</div>
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" data-testid="employee-jobs">
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
        <h3 className="text-sm font-semibold mb-2">Timer seneste 30 dage</h3>
        <Row label="Registreret" value={`${data.hours30.toLocaleString('da-DK')} t`} />
        <Row label="Heraf fakturerbare" value={`${data.billable30.toLocaleString('da-DK')} t`} />
      </div>
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4 lg:col-span-2">
        <h3 className="text-sm font-semibold mb-2">Job</h3>
        {data.jobs.length === 0 ? <p className="text-sm text-gray-500">Ingen job tildelt.</p> : (
          <ul className="divide-y text-sm">
            {data.jobs.map((j) => (
              <li key={j.id} className="py-1.5 flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24 shrink-0">{j.scheduled_date ?? '—'}</span>
                <span className="truncate flex-1">{j.title ?? 'Job'}</span>
                {j.case_id && <Link href={`/dashboard/orders/${j.case_id}`} className="text-xs text-emerald-700 hover:underline">{j.case_number ?? 'Sag'}</Link>}
                <span className="text-xs text-gray-500">{WO_STATUS[j.status] ?? j.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
