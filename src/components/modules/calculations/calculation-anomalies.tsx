'use client'

import { useState, useEffect } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  X,
  ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  getCalculationAnomalies,
  resolveAnomaly,
} from '@/lib/actions/calculation-intelligence'
import type { CalculationAnomaly, AnomalySeverity } from '@/types/calculation-intelligence.types'

interface CalculationAnomaliesProps {
  calculationId: string
}

const severityConfig: Record<AnomalySeverity, {
  icon: typeof AlertTriangle
  color: string
  badgeClass: string
  label: string
}> = {
  critical: {
    icon: ShieldAlert,
    color: 'text-red-600',
    badgeClass: 'bg-red-100 text-red-700',
    label: 'Kritisk',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-600',
    badgeClass: 'bg-yellow-100 text-yellow-700',
    label: 'Advarsel',
  },
  info: {
    icon: Info,
    color: 'text-blue-600',
    badgeClass: 'bg-blue-100 text-blue-700',
    label: 'Info',
  },
}

const anomalyTypeLabels: Record<string, string> = {
  price_deviation: 'Prisafvigelse',
  time_outlier: 'Tidsafvigelse',
  missing_material: 'Manglende materiale',
  margin_warning: 'Marginadvarsel',
  missing_rcd: 'Manglende RCD',
  undersized_cable: 'Underdimensioneret kabel',
}

export function CalculationAnomalies({ calculationId }: CalculationAnomaliesProps) {
  const toast = useToast()
  const [anomalies, setAnomalies] = useState<CalculationAnomaly[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const result = await getCalculationAnomalies(calculationId)
        if (result.success && result.data) {
          setAnomalies(result.data)
        }
      } catch {
        // No anomalies
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [calculationId])

  const handleResolve = async (id: string) => {
    setResolvingId(id)
    try {
      const result = await resolveAnomaly(id, 'Manuelt løst')
      if (result.success) {
        setAnomalies(prev =>
          prev.map(a =>
            a.id === id ? { ...a, is_resolved: true, resolved_at: new Date().toISOString() } : a
          )
        )
        toast.success('Anomali markeret som løst')
      } else {
        toast.error(result.error || 'Kunne ikke løse anomali')
      }
    } catch {
      toast.error('Fejl ved løsning af anomali')
    } finally {
      setResolvingId(null)
    }
  }

  const unresolvedAnomalies = anomalies.filter(a => !a.is_resolved)
  const resolvedAnomalies = anomalies.filter(a => a.is_resolved)

  if (isLoading) {
    return null
  }

  if (anomalies.length === 0) {
    return null
  }

  return (
    <Card className={unresolvedAnomalies.some(a => a.severity === 'critical') ? 'border-red-200' : ''}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className={`w-4 h-4 ${unresolvedAnomalies.length > 0 ? 'text-yellow-600' : 'text-green-600'}`} />
          Advarsler ({unresolvedAnomalies.length})
        </CardTitle>
        {resolvedAnomalies.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {resolvedAnomalies.length} løst
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {unresolvedAnomalies.length === 0 ? (
          <p className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Alle advarsler er løst
          </p>
        ) : (
          unresolvedAnomalies.map(anomaly => {
            const config = severityConfig[anomaly.severity]
            const Icon = config.icon

            return (
              <div
                key={anomaly.id}
                className="flex items-start justify-between gap-2 bg-gray-50 rounded p-2"
              >
                <div className="flex items-start gap-2 flex-1">
                  <Icon className={`w-4 h-4 mt-0.5 ${config.color}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Badge className={`text-xs ${config.badgeClass}`}>
                        {config.label}
                      </Badge>
                      <span className="text-xs text-gray-400">
                        {anomalyTypeLabels[anomaly.anomaly_type] || anomaly.anomaly_type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700">{anomaly.message}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label="Afvis"
                  onClick={() => handleResolve(anomaly.id)}
                  disabled={resolvingId === anomaly.id}
                >
                  {resolvingId === anomaly.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <X className="w-3 h-3" />
                  )}
                </Button>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
