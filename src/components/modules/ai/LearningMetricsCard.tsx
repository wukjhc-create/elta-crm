'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Brain,
  Target,
  CheckCircle2,
  Clock,
  Package,
  Smile,
  Loader2,
} from 'lucide-react'
import { getLearningMetrics } from '@/lib/actions/learning'
import type { LearningMetrics } from '@/lib/ai/learningEngine'

interface LearningMetricsCardProps {
  className?: string
}

export function LearningMetricsCard({ className }: LearningMetricsCardProps) {
  const [metrics, setMetrics] = useState<LearningMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadMetrics()
  }, [])

  async function loadMetrics() {
    setLoading(true)
    const result = await getLearningMetrics()
    if (result.success && result.data) {
      setMetrics(result.data)
    }
    setLoading(false)
  }

  async function handleRefresh() {
    setRefreshing(true)
    await loadMetrics()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <div className={`border rounded-lg p-6 bg-white ${className}`}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className={`border rounded-lg p-6 bg-white ${className}`}>
        <div className="text-center py-4 text-gray-500">Kunne ikke hente læringsdata</div>
      </div>
    )
  }

  return (
    <div className={`border rounded-lg bg-white ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-500" />
          <h3 className="font-semibold">AI Læring</h3>
          {metrics.improving ? (
            <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
              <TrendingUp className="w-3 h-3 mr-1" />
              Forbedrer
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">
              <TrendingDown className="w-3 h-3 mr-1" />
              Kalibrerer
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 divide-x divide-y">
        <MetricCell
          icon={<Target className="w-4 h-4 text-blue-500" />}
          label="Prisaccuacy"
          value={`${metrics.avg_price_accuracy}%`}
          trend={metrics.avg_price_accuracy > 90 ? 'good' : metrics.avg_price_accuracy > 75 ? 'ok' : 'bad'}
        />
        <MetricCell
          icon={<Clock className="w-4 h-4 text-orange-500" />}
          label="Tidsafvigelse"
          value={`${metrics.avg_hours_variance > 0 ? '+' : ''}${metrics.avg_hours_variance}%`}
          trend={Math.abs(metrics.avg_hours_variance) < 10 ? 'good' : Math.abs(metrics.avg_hours_variance) < 20 ? 'ok' : 'bad'}
        />
        <MetricCell
          icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
          label="Accept rate"
          value={`${metrics.offer_acceptance_rate}%`}
          trend={metrics.offer_acceptance_rate > 60 ? 'good' : metrics.offer_acceptance_rate > 40 ? 'ok' : 'bad'}
        />
        <MetricCell
          icon={<Smile className="w-4 h-4 text-purple-500" />}
          label="Kundetilfredshed"
          value={metrics.avg_customer_satisfaction ? `${metrics.avg_customer_satisfaction}/5` : '-'}
          trend={metrics.avg_customer_satisfaction >= 4 ? 'good' : metrics.avg_customer_satisfaction >= 3 ? 'ok' : 'bad'}
        />
      </div>

      {/* Footer */}
      <div className="p-4 border-t bg-gray-50">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Baseret på {metrics.completed_projects} afsluttede projekter
          </span>
          <span>{metrics.total_calculations} totale beregninger</span>
        </div>
      </div>
    </div>
  )
}

function MetricCell({
  icon,
  label,
  value,
  trend,
}: {
  icon: React.ReactNode
  label: string
  value: string
  trend: 'good' | 'ok' | 'bad'
}) {
  const trendColors = {
    good: 'text-green-600',
    ok: 'text-yellow-600',
    bad: 'text-red-600',
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={`text-lg font-bold ${trendColors[trend]}`}>{value}</div>
    </div>
  )
}
