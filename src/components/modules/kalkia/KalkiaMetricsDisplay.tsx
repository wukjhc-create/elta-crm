'use client'

import {
  TrendingUp,
  Clock,
  DollarSign,
  Percent,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface KalkiaMetricsDisplayProps {
  dbAmount: number
  dbPercentage: number
  dbPerHour: number
  coverageRatio: number
  totalLaborHours?: number
  finalAmount?: number
  compact?: boolean
}

export function KalkiaMetricsDisplay({
  dbAmount,
  dbPercentage,
  dbPerHour,
  coverageRatio,
  totalLaborHours,
  finalAmount,
  compact = false,
}: KalkiaMetricsDisplayProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`
  }

  const getDBStatus = (percentage: number): { color: string; icon: React.ElementType; label: string } => {
    if (percentage >= 35) return { color: 'text-green-600', icon: ArrowUp, label: 'Godt' }
    if (percentage >= 25) return { color: 'text-yellow-600', icon: Minus, label: 'OK' }
    return { color: 'text-red-600', icon: ArrowDown, label: 'Lavt' }
  }

  const getDBHourStatus = (dbHour: number): { color: string; icon: React.ElementType; label: string } => {
    if (dbHour >= 300) return { color: 'text-green-600', icon: ArrowUp, label: 'Godt' }
    if (dbHour >= 200) return { color: 'text-yellow-600', icon: Minus, label: 'OK' }
    return { color: 'text-red-600', icon: ArrowDown, label: 'Lavt' }
  }

  const dbStatus = getDBStatus(dbPercentage)
  const dbHourStatus = getDBHourStatus(dbPerHour)

  if (compact) {
    return (
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1">
          <span className="text-gray-500">DB:</span>
          <span className={cn('font-medium', dbStatus.color)}>
            {formatPercent(dbPercentage)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">DB/t:</span>
          <span className={cn('font-medium', dbHourStatus.color)}>
            {formatCurrency(dbPerHour)}
          </span>
        </div>
        {finalAmount !== undefined && (
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Total:</span>
            <span className="font-bold text-green-600">
              {formatCurrency(finalAmount)}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* DB Amount */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            Daekningsbidrag
          </div>
          <div className={cn('text-2xl font-bold', dbStatus.color)}>
            {formatCurrency(dbAmount)}
          </div>
          <div className="flex items-center gap-1 mt-1">
            <dbStatus.icon className={cn('w-3 h-3', dbStatus.color)} />
            <span className={cn('text-xs', dbStatus.color)}>{dbStatus.label}</span>
          </div>
        </CardContent>
      </Card>

      {/* DB Percentage */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Percent className="w-4 h-4" />
            DB%
          </div>
          <div className={cn('text-2xl font-bold', dbStatus.color)}>
            {formatPercent(dbPercentage)}
          </div>
          <div className="h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                dbPercentage >= 35 ? 'bg-green-500' :
                dbPercentage >= 25 ? 'bg-yellow-500' : 'bg-red-500'
              )}
              style={{ width: `${Math.min(dbPercentage, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* DB per Hour */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Clock className="w-4 h-4" />
            DB/time
          </div>
          <div className={cn('text-2xl font-bold', dbHourStatus.color)}>
            {formatCurrency(dbPerHour)}
          </div>
          <div className="flex items-center gap-1 mt-1">
            <dbHourStatus.icon className={cn('w-3 h-3', dbHourStatus.color)} />
            <span className={cn('text-xs', dbHourStatus.color)}>{dbHourStatus.label}</span>
          </div>
        </CardContent>
      </Card>

      {/* Coverage Ratio or Total */}
      <Card>
        <CardContent className="pt-4">
          {finalAmount !== undefined ? (
            <>
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <TrendingUp className="w-4 h-4" />
                Total (inkl. moms)
              </div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(finalAmount)}
              </div>
              {totalLaborHours !== undefined && (
                <div className="text-xs text-gray-500 mt-1">
                  {totalLaborHours.toFixed(1)} timer arbejde
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <TrendingUp className="w-4 h-4" />
                Daekningsgrad
              </div>
              <div className={cn('text-2xl font-bold', dbStatus.color)}>
                {formatPercent(coverageRatio)}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
