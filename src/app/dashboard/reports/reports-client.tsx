'use client'

import { SalesFunnelTable } from './sales-funnel-table'
import type { SalesFunnel } from '@/lib/reports/sales-funnel'
import { CostRevealToggle, useCostReveal } from '@/components/shared/sensitive-amounts'
import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import { profitByClosedMonth, profitByCustomer, type ProfitGroup } from '@/lib/profit/profitability-groups'
import {
  BarChart3,
  TrendingUp,
  Users,
  Clock,
  DollarSign,
  Building2,
  Target,
  Briefcase,
  Download,
  XCircle,
  TrendingDown,
} from 'lucide-react'
import { ExportButton } from '@/components/shared/export-button'
import {
  getReportsSummary,
  getRevenueByPeriod,
  getRevenueByCustomer,
  getProjectProfitabilityReport,
  getTeamProductivity,
  getRejectionStats,
  getSalesFunnel,
  type ReportsSummary,
  type RevenueByPeriod,
  type RevenueByCustomer,
  type ProjectProfitability,
  type ProjectProfitabilityReport,
  type TeamProductivity,
  type RejectionStats,
} from '@/lib/actions/reports'
import { humanizeErrorText } from '@/lib/auth/permission-text'

// =====================================================
// KPI Card
// =====================================================

