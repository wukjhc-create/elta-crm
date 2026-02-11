'use client'

import {
  Clock,
  Package,
  Wrench,
  DollarSign,
  TrendingUp,
  Percent,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { CalculationResult } from '@/types/kalkia.types'
import { formatCurrency } from '@/lib/utils/format'

interface KalkiaCalculationBreakdownProps {
  result: CalculationResult
  showDetails?: boolean
}

export function KalkiaCalculationBreakdown({
  result,
  showDetails = true,
}: KalkiaCalculationBreakdownProps) {
  const formatAmount = (amount: number) => formatCurrency(amount, 'DKK', 2)

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours === 0) return `${minutes} min`
    if (minutes === 0) return `${hours} timer`
    return `${hours}t ${minutes}m`
  }

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`
  }

  return (
    <div className="space-y-4">
      {/* Time Breakdown */}
      {showDetails && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              Tidsopgoerelse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Direkte tid</span>
              <span>{formatTime(result.totalDirectTimeSeconds)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                Indirekte tid ({formatPercent(result.factorsUsed.indirectTimeFactor * 100)})
              </span>
              <span>{formatTime(result.totalIndirectTimeSeconds)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                Personlig tid ({formatPercent(result.factorsUsed.personalTimeFactor * 100)})
              </span>
              <span>{formatTime(result.totalPersonalTimeSeconds)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Total arbejdstid</span>
              <span>{formatTime(result.totalLaborTimeSeconds)}</span>
            </div>
            <div className="text-xs text-gray-500 text-right">
              = {result.totalLaborHours.toFixed(2)} timer
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost Breakdown */}
      {showDetails && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-green-600" />
              Omkostningsopgoerelse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Materialer</span>
              <span>{formatAmount(result.totalMaterialCost)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                Materialespild ({formatPercent(result.factorsUsed.materialWasteFactor * 100)})
              </span>
              <span>{formatAmount(result.totalMaterialWaste)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Arbejdslon</span>
              <span>{formatAmount(result.totalLaborCost)}</span>
            </div>
            {result.totalOtherCosts > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Ovrige omkostninger</span>
                <span>{formatAmount(result.totalOtherCosts)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Kostpris</span>
              <span>{formatAmount(result.costPrice)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-purple-600" />
            Prissaetning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Kostpris</span>
            <span>{formatAmount(result.costPrice)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">
              Overhead ({formatPercent(result.factorsUsed.overheadFactor * 100)})
            </span>
            <span>{formatAmount(result.overheadAmount)}</span>
          </div>
          {result.riskAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Risikotillaeg</span>
              <span>{formatAmount(result.riskAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-medium">
            <span>Salgsgrundlag</span>
            <span>{formatAmount(result.salesBasis)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Avance</span>
            <span>{formatAmount(result.marginAmount)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Salgspris (ekskl. moms)</span>
            <span>{formatAmount(result.salePriceExclVat)}</span>
          </div>
          {result.discountAmount > 0 && (
            <div className="flex justify-between text-sm text-red-600">
              <span>Rabat</span>
              <span>-{formatAmount(result.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Nettopris</span>
            <span className="font-medium">{formatAmount(result.netPrice)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Moms (25%)</span>
            <span>{formatAmount(result.vatAmount)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-lg font-bold">
            <span>Total (inkl. moms)</span>
            <span className="text-green-600">{formatAmount(result.finalAmount)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            Noegletal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {formatAmount(result.dbAmount)}
              </div>
              <div className="text-xs text-gray-600">Daekningsbidrag</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {formatPercent(result.dbPercentage)}
              </div>
              <div className="text-xs text-gray-600">DB%</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {formatAmount(result.dbPerHour)}
              </div>
              <div className="text-xs text-gray-600">DB/time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {formatPercent(result.coverageRatio)}
              </div>
              <div className="text-xs text-gray-600">Daekningsgrad</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
