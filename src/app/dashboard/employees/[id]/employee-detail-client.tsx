'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  EMPLOYEE_ROLE_OPTIONS,
  type EmployeeWithCompensation,
} from '@/types/employees.types'
import { setEmployeeActiveAction } from '@/lib/actions/employees'

const fmtAmount = (n: number | null | undefined) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('da-DK', {
        style: 'currency',
        currency: 'DKK',
        maximumFractionDigits: 2,
      }).format(Number(n))

const fmtPct = (n: number | null | undefined) =>
  n == null ? '—' : `${Number(n).toLocaleString('da-DK', { maximumFractionDigits: 2 })} %`

const fmtDate = (s: string | null | undefined) => (s ? s.slice(0, 10) : '—')

const fmtDateLong = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('da-DK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

const ROLE_LABEL = new Map(EMPLOYEE_ROLE_OPTIONS.map((r) => [r.value, r.label]))

export function EmployeeDetailClient({
  employee,
}: {
  employee: EmployeeWithCompensation
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const onToggleActive = async () => {
    const next = !employee.active
    if (
      !next &&
      !window.confirm(
        'Deaktivér medarbejderen? Eksisterende sager og work_orders påvirkes ikke, men medarbejderen kan ikke længere planlægges på nye opgaver.'
      )
    )
      return

    setError(null)
    setInfo(null)
    setIsWorking(true)
    const res = await setEmployeeActiveAction(employee.id, next)
    setIsWorking(false)
    if (!res.ok) {
      setError(res.message)
      return
    }
    setInfo(res.message)
    startTransition(() => router.refresh())
  }

  const fullAddress = [employee.address, employee.postal_code, employee.city]
    .filter(Boolean)
    .join(', ')

  const roleLabel = ROLE_LABEL.get(employee.role as any) ?? employee.role
  const comp = employee.compensation

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <nav className="text-sm text-gray-500 flex items-center gap-2">
        <Link href="/dashboard" className="hover:text-gray-700">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/dashboard/employees" className="hover:text-gray-700">
          Medarbejdere
        </Link>
        <span>/</span>
        <span className="text-gray-900">{employee.name || employee.email}</span>
      </nav>

      {error && (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2 text-sm text-emerald-900">
          {info}
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {employee.employee_number && (
                <span className="font-mono">{employee.employee_number}</span>
              )}
              <span>·</span>
              <span>{roleLabel}</span>
            </div>
            <h1 className="text-2xl font-semibold leading-tight">
              {employee.name || '—'}
            </h1>
            <p className="text-sm text-gray-500">
              {employee.email && (
                <a href={`mailto:${employee.email}`} className="text-emerald-700 hover:underline">
                  {employee.email}
                </a>
              )}
              {employee.email && employee.phone && ' · '}
              {employee.phone && (
                <a href={`tel:${employee.phone}`} className="text-emerald-700 hover:underline">
                  {employee.phone}
                </a>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {employee.active ? (
              <span className="inline-block px-3 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                Aktiv
              </span>
            ) : (
              <span className="inline-block px-3 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">
                Inaktiv
              </span>
            )}
            <button
              type="button"
              onClick={onToggleActive}
              disabled={isWorking}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {isWorking ? 'Gemmer…' : employee.active ? 'Deaktivér' : 'Aktivér'}
            </button>
            <Link
              href={`/dashboard/employees/${employee.id}/edit`}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50"
            >
              Rediger
            </Link>
          </div>
        </div>

        {/* Quick info row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t text-sm">
          <Stat label="Ansat" value={fmtDateLong(employee.hire_date)} />
          <Stat
            label="Fratrådt"
            value={employee.termination_date ? fmtDateLong(employee.termination_date) : '—'}
          />
          <Stat label="Intern kost / time" value={fmtAmount(employee.cost_rate)} />
          <Stat label="Salgspris / time" value={fmtAmount(employee.hourly_rate)} />
        </div>
      </div>

      {/* Two-column main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Stamdata */}
        <Panel title="Stamdata">
          <Row label="Fornavn" value={employee.first_name ?? '—'} />
          <Row label="Efternavn" value={employee.last_name ?? '—'} />
          <Row label="Medarbejdernr." value={employee.employee_number ?? '—'} />
          <Row label="Rolle" value={roleLabel} />
          <Row
            label="Status"
            value={
              employee.active ? (
                <span className="text-green-700">Aktiv</span>
              ) : (
                <span className="text-gray-500">Inaktiv</span>
              )
            }
          />
        </Panel>

        {/* Kontakt */}
        <Panel title="Kontakt og adresse">
          <Row
            label="E-mail"
            value={
              employee.email ? (
                <a href={`mailto:${employee.email}`} className="text-emerald-700 hover:underline">
                  {employee.email}
                </a>
              ) : (
                '—'
              )
            }
          />
          <Row
            label="Telefon"
            value={
              employee.phone ? (
                <a href={`tel:${employee.phone}`} className="text-emerald-700 hover:underline">
                  {employee.phone}
                </a>
              ) : (
                '—'
              )
            }
          />
          <Row label="Adresse" value={fullAddress || '—'} />
        </Panel>

        {/* Ansættelse */}
        <Panel title="Ansættelse">
          <Row label="Ansættelsesdato" value={fmtDate(employee.hire_date)} />
          <Row label="Fratrædelsesdato" value={fmtDate(employee.termination_date)} />
          <Row label="Oprettet" value={fmtDateLong(employee.created_at)} />
          <Row label="Sidst opdateret" value={fmtDateLong(employee.updated_at)} />
        </Panel>

        {/* Satser/økonomi */}
        <Panel title="Satser og økonomi">
          {comp ? (
            <>
              <Row label="Timeløn" value={fmtAmount(comp.hourly_wage)} />
              <Row label="Intern kostpris / time" value={fmtAmount(comp.internal_cost_rate)} />
              <Row label="Salgspris / time" value={fmtAmount(comp.sales_rate)} />
              <Row label="Pension" value={fmtPct(comp.pension_pct)} />
              <Row label="Fritvalg" value={fmtPct(comp.free_choice_pct)} />
              <Row label="Feriepenge" value={fmtPct(comp.vacation_pct)} />
              <Row label="SH" value={fmtPct(comp.sh_pct)} />
              <Row label="Overhead" value={fmtPct(comp.overhead_pct)} />
              <Row label="Sociale omkostninger" value={fmtAmount(comp.social_costs)} />
              <Row label="Overtidssats" value={fmtAmount(comp.overtime_rate)} />
              <Row label="Kørselssats / km" value={fmtAmount(comp.mileage_rate)} />
              <Row
                label="Reel timekost (beregnet)"
                value={
                  <strong className="text-gray-900">
                    {fmtAmount(comp.real_hourly_cost)}
                  </strong>
                }
              />
            </>
          ) : (
            <p className="text-sm text-gray-500 py-2">
              Ingen satser registreret endnu. Brug "Rediger" for at sætte timeløn,
              intern kostpris og salgspris — så kan medarbejderen indgå i sagøkonomi.
            </p>
          )}
        </Panel>

        {/* Noter */}
        {employee.notes && (
          <Panel title="Noter" full>
            <p className="text-sm whitespace-pre-wrap text-gray-800">{employee.notes}</p>
          </Panel>
        )}

        {/* Future placeholders */}
        <Panel title="Planlagt arbejde" full>
          <FutureNote
            label="Planlagte work_orders"
            sprint="Sprint 4D"
            body="Liste over kommende arbejdsordrer hvor denne medarbejder er tildelt — sorteret efter scheduled_date. Linker til den enkelte sag."
          />
        </Panel>

        <Panel title="Timer og sager">
          <FutureNote
            label="Registrerede timer"
            sprint="Sprint 4C"
            body="Liste over time_logs grupperet pr. sag og uge — med total timer og kost. Inklusive aktiv timer hvis nogen."
          />
        </Panel>

        <Panel title="Fravær">
          <FutureNote
            label="Ferie og sygdom"
            sprint="Sprint 4F"
            body="Registrerede fraværsdage — kobles senere til løn/payroll-eksport."
          />
        </Panel>
      </div>
    </div>
  )
}

function Panel({
  title,
  children,
  full,
}: {
  title: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <div className={`bg-gray-50 rounded ring-1 ring-gray-200 p-4 ${full ? 'lg:col-span-2' : ''}`}>
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm border-b border-gray-100 last:border-b-0">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span
        className="text-right text-gray-900 max-w-[65%] truncate"
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-900 truncate">{value}</div>
    </div>
  )
}

function FutureNote({
  label,
  sprint,
  body,
}: {
  label: string
  sprint: string
  body: string
}) {
  return (
    <div className="text-center py-6">
      <h4 className="text-sm font-medium text-gray-700">{label}</h4>
      <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">{body}</p>
      <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-wide">{sprint}</p>
    </div>
  )
}
