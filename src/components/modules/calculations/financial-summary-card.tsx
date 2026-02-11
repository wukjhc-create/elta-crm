'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Package,
  Clock,
  Truck,
  TrendingUp,
  Percent,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Calculation } from '@/types/calculations.types'
import { formatCurrency } from '@/lib/utils/format'

interface FinancialSummaryCardProps {
  calculation: Calculation
  showInternalView?: boolean
}

export default function FinancialSummaryCard({
  calculation,
  showInternalView = false,
}: FinancialSummaryCardProps) {
  const [showCostDetails, setShowCostDetails] = useState(false)
  const [showMarginDetails, setShowMarginDetails] = useState(false)


  const formatPercent = (value: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value / 100)
  }

  const totalCosts =
    (calculation.total_materials_cost || 0) +
    (calculation.total_labor_cost || 0) +
    (calculation.total_other_costs || 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Finansiel oversigt
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cost Breakdown (Internal view only) */}
        {showInternalView && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowCostDetails(!showCostDetails)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-medium text-gray-700">Omkostninger</span>
              {showCostDetails ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {showCostDetails && (
              <div className="pl-2 space-y-2 border-l-2 border-gray-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-500">
                    <Package className="w-4 h-4" />
                    Materialer
                  </span>
                  <span>{formatCurrency(calculation.total_materials_cost || 0)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-500">
                    <Clock className="w-4 h-4" />
                    Arbejdslon
                  </span>
                  <span>{formatCurrency(calculation.total_labor_cost || 0)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-500">
                    <Truck className="w-4 h-4" />
                    Andet
                  </span>
                  <span>{formatCurrency(calculation.total_other_costs || 0)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium border-t pt-2">
                  <span className="text-gray-700">Total omkostninger</span>
                  <span>{formatCurrency(totalCosts)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Subtotal */}
        <div className="flex justify-between">
          <span className="text-gray-500">Subtotal (ekskl. moms)</span>
          <span className="font-medium">{formatCurrency(calculation.subtotal)}</span>
        </div>

        {/* Margin Details (Internal view only) */}
        {showInternalView && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowMarginDetails(!showMarginDetails)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-medium text-gray-700">Avance analyse</span>
              {showMarginDetails ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {showMarginDetails && (
              <div className="pl-2 space-y-2 border-l-2 border-gray-100">
                {/* Variable vs Fixed Costs */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Variable omkostninger</span>
                  <span>{formatCurrency(calculation.total_variable_costs || 0)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Faste omkostninger</span>
                  <span>{formatCurrency(calculation.total_fixed_costs || 0)}</span>
                </div>

                {/* Contribution Margin */}
                <div className="flex items-center justify-between text-sm border-t pt-2">
                  <span className="flex items-center gap-2 text-gray-700">
                    <Percent className="w-4 h-4" />
                    Dækningsbidrag
                  </span>
                  <div className="text-right">
                    <span className="font-medium">
                      {formatCurrency(calculation.contribution_margin || 0)}
                    </span>
                    <Badge variant="outline" className="ml-2 text-xs">
                      {formatPercent(calculation.contribution_margin_ratio || 0)}
                    </Badge>
                  </div>
                </div>

                {/* Gross Profit */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">Bruttofortjeneste</span>
                  <div className="text-right">
                    <span
                      className={cn(
                        'font-medium',
                        (calculation.gross_profit || 0) >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      )}
                    >
                      {formatCurrency(calculation.gross_profit || 0)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'ml-2 text-xs',
                        (calculation.gross_profit_margin || 0) >= 0
                          ? 'text-green-600 border-green-300'
                          : 'text-red-600 border-red-300'
                      )}
                    >
                      {formatPercent(calculation.gross_profit_margin || 0)}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Margin */}
        {calculation.margin_percentage > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Avance ({calculation.margin_percentage}%)</span>
            <span className="text-green-600">+{formatCurrency(calculation.margin_amount)}</span>
          </div>
        )}

        {/* Discount */}
        {calculation.discount_percentage > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Rabat ({calculation.discount_percentage}%)</span>
            <span className="text-red-600">-{formatCurrency(calculation.discount_amount)}</span>
          </div>
        )}

        {/* Tax */}
        <div className="flex justify-between border-t pt-2">
          <span className="text-gray-500">Moms ({calculation.tax_percentage}%)</span>
          <span>{formatCurrency(calculation.tax_amount)}</span>
        </div>

        {/* Final Amount */}
        <div className="flex justify-between border-t pt-2 text-lg font-bold">
          <span>Total inkl. moms</span>
          <span>{formatCurrency(calculation.final_amount)}</span>
        </div>

        {/* Quick Stats for Internal View */}
        {showInternalView && totalCosts > 0 && (
          <div className="grid grid-cols-2 gap-2 pt-4 border-t">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">DB ratio</div>
              <div className="text-lg font-bold text-blue-600">
                {formatPercent(calculation.contribution_margin_ratio || 0)}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Bruttomargin</div>
              <div
                className={cn(
                  'text-lg font-bold',
                  (calculation.gross_profit_margin || 0) >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                )}
              >
                {formatPercent(calculation.gross_profit_margin || 0)}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
