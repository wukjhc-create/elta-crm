'use client'

/**
 * Sprint Ø2 ERP — medarbejderkort (READ-ONLY).
 *
 * Forsiden viser KUN overblik. Ingen inline-redigering: alle ændringer
 * (stamdata, login, satser, udstyr, certifikater) sker på Rediger
 * medarbejder-siden. Læse-sektioner er selv-hentende komponenter.
 */

import Link from 'next/link'
import {
  EMPLOYEE_ROLE_OPTIONS,
  EMPLOYMENT_TYPE_LABEL,
  type EmployeeWithCompensation,
} from '@/types/employees.types'
import {
  EmployeeProfileBadges,
  EmployeeLoginSummary,
  EmployeeOvertimeRatesView,
  EmployeeEquipmentView,
  EmployeeCertificatesView,
  EmployeeHistoryView,
} from '@/components/modules/employees/employee-profile-sections'

const fmtAmount = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 2 }).format(Number(n))
const fmtPct = (n: number | null | undefined) =>
  n == null ? '—' : `${Number(n).toLocaleString('da-DK', { maximumFractionDigits: 2 })} %`
const fmtDate = (s: string | null | undefined) => (s ? s.slice(0, 10) : '—')
const fmtDateLong = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('da-DK', { year: 'numeric', month: 'short', day: '2-digit' })
}

const ROLE_LABEL = new Map(EMPLOYEE_ROLE_OPTIONS.map((r) => [r.value, r.label]))

function initials(name: string, email: string) {
  const src = (name || email || '?').trim()
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

export function EmployeeDetailClient({
  employee,
  canSeePayroll = false,
  canEditEmployee = false,
  canManageLogin = false,
}: {
  employee: EmployeeWithCompensation
  canSeePayroll?: boolean
  canEditPayroll?: boolean
  canEditEmployee?: boolean
  canManageLogin?: boolean
}) {
  const roleLabel = ROLE_LABEL.get(employee.role as any) ?? employee.role
  const comp = employee.compensation
  const fullAddress = [employee.address, employee.postal_code, employee.city].filter(Boolean).join(', ')

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <nav className="text-sm text-gray-500 flex items-center gap-2">
        <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
        <span>/</span>
        <Link href="/dashboard/employees" className="hover:text-gray-700">Medarbejdere</Link>
        <span>/</span>
        <span className="text-gray-900">{employee.name || employee.email}</span>
      </nav>

      {/* Header (read-only) */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4 min-w-0">
            <div className="h-14 w-14 shrink-0 rounded-full bg-gray-900 text-white flex items-center justify-center text-lg font-semibold">
              {initials(employee.name, employee.email)}
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {employee.employee_number && <span className="font-mono">{employee.employee_number}</span>}
                <span>·</span>
                <span>{roleLabel}</span>
                {employee.employment_type && <><span>·</span><span>{EMPLOYMENT_TYPE_LABEL.get(employee.employment_type) ?? employee.employment_type}</span></>}
              </div>
              <h1 className="text-2xl font-semibold leading-tight">{employee.name || '—'}</h1>
              <p className="text-sm text-gray-500">
                {employee.email && <a href={`mailto:${employee.email}`} className="text-emerald-700 hover:underline">{employee.email}</a>}
                {employee.email && employee.phone && ' · '}
                {employee.phone && <a href={`tel:${employee.phone}`} className="text-emerald-700 hover:underline">{employee.phone}</a>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {employee.active ? (
              <span className="inline-block px-3 py-1 rounded text-xs font-medium bg-green-100 text-green-800">Aktiv</span>
            ) : (
              <span className="inline-block px-3 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">Inaktiv</span>
            )}
            {canEditEmployee && (
              <Link
                href={`/dashboard/employees/${employee.id}/edit`}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded hover:bg-gray-800"
              >
                Rediger medarbejder
              </Link>
            )}
          </div>
        </div>

        <EmployeeProfileBadges employeeId={employee.id} employeeActive={employee.active} />
      </div>

      {/* Overblik + Kontakt */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Overblik">
          <Row label="Fornavn" value={employee.first_name ?? '—'} />
          <Row label="Efternavn" value={employee.last_name ?? '—'} />
          <Row label="Medarbejdernr." value={employee.employee_number ?? '—'} />
          <Row label="Rolle" value={roleLabel} />
          <Row label="Ansættelsestype" value={employee.employment_type ? (EMPLOYMENT_TYPE_LABEL.get(employee.employment_type) ?? employee.employment_type) : '—'} />
          <Row label="Status" value={employee.active ? <span className="text-green-700">Aktiv</span> : <span className="text-gray-500">Inaktiv</span>} />
        </Panel>

        <Panel title="Kontakt og adresse">
          <Row label="E-mail" value={employee.email ? <a href={`mailto:${employee.email}`} className="text-emerald-700 hover:underline">{employee.email}</a> : '—'} />
          <Row label="Telefon" value={employee.phone ? <a href={`tel:${employee.phone}`} className="text-emerald-700 hover:underline">{employee.phone}</a> : '—'} />
          <Row label="Adresse" value={fullAddress || '—'} />
          <Row label="Ansat" value={fmtDate(employee.hire_date)} />
          <Row label="Fratrådt" value={fmtDate(employee.termination_date)} />
          <Row label="Oprettet" value={fmtDateLong(employee.created_at)} />
        </Panel>
      </div>

      {/* Login/adgang (read-only) */}
      {canManageLogin && <EmployeeLoginSummary employeeId={employee.id} />}

      {/* Økonomi/satser (read-only, payroll-gated) */}
      {canSeePayroll && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                <Row label="Kørselssats / km" value={fmtAmount(comp.mileage_rate)} />
                <Row label="Reel timekost (beregnet)" value={<strong className="text-gray-900">{fmtAmount(comp.real_hourly_cost)}</strong>} />
              </>
            ) : (
              <p className="text-sm text-gray-500 py-2">Ingen satser registreret. Sættes på Rediger medarbejder-siden.</p>
            )}
          </Panel>
          <EmployeeOvertimeRatesView employeeId={employee.id} />
        </div>
      )}
      {!canSeePayroll && (
        <Panel title="Satser og økonomi">
          <p className="text-sm text-gray-500 py-2 italic">Løn og satser er kun synlige for administrator-rollen.</p>
        </Panel>
      )}

      {/* Udstyr / Certifikater / Historik (read-only) */}
      <EmployeeEquipmentView employeeId={employee.id} />
      <EmployeeCertificatesView employeeId={employee.id} />
      <EmployeeHistoryView employeeId={employee.id} />

      {employee.notes && (
        <Panel title="Noter">
          <p className="text-sm whitespace-pre-wrap text-gray-800">{employee.notes}</p>
        </Panel>
      )}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div>{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm border-b last:border-b-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 text-right">{value}</span>
    </div>
  )
}
