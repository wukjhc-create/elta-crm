'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils/format'
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
} from 'lucide-react'
import { ExportButton } from '@/components/shared/export-button'
import {
  getReportsSummary,
  getRevenueByPeriod,
  getRevenueByCustomer,
  getProjectProfitability,
  getTeamProductivity,
  type ReportsSummary,
  type RevenueByPeriod,
  type RevenueByCustomer,
  type ProjectProfitability,
  type TeamProductivity,
} from '@/lib/actions/reports'

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
        Omsætning pr. måned
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
          <span className="w-3 h-3 rounded bg-primary/80" /> Accepteret omsætning
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
        Top kunder (omsætning)
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
                <th className="pb-2 font-medium text-gray-500 text-right">Omsætning</th>
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

function ProjectTable({ data }: { data: ProjectProfitability[] }) {
  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Briefcase className="w-5 h-5 text-gray-400" />
        Projekt-rentabilitet
      </h3>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">Ingen aktive/afsluttede projekter</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium text-gray-500">Projekt</th>
                <th className="pb-2 font-medium text-gray-500">Kunde</th>
                <th className="pb-2 font-medium text-gray-500 text-right">Budget</th>
                <th className="pb-2 font-medium text-gray-500 text-right">Est. timer</th>
                <th className="pb-2 font-medium text-gray-500 text-right">Faktiske timer</th>
                <th className="pb-2 font-medium text-gray-500 text-right">Udnyttelse</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 15).map((p) => {
                const utilization =
                  p.estimated_hours && p.estimated_hours > 0
                    ? (p.actual_hours / p.estimated_hours) * 100
                    : null
                return (
                  <tr key={p.project_id} className="border-b last:border-b-0">
                    <td className="py-2.5">
                      <div className="font-medium text-gray-900">{p.project_name}</div>
                      <div className="text-xs text-gray-400">{p.project_number}</div>
                    </td>
                    <td className="py-2.5 text-gray-600">{p.customer_name || '—'}</td>
                    <td className="py-2.5 text-right text-gray-600">
                      {p.budget ? formatCurrency(p.budget) : '—'}
                    </td>
                    <td className="py-2.5 text-right text-gray-600">
                      {p.estimated_hours != null ? `${p.estimated_hours}t` : '—'}
                    </td>
                    <td className="py-2.5 text-right text-gray-600">{p.actual_hours}t</td>
                    <td className="py-2.5 text-right">
                      {utilization !== null ? (
                        <span
                          className={`font-medium ${
                            utilization > 110
                              ? 'text-red-600'
                              : utilization > 90
                                ? 'text-amber-600'
                                : 'text-green-600'
                          }`}
                        >
                          {utilization.toFixed(0)}%
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
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
                <th className="pb-2 font-medium text-gray-500 text-right">Projekter</th>
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
// Main
// =====================================================

export default function ReportsClient() {
  const [summary, setSummary] = useState<ReportsSummary | null>(null)
  const [revenue, setRevenue] = useState<RevenueByPeriod[]>([])
  const [customers, setCustomers] = useState<RevenueByCustomer[]>([])
  const [projects, setProjects] = useState<ProjectProfitability[]>([])
  const [team, setTeam] = useState<TeamProductivity[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [summaryRes, revenueRes, customersRes, projectsRes, teamRes] =
        await Promise.allSettled([
          getReportsSummary(),
          getRevenueByPeriod(6),
          getRevenueByCustomer(10),
          getProjectProfitability(),
          getTeamProductivity(1),
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
      if (projectsRes.status === 'fulfilled' && projectsRes.value.success) {
        setProjects(projectsRes.value.data || [])
      }
      if (teamRes.status === 'fulfilled' && teamRes.value.success) {
        setTeam(teamRes.value.data || [])
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
        <p className="text-gray-500">Omsætning, projekt-rentabilitet og team-produktivitet</p>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Total omsætning"
            value={formatCurrency(summary.total_revenue)}
            sublabel="Accepterede tilbud"
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

      {/* Project Profitability */}
      <ProjectTable data={projects} />

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
