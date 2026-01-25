import {
  PANEL_TYPES,
  INVERTER_TYPES,
  MOUNTING_TYPES,
  BATTERY_OPTIONS,
  CALCULATOR_CONSTANTS,
  type CalculatorInput,
  type CalculatorResults,
  type CalculatorTemplate,
  type YearlyProjection,
} from '@/types/calculator.types'

export function calculateSolarSystem(input: CalculatorInput): CalculatorResults {
  const panel = PANEL_TYPES.find((p) => p.id === input.panelType)!
  const inverter = INVERTER_TYPES.find((i) => i.id === input.inverterType)!
  const mounting = MOUNTING_TYPES.find((m) => m.id === input.mountingType)!
  const battery = BATTERY_OPTIONS.find((b) => b.id === input.batteryOption)!
  const constants = CALCULATOR_CONSTANTS

  // System specifications
  const systemSize = (panel.wattage * input.panelCount) / 1000 // kWp
  const baseAnnualProduction =
    systemSize * constants.annualSunHours * panel.efficiency * inverter.efficiency * 1000 // kWh

  // Cost calculations
  const panelsCost = panel.price * input.panelCount
  const inverterCost = inverter.price
  const mountingCost = mounting.pricePerPanel * input.panelCount
  const batteryCost = battery.price
  const laborHours = mounting.laborHoursPerPanel * input.panelCount
  const laborCost = laborHours * constants.laborCostPerHour
  const installationCost = constants.baseInstallationCost

  const subtotal =
    panelsCost + inverterCost + mountingCost + batteryCost + laborCost + installationCost

  const marginAmount = subtotal * input.margin
  const discountAmount = (subtotal + marginAmount) * input.discount
  const totalBeforeVat = subtotal + marginAmount - discountAmount
  const vatAmount = input.includeVat ? totalBeforeVat * constants.vatRate : 0
  const totalPrice = totalBeforeVat + vatAmount
  const pricePerWp = totalPrice / (systemSize * 1000)

  // Self-consumption ratio based on battery
  const selfConsumptionRatio =
    battery.capacity > 0
      ? constants.selfConsumptionRatioWithBattery
      : constants.selfConsumptionRatio

  // Calculate yearly projections
  const yearlyProjections: YearlyProjection[] = []
  let cumulativeSavings = 0

  for (let year = 1; year <= constants.systemLifetime; year++) {
    // Production degrades each year
    const degradationFactor = Math.pow(1 - constants.annualDegradation, year - 1)
    const production = baseAnnualProduction * degradationFactor

    // Electricity price increases each year
    const electricityPrice =
      constants.electricityPrice * Math.pow(1 + constants.electricityPriceIncrease, year - 1)

    // Savings calculation
    const selfConsumed = production * selfConsumptionRatio
    const exported = production * (1 - selfConsumptionRatio)
    const selfConsumptionSavings = selfConsumed * electricityPrice
    const feedInIncome = exported * constants.feedInTariff
    const yearSavings = selfConsumptionSavings + feedInIncome

    cumulativeSavings += yearSavings

    // System value (depreciated linearly)
    const systemValue = totalPrice * (1 - year / constants.systemLifetime)

    yearlyProjections.push({
      year,
      production: Math.round(production),
      savings: Math.round(yearSavings),
      cumulativeSavings: Math.round(cumulativeSavings),
      systemValue: Math.round(systemValue),
    })
  }

  // First year values
  const firstYear = yearlyProjections[0]
  const annualProduction = firstYear.production
  const annualSavings = firstYear.savings

  // Split savings for display
  const selfConsumed = annualProduction * selfConsumptionRatio
  const exported = annualProduction * (1 - selfConsumptionRatio)
  const selfConsumptionSavings = selfConsumed * constants.electricityPrice
  const feedInIncome = exported * constants.feedInTariff

  // ROI calculations
  const paybackYears =
    yearlyProjections.findIndex((p) => p.cumulativeSavings >= totalPrice) + 1 || constants.systemLifetime
  const roi25Years =
    ((yearlyProjections[constants.systemLifetime - 1].cumulativeSavings - totalPrice) / totalPrice) * 100

  // CO2 savings (approx 0.4 kg CO2 per kWh in Denmark)
  const co2SavingsPerYear = annualProduction * 0.4

  return {
    systemSize: Math.round(systemSize * 100) / 100,
    annualProduction: Math.round(annualProduction),
    panelsCost,
    inverterCost,
    mountingCost,
    batteryCost,
    laborCost: Math.round(laborCost),
    installationCost,
    subtotal,
    margin: Math.round(marginAmount),
    discount: Math.round(discountAmount),
    totalBeforeVat: Math.round(totalBeforeVat),
    vat: Math.round(vatAmount),
    totalPrice: Math.round(totalPrice),
    pricePerWp: Math.round(pricePerWp * 100) / 100,
    annualSavings: Math.round(annualSavings),
    selfConsumptionSavings: Math.round(selfConsumptionSavings),
    feedInIncome: Math.round(feedInIncome),
    paybackYears,
    roi25Years: Math.round(roi25Years),
    co2SavingsPerYear: Math.round(co2SavingsPerYear),
    yearlyProjections,
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('da-DK').format(num)
}

// Helper function to convert template to calculator input
export function templateToInput(template: CalculatorTemplate): CalculatorInput {
  return template.template_data.config
}
