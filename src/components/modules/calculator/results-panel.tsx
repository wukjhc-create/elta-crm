'use client'

import {
  Sun,
  Zap,
  TrendingUp,
  Leaf,
  Calculator,
  PiggyBank,
  Clock,
  BarChart3,
} from 'lucide-react'
import { type CalculatorResults } from '@/types/calculator.types'
import { formatCurrency, formatNumber } from '@/lib/utils/format'

interface ResultsPanelProps {
  results: CalculatorResults
}

export function ResultsPanel({ results }: ResultsPanelProps) {
  return (
    <div className="space-y-6">
      {/* System Overview */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-4">
          <div className="flex items-center gap-2 text-cyan-700 mb-1">
            <Sun className="w-4 h-4" />
            <span className="text-sm font-medium">Anlægsstørrelse</span>
          </div>
          <p className="text-2xl font-bold text-cyan-900">{results.systemSize} kWp</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-700 mb-1">
            <Zap className="w-4 h-4" />
            <span className="text-sm font-medium">Årlig produktion</span>
          </div>
          <p className="text-2xl font-bold text-amber-900">
            {formatNumber(results.annualProduction)} kWh
          </p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <PiggyBank className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <p className="text-xs text-green-700 mb-1">Årlig besparelse</p>
          <p className="text-lg font-bold text-green-900">
            {formatCurrency(results.annualSavings)}
          </p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
          <p className="text-xs text-blue-700 mb-1">Tilbagebetalingstid</p>
          <p className="text-lg font-bold text-blue-900">{results.paybackYears} år</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 text-center">
          <Leaf className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
          <p className="text-xs text-emerald-700 mb-1">CO2 besparelse/år</p>
          <p className="text-lg font-bold text-emerald-900">
            {formatNumber(results.co2SavingsPerYear)} kg
          </p>
        </div>
      </div>

      {/* Savings Breakdown */}
      <div className="bg-white rounded-lg border p-4">
        <h4 className="font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-600" />
          Besparelser (første år)
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Egetforbrug besparelse</span>
            <span className="font-medium">{formatCurrency(results.selfConsumptionSavings)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Salg til net</span>
            <span className="font-medium">{formatCurrency(results.feedInIncome)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Total årlig besparelse</span>
            <span className="text-green-600">{formatCurrency(results.annualSavings)}</span>
          </div>
        </div>
      </div>

      {/* Cost Breakdown */}
      <div className="bg-white rounded-lg border p-4">
        <h4 className="font-semibold mb-3 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-purple-600" />
          Prisspecifikation
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Solpaneler</span>
            <span>{formatCurrency(results.panelsCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Inverter</span>
            <span>{formatCurrency(results.inverterCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Montering</span>
            <span>{formatCurrency(results.mountingCost)}</span>
          </div>
          {results.batteryCost > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Batteri</span>
              <span>{formatCurrency(results.batteryCost)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Arbejdsløn</span>
            <span>{formatCurrency(results.laborCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Installation</span>
            <span>{formatCurrency(results.installationCost)}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(results.subtotal)}</span>
          </div>
          {results.margin > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avance</span>
              <span>{formatCurrency(results.margin)}</span>
            </div>
          )}
          {results.discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Rabat</span>
              <span>-{formatCurrency(results.discount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Før moms</span>
            <span>{formatCurrency(results.totalBeforeVat)}</span>
          </div>
          {results.vat > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Moms (25%)</span>
              <span>{formatCurrency(results.vat)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 font-bold text-lg">
            <span>Totalpris</span>
            <span className="text-purple-700">{formatCurrency(results.totalPrice)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Pris per Wp</span>
            <span>{results.pricePerWp.toLocaleString('da-DK')} kr/Wp</span>
          </div>
        </div>
      </div>

      {/* ROI */}
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border p-4">
        <h4 className="font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-purple-600" />
          Investering over 25 år
        </h4>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Tilbagebetalingstid</span>
              <span className="font-semibold">{results.paybackYears} år</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 rounded-full h-2 transition-all"
                style={{ width: `${Math.min((results.paybackYears / 25) * 100, 100)}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total besparelse (25 år)</span>
              <p className="font-bold text-lg text-green-600">
                {formatCurrency(
                  results.yearlyProjections[results.yearlyProjections.length - 1].cumulativeSavings
                )}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Afkast (ROI)</span>
              <p className="font-bold text-lg text-purple-600">{results.roi25Years}%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
