'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Target,
  Clock,
  Banknote,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Zap,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  getLearningMetrics,
  getComponentCalibrations,
  runAutoCalibration,
  applyCalibration,
  getAccuracyTrends,
} from '@/lib/actions/learning'

interface LearningMetrics {
  total_calculations: number
  completed_projects: number
  avg_hours_variance: number
  avg_material_variance: number
  avg_price_accuracy: number
  offer_acceptance_rate: number
  project_profitability_rate: number
  avg_customer_satisfaction: number
  improving: boolean
  recent_adjustments: {
    type: string
    component?: string
    factor?: string
    old_value: number
    new_value: number
    reason: string
    applied_at: string
  }[]
}

interface ComponentCalibration {
  code: string
  suggested_time_minutes: number
  current_time_minutes: number
  variance_percentage: number
  sample_size: number
  confidence: number
}

export function LearningDashboardClient() {
  const toast = useToast()
  const [metrics, setMetrics] = useState<LearningMetrics | null>(null)
  const [calibrations, setCalibrations] = useState<ComponentCalibration[]>([])
  const [trends, setTrends] = useState<{
    labels: string[]
    hours_accuracy: number[]
    material_accuracy: number[]
    acceptance_rate: number[]
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [trendPeriod, setTrendPeriod] = useState<'week' | 'month' | 'quarter'>('month')

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [metricsRes, calibRes, trendsRes] = await Promise.all([
        getLearningMetrics(),
        getComponentCalibrations(),
        getAccuracyTrends(trendPeriod),
      ])

      if (metricsRes.success && metricsRes.data) setMetrics(metricsRes.data)
      if (calibRes.success && calibRes.data) setCalibrations(calibRes.data)
      if (trendsRes.success && trendsRes.data) setTrends(trendsRes.data)
      setIsLoading(false)
    }
    load()
  }, [trendPeriod])

  const handleAutoCalibrate = async () => {
    setIsCalibrating(true)
    const result = await runAutoCalibration()
    if (result.success && result.data) {
      toast.success(`Kalibrering fuldført - ${result.data.adjustments.length} justeringer foretaget`)
      // Reload data
      const [metricsRes, calibRes] = await Promise.all([
        getLearningMetrics(),
        getComponentCalibrations(),
      ])
      if (metricsRes.success && metricsRes.data) setMetrics(metricsRes.data)
      if (calibRes.success && calibRes.data) setCalibrations(calibRes.data)
    } else {
      toast.error('Kalibrering fejlede', result.error)
    }
    setIsCalibrating(false)
  }

  const handleApplyCalibration = async (calibration: ComponentCalibration) => {
    const result = await applyCalibration(calibration)
    if (result.success) {
      toast.success(`Tid for ${calibration.code} opdateret til ${calibration.suggested_time_minutes} min`)
      const calibRes = await getComponentCalibrations()
      if (calibRes.success && calibRes.data) setCalibrations(calibRes.data)
    } else {
      toast.error('Fejl', result.error)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse h-24 bg-gray-200 rounded-lg" />
          ))}
        </div>
        <div className="animate-pulse h-64 bg-gray-200 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Metrics Cards */}
      {metrics && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Beregninger"
              value={metrics.total_calculations}
              subtitle={`${metrics.completed_projects} afsluttede projekter`}
              icon={BarChart3}
              iconColor="text-blue-600"
              iconBg="bg-blue-100"
            />
            <MetricCard
              title="Timer nøjagtighed"
              value={`${Math.abs(metrics.avg_hours_variance).toFixed(1)}%`}
              subtitle={metrics.avg_hours_variance > 0 ? 'Over-estimeret' : 'Under-estimeret'}
              icon={Clock}
              iconColor={Math.abs(metrics.avg_hours_variance) < 10 ? 'text-green-600' : 'text-amber-600'}
              iconBg={Math.abs(metrics.avg_hours_variance) < 10 ? 'bg-green-100' : 'bg-amber-100'}
            />
            <MetricCard
              title="Tilbudsaccept"
              value={`${metrics.offer_acceptance_rate.toFixed(0)}%`}
              subtitle={metrics.improving ? 'Forbedrer sig' : 'Stabilt'}
              icon={Target}
              iconColor="text-purple-600"
              iconBg="bg-purple-100"
              trend={metrics.improving ? 'up' : undefined}
            />
            <MetricCard
              title="Kundetilfredshed"
              value={`${metrics.avg_customer_satisfaction.toFixed(1)}/5`}
              subtitle={`${metrics.project_profitability_rate.toFixed(0)}% rentable`}
              icon={CheckCircle}
              iconColor="text-green-600"
              iconBg="bg-green-100"
            />
          </div>

          {/* Secondary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Banknote className="w-4 h-4" />
                Materialafvigelse
              </div>
              <div className="text-2xl font-bold">
                {Math.abs(metrics.avg_material_variance).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-500">
                {metrics.avg_material_variance > 0 ? 'Over-estimeret' : 'Under-estimeret'}
              </div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Target className="w-4 h-4" />
                Prisnøjagtighed
              </div>
              <div className="text-2xl font-bold">
                {metrics.avg_price_accuracy.toFixed(1)}%
              </div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Zap className="w-4 h-4" />
                System status
              </div>
              <div className="flex items-center gap-2">
                {metrics.improving ? (
                  <>
                    <TrendingUp className="w-5 h-5 text-green-500" />
                    <span className="text-lg font-bold text-green-600">Forbedrer sig</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-5 h-5 text-gray-400" />
                    <span className="text-lg font-bold text-gray-600">Stabilt</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Accuracy Trends */}
      {trends && (
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Nøjagtighedstrends</h2>
            <div className="flex gap-1">
              {(['week', 'month', 'quarter'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setTrendPeriod(p)}
                  className={`px-3 py-1 text-sm rounded ${
                    trendPeriod === p
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p === 'week' ? 'Uge' : p === 'month' ? 'Måned' : 'Kvartal'}
                </button>
              ))}
            </div>
          </div>

          {trends.labels.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              Ikke nok data til at vise trends endnu
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <TrendColumn
                title="Timer nøjagtighed"
                labels={trends.labels}
                values={trends.hours_accuracy}
                color="blue"
              />
              <TrendColumn
                title="Material nøjagtighed"
                labels={trends.labels}
                values={trends.material_accuracy}
                color="green"
              />
              <TrendColumn
                title="Acceptrate"
                labels={trends.labels}
                values={trends.acceptance_rate}
                color="purple"
              />
            </div>
          )}
        </div>
      )}

      {/* Component Calibrations */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Komponentkalibrering</h2>
            <p className="text-sm text-gray-500 mt-1">
              Foreslåede justeringer baseret på faktiske projektdata
            </p>
          </div>
          <Button onClick={handleAutoCalibrate} disabled={isCalibrating}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isCalibrating ? 'animate-spin' : ''}`} />
            {isCalibrating ? 'Kalibrerer...' : 'Kør autokalibrering'}
          </Button>
        </div>

        {calibrations.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            Ingen kalibreringsforslag tilgængelige. Der kræves mere projektdata.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-2 font-medium text-gray-500">Komponent</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Nuværende (min)</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Foreslået (min)</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Afvigelse</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Datapunkter</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Konfidens</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Handling</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {calibrations.map(cal => {
                  const varianceColor = Math.abs(cal.variance_percentage) < 10
                    ? 'text-green-600'
                    : Math.abs(cal.variance_percentage) < 25
                    ? 'text-amber-600'
                    : 'text-red-600'

                  return (
                    <tr key={cal.code} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{cal.code}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{cal.current_time_minutes}</td>
                      <td className="px-4 py-3 text-right font-medium">{cal.suggested_time_minutes}</td>
                      <td className={`px-4 py-3 text-right font-medium ${varianceColor}`}>
                        <span className="flex items-center justify-end gap-1">
                          {cal.variance_percentage > 0 ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          {Math.abs(cal.variance_percentage).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{cal.sample_size}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-200 rounded-full">
                            <div
                              className={`h-full rounded-full ${
                                cal.confidence > 0.7 ? 'bg-green-500' : cal.confidence > 0.4 ? 'bg-amber-500' : 'bg-gray-400'
                              }`}
                              style={{ width: `${cal.confidence * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{(cal.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleApplyCalibration(cal)}
                          className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                          disabled={cal.confidence < 0.3}
                          title={cal.confidence < 0.3 ? 'For lav konfidens' : 'Anvend justering'}
                        >
                          Anvend
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Adjustments */}
      {metrics && metrics.recent_adjustments.length > 0 && (
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Seneste justeringer</h2>
          <div className="space-y-3">
            {metrics.recent_adjustments.map((adj, i) => (
              <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className={`p-2 rounded ${
                  adj.type === 'time' ? 'bg-blue-50' :
                  adj.type === 'material' ? 'bg-green-50' :
                  adj.type === 'margin' ? 'bg-purple-50' :
                  adj.type === 'risk_buffer' ? 'bg-amber-50' : 'bg-gray-50'
                }`}>
                  {adj.type === 'time' ? <Clock className="w-4 h-4 text-blue-600" /> :
                   adj.type === 'material' ? <Banknote className="w-4 h-4 text-green-600" /> :
                   <Zap className="w-4 h-4 text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {adj.component || adj.factor || adj.type}
                  </p>
                  <p className="text-xs text-gray-500">{adj.reason}</p>
                </div>
                <div className="text-sm text-right shrink-0">
                  <span className="text-gray-400 line-through">{adj.old_value}</span>
                  {' → '}
                  <span className="font-medium text-gray-900">{adj.new_value}</span>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(adj.applied_at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// Helper Components
// =====================================================

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  iconBg,
  trend,
}: {
  title: string
  value: string | number
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  iconBg: string
  trend?: 'up' | 'down'
}) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm text-gray-500">{title}</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {trend === 'up' && <TrendingUp className="w-4 h-4 text-green-500" />}
            {trend === 'down' && <TrendingDown className="w-4 h-4 text-red-500" />}
          </div>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
      </div>
    </div>
  )
}

function TrendColumn({
  title,
  labels,
  values,
  color,
}: {
  title: string
  labels: string[]
  values: number[]
  color: 'blue' | 'green' | 'purple'
}) {
  const maxVal = Math.max(...values.filter(v => v > 0), 100)
  const colorMap = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-3">{title}</h3>
      <div className="space-y-2">
        {labels.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-16 shrink-0">{label}</span>
            <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${colorMap[color]} rounded-full transition-all`}
                style={{ width: `${values[i] > 0 ? (values[i] / maxVal) * 100 : 0}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-600 w-10 text-right">
              {values[i] > 0 ? `${values[i].toFixed(0)}%` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
