'use client'

/**
 * Sprint Ø1.3 commit 3 — presentational UI for medarbejderøkonomi.
 *
 * Ren visning af getEmployeeEconomyAction-output: 5 nøgletalskort + tabel.
 * Read-only — ingen filtre/charts/eksport endnu. Sortering kommer fra
 * servicen (db_amount desc). Advarselsbanner når snapshots mangler.
 */

import { AlertTriangle } from 'lucide-react'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils/format'
import type { ActionResult } from '@/types/common.types'
import type { EmployeeEconomyView } from '@/lib/actions/employee-economy'
import { CostRevealToggle, useCostReveal } from '@/components/shared/sensitive-amounts'

export function EmployeeEconomyClient({
  result,
}: {
  result: ActionResult<EmployeeEconomyView>
}) {
  // PV8: kost/DB sammenfoldet som standard (shoulder-surfing); D50b: pr. medarbejder kun med løn-adgang
  const [costOpen, toggleCost] = useCostReveal()
  if (!result.success || !result.data) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="bg-white rounded-lg ring-1 ring-red-200 p-4 text-sm text-red-700">
          Kunne ikke hente medarbejderøkonomi: {result.error ?? 'Ukendt fejl'}
        </div>
      </div>
    )
  }

  const { employees, missing_snapshot_count, totals, per_employee_cost } = result.data
  const totalHours = totals.hours
  const totalSale = totals.labor_sale
  const totalCost = totals.labor_cost
  const totalDb = totals.db_amount
  const totalDbPct = totals.db_percentage
  const showRowCost = per_employee_cost && costOpen

  return (
    <div className="space-y-6">
      <Header />

      {missing_snapshot_count > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 ring-1 ring-amber-200 rounded-lg p-3 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
          <span>
            <strong>{missing_snapshot_count}</strong> lukkede timeregistrering
            {missing_snapshot_count > 1 ? 'er' : ''} mangler frosne snapshot-beløb og
            tæller som <strong>0 kr.</strong> i tallene nedenfor. Kør backfill for at
            gøre økonomien komplet.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-gray-500">
          {per_employee_cost
            ? 'Kost og DB pr. medarbejder vises kun foldet ud.'
            : 'Kost og DB vises kun samlet — kost pr. medarbejder kræver løn-adgang.'}
        </p>
        <CostRevealToggle open={costOpen} onToggle={toggleCost} />
      </div>

      {/* Nøgletal */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="employee-economy-totals">
        <StatCard label="Samlet timer" value={`${formatNumber(totalHours, 2)} t`} />
        <StatCard label="Samlet arbejdssalg" value={formatCurrency(totalSale)} />
        <StatCard label="Samlet arbejdskost" value={costOpen ? formatCurrency(totalCost) : '••••••'} />
        <StatCard
          label="Samlet DB"
          value={costOpen ? formatCurrency(totalDb) : '••••••'}
          tone={!costOpen ? 'neutral' : totalDb >= 0 ? 'pos' : 'neg'}
        />
        <StatCard label="Samlet DB %" value={costOpen ? formatPercent(totalDbPct, 1) : '••••••'} />
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-left">
                <th className="px-4 py-2 font-medium">Medarbejder</th>
                <th className="px-4 py-2 font-medium text-right">Timer</th>
                <th className="px-4 py-2 font-medium text-right">Salg</th>
                {showRowCost && (
                  <>
                    <th className="px-4 py-2 font-medium text-right">Kost</th>
                    <th className="px-4 py-2 font-medium text-right">DB</th>
                    <th className="px-4 py-2 font-medium text-right">DB %</th>
                  </>
                )}
                <th className="px-4 py-2 font-medium text-right">Manglende snapshots</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={showRowCost ? 7 : 4} className="px-4 py-8 text-center text-gray-400">
                    Ingen lukkede timeregistreringer.
                  </td>
                </tr>
              ) : (
                employees.map((e) => (
                  <tr key={e.employee_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{e.employee_name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatNumber(e.hours, 2)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatCurrency(e.labor_sale)}
                    </td>
                    {showRowCost && (
                      <>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatCurrency(e.labor_cost ?? 0)}
                        </td>
                        <td
                          className={`px-4 py-2 text-right tabular-nums font-medium ${
                            (e.db_amount ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {formatCurrency(e.db_amount ?? 0)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatPercent(e.db_percentage ?? 0, 1)}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2 text-right tabular-nums">
                      {e.missing_snapshot_count > 0 ? (
                        <span className="text-amber-700 font-medium">
                          {e.missing_snapshot_count}
                        </span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Medarbejderøkonomi</h1>
      <p className="text-sm text-gray-500">
        Read-only · baseret på frosne time_log-snapshots
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'pos' | 'neg'
}) {
  const valueColor =
    tone === 'pos' ? 'text-emerald-700' : tone === 'neg' ? 'text-red-700' : 'text-gray-900'
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-2 text-xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  )
}
