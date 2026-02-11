// =====================================================
// Calculation Utility Functions
// These are pure functions that can be used both client and server side
// =====================================================

import type { EnhancedROIData } from '@/types/calculations.types'

// Calculate ROI for any project type
export function calculateROI(
  investmentAmount: number,
  annualBenefit: number,
  projectLifeYears: number = 25
): EnhancedROIData {
  const paybackYears = annualBenefit > 0 ? investmentAmount / annualBenefit : 0
  const totalBenefit = annualBenefit * projectLifeYears
  const simpleROI = investmentAmount > 0
    ? ((totalBenefit - investmentAmount) / investmentAmount) * 100
    : 0

  return {
    investmentAmount,
    paybackYears,
    simpleROI,
    estimatedAnnualBenefit: annualBenefit,
    projectLifeYears,
  }
}

// Calculate solar-specific ROI
export function calculateSolarROI(
  investmentAmount: number,
  annualProduction: number,
  electricityPrice: number,
  selfConsumptionRate: number = 30
): EnhancedROIData {
  // Self-consumed electricity value (full retail price)
  const selfConsumedKwh = annualProduction * (selfConsumptionRate / 100)
  const exportedKwh = annualProduction - selfConsumedKwh

  // Self-consumed saves retail price, exported gets spot price (lower)
  const spotPrice = electricityPrice * 0.4
  const annualSavings = selfConsumedKwh * electricityPrice + exportedKwh * spotPrice

  // CO2 reduction: ~300g per kWh in Denmark
  const co2Reduction = annualProduction * 0.3

  // Calculate standard ROI metrics
  const baseROI = calculateROI(investmentAmount, annualSavings, 25)

  return {
    ...baseROI,
    annualProduction,
    selfConsumptionRate,
    annualSavings,
    totalSavings25Years: annualSavings * 25,
    co2Reduction,
  }
}

// Calculate electrician job quick estimate
export function calculateElectricianJob(
  hours: number,
  hourlyRate: number,
  materialsCost: number,
  materialsMarkup: number
): { laborTotal: number; materialsTotal: number; grandTotal: number } {
  const laborTotal = hours * hourlyRate
  const materialsTotal = materialsCost * (1 + materialsMarkup / 100)
  return {
    laborTotal,
    materialsTotal,
    grandTotal: laborTotal + materialsTotal,
  }
}

// Calculate contribution margin
export function calculateContributionMargin(
  revenue: number,
  variableCosts: number
): { contributionMargin: number; contributionMarginRatio: number } {
  const contributionMargin = revenue - variableCosts
  const contributionMarginRatio = revenue > 0 ? (contributionMargin / revenue) * 100 : 0
  return { contributionMargin, contributionMarginRatio }
}

// Calculate gross profit
export function calculateGrossProfit(
  revenue: number,
  totalCosts: number
): { grossProfit: number; grossProfitMargin: number } {
  const grossProfit = revenue - totalCosts
  const grossProfitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
  return { grossProfit, grossProfitMargin }
}

// Re-export centralized formatters for backward compatibility
export { formatCurrency as formatDKK, formatPercent } from '@/lib/utils/format'
