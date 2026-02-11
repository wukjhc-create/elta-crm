'use client'

import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, Sun, Zap, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { CalculationMode, EnhancedROIData } from '@/types/calculations.types'
import { formatCurrency } from '@/lib/utils/format'

interface ROICalculatorProps {
  mode: CalculationMode
  investmentAmount: number
  roiData?: EnhancedROIData | null
  onChange?: (data: EnhancedROIData) => void
  readOnly?: boolean
}

export default function ROICalculator({
  mode,
  investmentAmount,
  roiData,
  onChange,
  readOnly = false,
}: ROICalculatorProps) {
  // State for inputs
  const [annualBenefit, setAnnualBenefit] = useState<number>(roiData?.estimatedAnnualBenefit || 0)
  const [projectLifeYears, setProjectLifeYears] = useState<number>(
    roiData?.projectLifeYears || 25
  )

  // Solar-specific state
  const [annualProduction, setAnnualProduction] = useState<number>(
    roiData?.annualProduction || 0
  )
  const [electricityPrice, setElectricityPrice] = useState<number>(2.5) // DKK per kWh
  const [selfConsumptionRate, setSelfConsumptionRate] = useState<number>(
    roiData?.selfConsumptionRate || 30
  )

  // Calculate derived values
  const calculatedValues = useMemo(() => {
    const investment = investmentAmount || 0

    // For solar mode, calculate annual savings from production
    let calculatedAnnualBenefit = annualBenefit
    let annualSavings = 0
    let co2Reduction = 0

    if (mode === 'solar' && annualProduction > 0) {
      // Self-consumed electricity value (full retail price)
      const selfConsumedKwh = annualProduction * (selfConsumptionRate / 100)
      const exportedKwh = annualProduction - selfConsumedKwh

      // Self-consumed saves retail price, exported gets spot price (lower)
      const spotPrice = electricityPrice * 0.4 // Approximate spot vs retail
      annualSavings = selfConsumedKwh * electricityPrice + exportedKwh * spotPrice
      calculatedAnnualBenefit = annualSavings

      // CO2 reduction: ~300g per kWh in Denmark
      co2Reduction = annualProduction * 0.3
    }

    // Calculate payback and ROI
    const paybackYears =
      calculatedAnnualBenefit > 0 ? investment / calculatedAnnualBenefit : 0
    const totalBenefit = calculatedAnnualBenefit * projectLifeYears
    const simpleROI =
      investment > 0 ? ((totalBenefit - investment) / investment) * 100 : 0
    const totalSavings25Years = calculatedAnnualBenefit * 25

    return {
      paybackYears,
      simpleROI,
      annualSavings: mode === 'solar' ? annualSavings : calculatedAnnualBenefit,
      totalSavings25Years,
      co2Reduction,
      investmentAmount: investment,
      estimatedAnnualBenefit: calculatedAnnualBenefit,
      projectLifeYears,
      annualProduction: mode === 'solar' ? annualProduction : undefined,
      selfConsumptionRate: mode === 'solar' ? selfConsumptionRate : undefined,
    } as EnhancedROIData
  }, [
    mode,
    investmentAmount,
    annualBenefit,
    projectLifeYears,
    annualProduction,
    electricityPrice,
    selfConsumptionRate,
  ])

  // Notify parent of changes
  useEffect(() => {
    if (onChange && !readOnly) {
      onChange(calculatedValues)
    }
  }, [calculatedValues, onChange, readOnly])


  const formatNumber = (num: number, decimals = 1) => {
    return new Intl.NumberFormat('da-DK', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num)
  }

  // Don't render for standard mode unless there's data
  if (mode === 'standard' && !roiData) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {mode === 'solar' ? (
            <Sun className="w-5 h-5 text-yellow-500" />
          ) : mode === 'electrician' ? (
            <Zap className="w-5 h-5 text-blue-500" />
          ) : (
            <TrendingUp className="w-5 h-5" />
          )}
          {mode === 'solar' ? 'Solcelle ROI' : 'Investeringsanalyse'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Investment amount (from calculation) */}
        <div className="bg-gray-50 rounded-lg p-3">
          <Label className="text-xs text-gray-500">Investeringsbeløb</Label>
          <div className="text-lg font-bold">{formatCurrency(investmentAmount)}</div>
        </div>

        {/* Solar-specific inputs */}
        {mode === 'solar' && !readOnly && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="annualProduction" className="text-sm">
                Årlig produktion (kWh)
              </Label>
              <Input
                id="annualProduction"
                type="number"
                min="0"
                value={annualProduction || ''}
                onChange={(e) => setAnnualProduction(Number(e.target.value) || 0)}
                placeholder="f.eks. 8000"
              />
            </div>
            <div>
              <Label htmlFor="selfConsumption" className="text-sm">
                Egetforbrug (%)
              </Label>
              <Input
                id="selfConsumption"
                type="number"
                min="0"
                max="100"
                value={selfConsumptionRate || ''}
                onChange={(e) => setSelfConsumptionRate(Number(e.target.value) || 0)}
                placeholder="f.eks. 30"
              />
            </div>
            <div>
              <Label htmlFor="electricityPrice" className="text-sm">
                Elpris (DKK/kWh)
              </Label>
              <Input
                id="electricityPrice"
                type="number"
                min="0"
                step="0.1"
                value={electricityPrice || ''}
                onChange={(e) => setElectricityPrice(Number(e.target.value) || 0)}
                placeholder="f.eks. 2.5"
              />
            </div>
          </div>
        )}

        {/* General inputs for non-solar */}
        {mode !== 'solar' && !readOnly && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="annualBenefit" className="text-sm">
                Årlig besparelse/fordel (DKK)
              </Label>
              <Input
                id="annualBenefit"
                type="number"
                min="0"
                value={annualBenefit || ''}
                onChange={(e) => setAnnualBenefit(Number(e.target.value) || 0)}
                placeholder="f.eks. 10000"
              />
            </div>
            <div>
              <Label htmlFor="projectLife" className="text-sm">
                Projektlevetid (år)
              </Label>
              <Input
                id="projectLife"
                type="number"
                min="1"
                max="50"
                value={projectLifeYears || ''}
                onChange={(e) => setProjectLifeYears(Number(e.target.value) || 25)}
                placeholder="f.eks. 25"
              />
            </div>
          </div>
        )}

        {/* Results */}
        <div className="border-t pt-4 space-y-3">
          {/* Payback Period */}
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Tilbagebetalingstid</span>
            <Badge
              variant={
                calculatedValues.paybackYears > 0 && calculatedValues.paybackYears <= 10
                  ? 'default'
                  : calculatedValues.paybackYears <= 15
                    ? 'secondary'
                    : 'outline'
              }
              className={cn(
                calculatedValues.paybackYears > 0 && calculatedValues.paybackYears <= 10
                  ? 'bg-green-500'
                  : ''
              )}
            >
              {calculatedValues.paybackYears > 0
                ? `${formatNumber(calculatedValues.paybackYears)} år`
                : 'N/A'}
            </Badge>
          </div>

          {/* Annual Savings */}
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Årlig besparelse</span>
            <span className="font-medium text-green-600">
              {formatCurrency(calculatedValues.annualSavings || 0)}
            </span>
          </div>

          {/* 25 Year Total */}
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Total besparelse (25 år)</span>
            <span className="font-medium">{formatCurrency(calculatedValues.totalSavings25Years || 0)}</span>
          </div>

          {/* ROI */}
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Simpel ROI</span>
            <Badge
              variant={calculatedValues.simpleROI > 0 ? 'default' : 'outline'}
              className={cn(
                calculatedValues.simpleROI > 100
                  ? 'bg-green-500'
                  : calculatedValues.simpleROI <= 0
                    ? 'text-red-600 border-red-300'
                    : ''
              )}
            >
              {formatNumber(calculatedValues.simpleROI, 0)}%
            </Badge>
          </div>

          {/* CO2 Reduction (Solar only) */}
          {mode === 'solar' && (calculatedValues.co2Reduction || 0) > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 flex items-center gap-1">
                <Info className="w-3 h-3" />
                CO2 reduktion/år
              </span>
              <span className="text-green-600">
                {formatNumber(calculatedValues.co2Reduction || 0, 0)} kg
              </span>
            </div>
          )}
        </div>

        {/* Visual indicator */}
        {calculatedValues.paybackYears > 0 && (
          <div className="pt-2">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  calculatedValues.paybackYears <= 8
                    ? 'bg-green-500'
                    : calculatedValues.paybackYears <= 12
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                )}
                style={{
                  width: `${Math.min(100, (1 / calculatedValues.paybackYears) * 100)}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Hurtigt</span>
              <span>Langsomt</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
