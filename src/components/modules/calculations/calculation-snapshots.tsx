'use client'

import { useState, useEffect } from 'react'
import {
  Camera,
  History,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  createCalculationSnapshot,
  getCalculationSnapshots,
} from '@/lib/actions/ai-intelligence'
import type { CalculationWithRelations } from '@/types/calculations.types'
import { formatCurrency } from '@/lib/utils/format'
import { calculateDBPercentage } from '@/lib/logic/pricing'

interface CalculationSnapshotsProps {
  calculation: CalculationWithRelations
}

interface Snapshot {
  id: string
  version: number
  snapshot_reason: string | null
  total_time_minutes: number
  total_labor_cost: number
  total_material_cost: number
  total_price: number
  margin_percentage: number
  effective_hourly_rate: number | null
  component_count: number
  risk_level: 'low' | 'medium' | 'high' | null
  created_at: string
}

export function CalculationSnapshots({ calculation }: CalculationSnapshotsProps) {
  const toast = useToast()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const data = await getCalculationSnapshots(calculation.id)
        setSnapshots(data)
      } catch {
        toast.error('Kunne ikke hente snapshots')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [calculation.id])


  const handleCreateSnapshot = async () => {
    setIsCreating(true)
    try {
      const rows = calculation.rows || []
      const totalHours = rows.reduce((sum, r) => sum + (r.hours || 0), 0)
      const totalTimeMinutes = Math.round(totalHours * 60)
      const totalLaborCost = rows
        .filter(r => r.hours != null && r.hours > 0)
        .reduce((sum, r) => sum + r.total, 0)
      const totalMaterialCost = rows
        .filter(r => !r.hours || r.hours === 0)
        .reduce((sum, r) => sum + (r.cost_price || 0) * r.quantity, 0)

      const totalCost = totalLaborCost + totalMaterialCost
      const marginPercentage = calculateDBPercentage(totalCost, calculation.final_amount)

      const result = await createCalculationSnapshot(
        calculation.id,
        null,
        {
          items: rows.map(r => ({
            name: r.description,
            quantity: r.quantity,
            unit_price: r.sale_price,
            total: r.total,
            type: r.row_type,
          })),
          totals: {
            total_time_minutes: totalTimeMinutes,
            total_labor_cost: totalLaborCost,
            total_material_cost: totalMaterialCost,
            total_price: calculation.final_amount,
            margin_percentage: Math.max(0, marginPercentage),
          },
          factors: {},
          metadata: {
            created_at: new Date().toISOString(),
            version: '1.0',
          },
        },
        'Manuel snapshot'
      )

      if (result.success) {
        toast.success('Snapshot oprettet')
        // Reload snapshots
        try {
          const data = await getCalculationSnapshots(calculation.id)
          setSnapshots(data)
        } catch {
          toast.error('Kunne ikke genindlæse snapshots')
        }
        setIsExpanded(true)
      } else {
        toast.error(result.error || 'Kunne ikke oprette snapshot')
      }
    } catch {
      toast.error('Fejl ved oprettelse af snapshot')
    } finally {
      setIsCreating(false)
    }
  }

  const riskBadge = (level: string | null) => {
    if (!level) return null
    const config: Record<string, { label: string; className: string }> = {
      low: { label: 'Lav risiko', className: 'bg-green-100 text-green-700' },
      medium: { label: 'Medium risiko', className: 'bg-yellow-100 text-yellow-700' },
      high: { label: 'Høj risiko', className: 'bg-red-100 text-red-700' },
    }
    const c = config[level]
    if (!c) return null
    return <Badge className={c.className}>{c.label}</Badge>
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <History className="w-4 h-4" />
          Snapshots ({snapshots.length})
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreateSnapshot}
          disabled={isCreating}
        >
          {isCreating ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Camera className="w-3 h-3 mr-1" />
          )}
          Gem snapshot
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          </div>
        ) : snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Ingen snapshots endnu. Gem et snapshot for at tracke ændringer over tid.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Show latest */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Seneste: v{snapshots[0].version}
              </span>
              <span className="font-medium">{formatCurrency(snapshots[0].total_price)}</span>
            </div>
            {snapshots.length > 1 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {isExpanded ? 'Skjul historik' : `Se alle ${snapshots.length} versioner`}
              </button>
            )}
            {isExpanded && (
              <div className="space-y-2 pt-2 border-t">
                {snapshots.map((snap) => (
                  <div key={snap.id} className="bg-gray-50 rounded p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Version {snap.version}</span>
                      <span className="text-gray-400">
                        {new Date(snap.created_at).toLocaleDateString('da-DK')}
                      </span>
                    </div>
                    {snap.snapshot_reason && (
                      <p className="text-gray-500">{snap.snapshot_reason}</p>
                    )}
                    <div className="grid grid-cols-2 gap-1">
                      <span className="text-gray-500">Pris:</span>
                      <span className="text-right font-medium">{formatCurrency(snap.total_price)}</span>
                      <span className="text-gray-500">Margin:</span>
                      <span className="text-right">{snap.margin_percentage.toFixed(1)}%</span>
                      <span className="text-gray-500">Komponenter:</span>
                      <span className="text-right">{snap.component_count}</span>
                    </div>
                    {riskBadge(snap.risk_level)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