function KpiCard({
  label,
  value,
  sublabel,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  sublabel?: string
  icon: typeof DollarSign
  color: string
}) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 truncate">{label}</p>
          <p className="text-lg font-bold text-gray-900">{value}</p>
          {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// Revenue Bar Chart (CSS-only)
// =====================================================

function RevenueChart({ data }: { data: RevenueByPeriod[] }) {
  const maxValue = Math.max(...data.map((d) => d.accepted_revenue), 1)

  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-gray-400" />
        {/* B-9 (pilot-review 2026-10-15): tallene er accepterede tilbud (ordreindgang), ikke fakturering — kunne ikke
            afstemmes med e-conomic under navnet "omsætning" */}
        Ordreindgang pr. måned (accepterede tilbud)
      </h3>
      <div className="flex items-end gap-3 h-48">
        {data.map((d) => {
          const height = maxValue > 0 ? (d.accepted_revenue / maxValue) * 100 : 0
          return (
            <div key={d.period} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-gray-500 font-medium">
                {d.accepted_count > 0 ? formatCurrency(d.accepted_revenue) : ''}
              </span>
              <div className="w-full flex flex-col items-center justify-end h-36">
                <div
                  className="w-full max-w-12 bg-primary/80 rounded-t transition-all"
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${formatCurrency(d.accepted_revenue)} (${d.accepted_count} tilbud)`}
                />
              </div>
              <span className="text-[10px] text-gray-400">{d.period}</span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 pt-3 border-t text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-primary/80" /> Accepterede tilbud
        </span>
      </div>
    </div>
  )
}

// =====================================================
// Top Customers Table
// =====================================================

function TopCustomersTable({ data }: { data: RevenueByCustomer[] }) {
  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Building2 className="w-5 h-5 text-gray-400" />
        Top kunder (ordreindgang)
      </h3>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">Ingen data endnu</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium text-gray-500">Kunde</th>
                <th className="pb-2 font-medium text-gray-500 text-right">Tilbud</th>
                <th className="pb-2 font-medium text-gray-500 text-right">Accept %</th>
                <th className="pb-2 font-medium text-gray-500 text-right">Ordreindgang</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.customer_id} className="border-b last:border-b-0">
                  <td className="py-2.5 font-medium text-gray-900">{c.customer_name}</td>
                  <td className="py-2.5 text-right text-gray-600">{c.total_offers}</td>
                  <td className="py-2.5 text-right">
                    <span
                      className={`font-medium ${
                        c.acceptance_rate >= 50 ? 'text-green-600' : 'text-amber-600'
                      }`}
                    >
                      {c.acceptance_rate.toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-medium text-gray-900">
                    {formatCurrency(c.total_revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// =====================================================
// Project Profitability Table
// =====================================================

/** Fokus D 2026-10-15: realiseret DB pr. kunde og pr. lukkemåned (samme sager og filtre som tabellen) */
function ProfitGroups({ rows, minDb }: { rows: ProjectProfitability[]; minDb: number }) {
  const byCustomer = profitByCustomer(rows).slice(0, 10)
  const byMonth = profitByClosedMonth(rows).slice(0, 12)
  const Table = ({ title, groups, testId }: { title: string; groups: ProfitGroup[]; testId: string }) => (
    <div className="rounded border p-3" data-testid={testId}>
      <h4 className="text-sm font-medium text-gray-900 mb-2">{title}</h4>
      {groups.length === 0 ? <p className="text-xs text-gray-400">Ingen fakturerede sager</p> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-gray-500"><th className="py-1 font-medium"></th><th className="py-1 font-medium text-right">Sager</th><th className="py-1 font-medium text-right">Faktureret</th><th className="py-1 font-medium text-right">DB</th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className="border-b last:border-b-0">
                <td className="py-1 truncate max-w-[10rem]">{g.label}</td>
                <td className="py-1 text-right text-gray-600">{g.cases}</td>
                <td className="py-1 text-right text-gray-600">{formatCurrency(g.net_invoiced)}</td>
                <td className={`py-1 text-right font-medium ${g.realized_db_pct != null && g.realized_db_pct < minDb ? 'text-red-600' : 'text-green-700'}`}>
                  {formatCurrency(g.realized_db)}{g.realized_db_pct != null ? ` (${d1(g.realized_db_pct)} %)` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
  return (
    <div className="grid md:grid-cols-2 gap-3 mt-4">
      <Table title="Realiseret DB pr. kunde (top 10)" groups={byCustomer} testId="report-db-by-customer" />
      <Table title="Realiseret DB pr. måned (lukkede sager)" groups={byMonth} testId="report-db-by-month" />
    </div>
  )
}

const PERIODS: Array<{ value: string; label: string; days: number | null }> = [
  { value: '90', label: 'Seneste 90 dage', days: 90 },
  { value: '365', label: 'Seneste 12 mdr.', days: 365 },
  { value: 'all', label: 'Alle', days: null },
]
const d1 = (v: number) => v.toFixed(1).replace('.', ',')
const pct = (v: number | null, signed = false) => (v == null ? '—' : `${signed && v > 0 ? '+' : ''}${d1(v)} %`)

/**
 * Efterkalkulation (fokus A/B 2026-10-15): tilbudt vs. faktisk pr. sag med filtre og opsummering. Henter selv
 * (getProjectProfitabilityReport) — før de 50 nyeste sager, 15 vist, uden periode/status.
 */
function ProjectTable() {
  // PV8/N26d: budget og tilbudt/faktisk kost er interne tal → sammenfoldet som standard (shoulder-surfing)
  const [costOpen, toggleCost] = useCostReveal()
  const [byDeviation, setByDeviation] = useState(false)
  const [period, setPeriod] = useState('365')
  const [status, setStatus] = useState<'all' | 'open' | 'closed'>('all')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [report, setReport] = useState<ProjectProfitabilityReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    getProjectProfitabilityReport({ sinceDays: PERIODS.find((x) => x.value === period)?.days ?? null, status, limit: 500 })
      .then((res) => {
        if (!alive) return
        if (res.success && res.data) setReport(res.data)
        else setError(humanizeErrorText(res.error) || 'Kunne ikke hente sagsrentabilitet')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [period, status])

  const minDb = report?.minimum_db_pct ?? 0
  const isIssue = (p: ProjectProfitability) =>
    (p.hours_deviation_pct ?? 0) > 10 || (p.cost_deviation ?? 0) > 0 || (p.realized_db_pct != null && p.realized_db_pct < minDb)
  const data = (report?.rows ?? []).filter((p) => !onlyIssues || isIssue(p))
  const rows = byDeviation
    ? [...data].sort((a, b) => Math.abs(b.cost_deviation ?? 0) - Math.abs(a.cost_deviation ?? 0))
    : data
  const visible = showAll ? rows : rows.slice(0, 25)
  const sum = report?.summary

  return (
    <div className="bg-white rounded-lg border p-4 sm:p-6" data-testid="report-case-profitability">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-gray-400" />
          Sagsrentabilitet — tilbudt vs. faktisk
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="text-xs border rounded px-2 py-1" aria-label="Periode" data-testid="report-period">
            {PERIODS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | 'open' | 'closed')} className="text-xs border rounded px-2 py-1" aria-label="Status" data-testid="report-status">
            <option value="all">Alle sager</option>
            <option value="open">Åbne</option>
            <option value="closed">Lukkede</option>
          </select>
          <label className="text-xs text-gray-600 flex items-center gap-1">
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} data-testid="report-only-issues" />
            Kun afvigelser
          </label>
          {costOpen && (
            <label className="text-xs text-gray-600 flex items-center gap-1">
              <input type="checkbox" checked={byDeviation} onChange={(e) => setByDeviation(e.target.checked)} data-testid="report-sort-deviation" />
              Største afvigelse først
            </label>
          )}
          <CostRevealToggle open={costOpen} onToggle={toggleCost} />
        </div>
      </div>

      {sum && sum.cases > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4" data-testid="report-aftercalc-summary">
          <div className="rounded border p-2">
            <div className="text-xs text-gray-500">Timer vs. estimat (lukkede)</div>
            <div className={`font-semibold ${(sum.avg_hours_deviation_pct ?? 0) > 10 ? 'text-red-600' : 'text-gray-900'}`}>{pct(sum.avg_hours_deviation_pct, true)}</div>
            <div className="text-[11px] text-gray-400">{sum.hours_basis} sager med estimat</div>
          </div>
          <div className="rounded border p-2">
            <div className="text-xs text-gray-500">Over estimat (&gt;10 %)</div>
            <div className="font-semibold text-gray-900">{sum.over_hours} af {sum.cases}</div>
          </div>
          {costOpen ? (
            <>
              <div className="rounded border p-2">
                <div className="text-xs text-gray-500">DB realiseret vs. tilbudt (lukkede)</div>
                <div className={`font-semibold ${(sum.avg_db_deviation_pp ?? 0) < 0 ? 'text-red-600' : 'text-gray-900'}`} data-testid="report-db-deviation-avg">
                  {sum.avg_db_deviation_pp == null ? '—' : `${sum.avg_db_deviation_pp > 0 ? '+' : ''}${d1(sum.avg_db_deviation_pp)} pp`}
                </div>
                <div className="text-[11px] text-gray-400">{sum.db_basis} sager med tilbud + faktura</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-xs text-gray-500">Under minimum-DB ({minDb} %)</div>
                <div className={`font-semibold ${sum.low_db > 0 ? 'text-red-600' : 'text-gray-900'}`}>{sum.low_db} sager</div>
                <div className="text-[11px] text-gray-400">{sum.over_cost} over tilbudt kost</div>
              </div>
            </>
          ) : (
            <div className="rounded border p-2 col-span-2 text-xs text-gray-400 flex items-center">Vis beløb for DB-afvigelse og kost</div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Henter…</p>
      ) : error ? (
        <p className="text-sm text-red-600 py-8 text-center">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">{onlyIssues ? 'Ingen sager med afvigelser' : 'Ingen sager i perioden'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium text-gray-500">Sag</th>
                <th className="pb-2 font-medium text-gray-500">Kunde</th>
                {costOpen && (
                  <>
                    <th className="pb-2 font-medium text-gray-500 text-right">Tilbudt kost</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Faktisk kost</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Afvigelse</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Faktureret netto</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Tilbudt DB</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Realiseret DB</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">DB-afvigelse</th>
                  </>
                )}
                <th className="pb-2 font-medium text-gray-500 text-right">Est. timer</th>
                <th className="pb-2 font-medium text-gray-500 text-right">Faktiske timer</th>
                <th className="pb-2 font-medium text-gray-500 text-right">Timeafvigelse</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.project_id} className="border-b last:border-b-0" data-testid="report-case-row">
                  <td className="py-2.5">
                    <a href={`/dashboard/orders/${p.project_id}`} className="font-medium text-gray-900 hover:underline">{p.project_name || p.project_number}</a>
                    <div className="text-xs text-gray-400">{p.project_number}{p.status === 'closed' ? ' · lukket' : ''}</div>
                  </td>
                  <td className="py-2.5 text-gray-600">{p.customer_name || '—'}</td>
                  {costOpen && (
                    <>
                      <td className="py-2.5 text-right text-gray-600">{p.offered_cost != null ? formatCurrency(p.offered_cost) : '—'}</td>
                      <td className="py-2.5 text-right text-gray-600">{p.actual_cost != null ? formatCurrency(p.actual_cost) : '—'}</td>
                      <td className={`py-2.5 text-right font-medium ${p.cost_deviation != null && p.cost_deviation > 0 ? 'text-red-600' : 'text-gray-700'}`} data-testid="report-case-deviation">
                        {p.cost_deviation != null ? `${p.cost_deviation > 0 ? '+' : ''}${formatCurrency(p.cost_deviation)}` : '—'}
                      </td>
                      <td className="py-2.5 text-right text-gray-600">{p.net_invoiced ? formatCurrency(p.net_invoiced) : '—'}</td>
                      <td className="py-2.5 text-right text-gray-600" data-testid="report-case-offered-db">
                        {p.offered_db == null ? '—' : `${formatCurrency(p.offered_db)}${p.offered_db_pct != null ? ` (${d1(p.offered_db_pct)} %)` : ''}`}
                      </td>
                      <td className={`py-2.5 text-right font-medium ${p.realized_db == null ? 'text-gray-400' : p.realized_db_pct != null && p.realized_db_pct < minDb ? 'text-red-600' : 'text-green-700'}`} data-testid="report-case-realized">
                        {p.realized_db == null ? '—' : `${formatCurrency(p.realized_db)}${p.realized_db_pct != null ? ` (${d1(p.realized_db_pct)} %)` : ''}`}
                      </td>
                      <td className={`py-2.5 text-right font-medium ${(p.db_deviation_pp ?? 0) < 0 ? 'text-red-600' : 'text-gray-700'}`} data-testid="report-case-db-deviation">
                        {p.db_deviation_pp == null ? '—' : `${p.db_deviation_pp > 0 ? '+' : ''}${d1(p.db_deviation_pp)} pp`}
                      </td>
                    </>
                  )}
                  <td className="py-2.5 text-right text-gray-600">{p.estimated_hours != null ? `${p.estimated_hours}t` : '—'}</td>
                  <td className="py-2.5 text-right text-gray-600">{p.actual_hours}t</td>
                  <td className={`py-2.5 text-right font-medium ${(p.hours_deviation_pct ?? 0) > 10 ? 'text-red-600' : (p.hours_deviation_pct ?? 0) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {pct(p.hours_deviation_pct, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > visible.length && (
            <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-sm text-primary hover:underline" data-testid="report-show-all">
              Vis alle {rows.length} sager
            </button>
          )}
          {report?.truncated && <p className="mt-2 text-xs text-amber-600">Viser de 500 nyeste sager — vælg en kortere periode for resten.</p>}
        </div>
      )}
      {costOpen && report && report.rows.length > 0 && <ProfitGroups rows={report.rows} minDb={minDb} />}
    </div>
  )
}

// =====================================================
// Team Productivity Table
// =====================================================

function TeamTable({ data }: { data: TeamProductivity[] }) {
  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Users className="w-5 h-5 text-gray-400" />
        Team-produktivitet (seneste 30 dage)
      </h3>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">Ingen tidsregistreringer endnu</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium text-gray-500">Medarbejder</th>
                <th className="pb-2 font-medium text-gray-500 text-right">Timer total</th>
                <th className="pb-2 font-medium text-gray-500 text-right">Fakturerbar</th>
                <th className="pb-2 font-medium text-gray-500 text-right">Udnyttelse</th>
                <th className="pb-2 font-medium text-gray-500 text-right">Sager</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.user_id} className="border-b last:border-b-0">
                  <td className="py-2.5 font-medium text-gray-900">{t.full_name}</td>
                  <td className="py-2.5 text-right text-gray-600">{t.total_hours}t</td>
                  <td className="py-2.5 text-right text-gray-600">{t.billable_hours}t</td>
                  <td className="py-2.5 text-right">
                    <span
                      className={`font-medium ${
                        t.billable_percentage >= 70
                          ? 'text-green-600'
                          : t.billable_percentage >= 50
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}
                    >
                      {t.billable_percentage}%
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-gray-600">{t.projects_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// =====================================================
// Phase 12A — Rejection Analytics Section
// =====================================================

function RejectionAnalyticsSection({ stats }: { stats: RejectionStats | null }) {
  if (!stats || stats.totalRejected === 0) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <XCircle className="w-5 h-5 text-gray-400" />
          Afvisningsårsager
        </h3>
        <p className="text-sm text-gray-400 italic py-8 text-center">
          Når kunder afviser tilbud, vises årsagerne her.
        </p>
      </div>
    )
  }

  const topReason = stats.byReason[0]
  const maxCount = Math.max(...stats.byReason.map((r) => r.count), 1)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Total afviste (90 dage)"
          value={stats.totalRejected.toString()}
          sublabel={`${stats.rejectionRate.toFixed(1)}% afvisningsrate`}
          icon={XCircle}
          color="bg-red-100 text-red-600"
        />
        <KpiCard
          label="Tabt ordreværdi"
          value={formatCurrency(stats.lostRevenue)}
          sublabel="Fra afviste tilbud"
          icon={TrendingDown}
          color="bg-amber-100 text-amber-600"
        />
        <KpiCard
          label="Top årsag"
          value={topReason?.label || '—'}
          sublabel={topReason ? `${topReason.count} tilbud (${topReason.percentage.toFixed(0)}%)` : ''}
          icon={Target}
          color="bg-orange-100 text-orange-600"
        />
      </div>

      <div className="bg-white rounded-lg border p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-gray-400" />
          Afvisningsårsager (seneste 90 dage)
        </h3>
        <ul className="space-y-3">
          {stats.byReason.map((r) => {
            const widthPct = maxCount > 0 ? (r.count / maxCount) * 100 : 0
            const isUnknown = r.reason === 'unknown'
            return (
              <li key={r.reason} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={`font-medium ${isUnknown ? 'text-gray-500 italic' : 'text-gray-900'}`}>
                    {r.label}
                  </span>
                  <span className="text-gray-600 font-mono text-xs shrink-0">
                    {r.count} · {r.percentage.toFixed(0)}% · {formatCurrency(r.lostRevenue)}
                  </span>
                </div>
                <div className="relative h-6 bg-gray-100 rounded overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 rounded transition-all ${
                      isUnknown ? 'bg-gray-300' : 'bg-red-400/70'
                    }`}
                    style={{ width: `${Math.max(widthPct, 2)}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
        {stats.trend.prev30Days > 0 && (
          <p className="text-xs text-gray-500 mt-4 pt-3 border-t">
            Seneste 30 dage: {stats.trend.last30Days} afviste vs. {stats.trend.prev30Days} i forrige 30 dage
            {' '}({stats.trend.deltaPercent >= 0 ? '+' : ''}{stats.trend.deltaPercent.toFixed(0)}%)
          </p>
        )}
      </div>
    </div>
  )
}

// =====================================================
// Main
// =====================================================

export default function ReportsClient() {
  const [summary, setSummary] = useState<ReportsSummary | null>(null)
  const [revenue, setRevenue] = useState<RevenueByPeriod[]>([])
  const [customers, setCustomers] = useState<RevenueByCustomer[]>([])
  const [team, setTeam] = useState<TeamProductivity[]>([])
  const [rejections, setRejections] = useState<RejectionStats | null>(null)
  const [funnel, setFunnel] = useState<SalesFunnel | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [summaryRes, revenueRes, customersRes, teamRes, rejectionsRes, funnelRes] =
        await Promise.allSettled([
          getReportsSummary(),
          getRevenueByPeriod(6),
          getRevenueByCustomer(10),
          getTeamProductivity(1),
          getRejectionStats(),
          getSalesFunnel(6),
        ])

      if (summaryRes.status === 'fulfilled' && summaryRes.value.success) {
        setSummary(summaryRes.value.data || null)
      }
      if (revenueRes.status === 'fulfilled' && revenueRes.value.success) {
        setRevenue(revenueRes.value.data || [])
      }
      if (customersRes.status === 'fulfilled' && customersRes.value.success) {
        setCustomers(customersRes.value.data || [])
      }
      if (teamRes.status === 'fulfilled' && teamRes.value.success) {
        setTeam(teamRes.value.data || [])
      }
      if (rejectionsRes.status === 'fulfilled' && rejectionsRes.value.success) {
        setRejections(rejectionsRes.value.data || null)
      }
      if (funnelRes.status === 'fulfilled' && funnelRes.value.success) {
        setFunnel(funnelRes.value.data || null)
      }
      setIsLoading(false)
    }
    load()
  }, [])

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border p-4 h-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border p-6 h-72" />
          <div className="bg-white rounded-lg border p-6 h-72" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rapporter</h1>
        <p className="text-gray-500">Ordreindgang, projekt-rentabilitet og team-produktivitet</p>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Ordreindgang"
            value={formatCurrency(summary.total_revenue)}
            sublabel="Accepterede tilbud (ikke faktureret)"
            icon={DollarSign}
            color="bg-green-100 text-green-600"
          />
          <KpiCard
            label="Afventer"
            value={formatCurrency(summary.pending_value)}
            sublabel="Udestående tilbud"
            icon={TrendingUp}
            color="bg-blue-100 text-blue-600"
          />
          <KpiCard
            label="Accept-rate"
            value={`${summary.acceptance_rate.toFixed(0)}%`}
            sublabel={`Gns. tilbud: ${formatCurrency(summary.avg_offer_value)}`}
            icon={Target}
            color="bg-purple-100 text-purple-600"
          />
          <KpiCard
            label="Timer denne måned"
            value={`${summary.total_hours_this_month.toFixed(1)}t`}
            sublabel={`${summary.billable_hours_this_month.toFixed(1)}t fakturerbare`}
            icon={Clock}
            color="bg-amber-100 text-amber-600"
          />
        </div>
      )}

      {/* Revenue Chart + Top Customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueChart data={revenue} />
        <TopCustomersTable data={customers} />
      </div>

      {/* Phase 12A — Afvisningsårsager */}
      <RejectionAnalyticsSection stats={rejections} />

      {/* Project Profitability */}
      {/* N53: salgstragt pr. måned */}
      <SalesFunnelTable data={funnel} />

      <ProjectTable />

      {/* Team Productivity */}
      <TeamTable data={team} />

      {/* CSV Export Section */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <Download className="w-5 h-5 text-gray-400" />
          Eksportér data (CSV)
        </h3>
        <p className="text-sm text-gray-500 mb-4">Download data som CSV-filer til brug i Excel, regnskab eller analyse.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <ExportButton type="customers" className="justify-center" />
          <ExportButton type="leads" className="justify-center" />
          <ExportButton type="offers" className="justify-center" />
          <ExportButton type="projects" className="justify-center" />
          <ExportButton type="calculations" className="justify-center" />
        </div>
      </div>
    </div>
  )
}
