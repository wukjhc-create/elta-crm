// Panel types
export const PANEL_TYPES = [
  {
    id: 'standard',
    name: 'Standard (400W)',
    wattage: 400,
    price: 1200,
    efficiency: 0.20,
  },
  {
    id: 'premium',
    name: 'Premium (450W)',
    wattage: 450,
    price: 1600,
    efficiency: 0.22,
  },
  {
    id: 'high_efficiency',
    name: 'High Efficiency (500W)',
    wattage: 500,
    price: 2200,
    efficiency: 0.24,
  },
] as const

export type PanelTypeId = (typeof PANEL_TYPES)[number]['id']

// Inverter types
export const INVERTER_TYPES = [
  {
    id: 'string_small',
    name: 'String Inverter 3kW',
    capacity: 3,
    price: 8000,
    efficiency: 0.97,
  },
  {
    id: 'string_medium',
    name: 'String Inverter 5kW',
    capacity: 5,
    price: 12000,
    efficiency: 0.97,
  },
  {
    id: 'string_large',
    name: 'String Inverter 8kW',
    capacity: 8,
    price: 18000,
    efficiency: 0.97,
  },
  {
    id: 'string_xl',
    name: 'String Inverter 10kW',
    capacity: 10,
    price: 22000,
    efficiency: 0.97,
  },
  {
    id: 'hybrid_small',
    name: 'Hybrid Inverter 5kW',
    capacity: 5,
    price: 18000,
    efficiency: 0.96,
  },
  {
    id: 'hybrid_large',
    name: 'Hybrid Inverter 10kW',
    capacity: 10,
    price: 32000,
    efficiency: 0.96,
  },
] as const

export type InverterTypeId = (typeof INVERTER_TYPES)[number]['id']

// Mounting types
export const MOUNTING_TYPES = [
  {
    id: 'roof_tile',
    name: 'Tegltag',
    pricePerPanel: 400,
    laborHoursPerPanel: 0.5,
  },
  {
    id: 'roof_flat',
    name: 'Fladt tag',
    pricePerPanel: 600,
    laborHoursPerPanel: 0.6,
  },
  {
    id: 'roof_metal',
    name: 'Metaltag',
    pricePerPanel: 350,
    laborHoursPerPanel: 0.4,
  },
  {
    id: 'ground',
    name: 'Jordmontering',
    pricePerPanel: 800,
    laborHoursPerPanel: 0.8,
  },
] as const

export type MountingTypeId = (typeof MOUNTING_TYPES)[number]['id']

// Battery options
export const BATTERY_OPTIONS = [
  {
    id: 'none',
    name: 'Ingen batteri',
    capacity: 0,
    price: 0,
  },
  {
    id: 'small',
    name: '5 kWh batteri',
    capacity: 5,
    price: 35000,
  },
  {
    id: 'medium',
    name: '10 kWh batteri',
    capacity: 10,
    price: 60000,
  },
  {
    id: 'large',
    name: '15 kWh batteri',
    capacity: 15,
    price: 85000,
  },
] as const

export type BatteryOptionId = (typeof BATTERY_OPTIONS)[number]['id']

// Constants for calculations
export const CALCULATOR_CONSTANTS = {
  // Denmark average sun hours per year
  annualSunHours: 1000,
  // System degradation per year (%)
  annualDegradation: 0.005,
  // Current electricity price (DKK/kWh)
  electricityPrice: 2.5,
  // Expected electricity price increase per year (%)
  electricityPriceIncrease: 0.03,
  // Feed-in tariff (DKK/kWh) - what you get paid for excess
  feedInTariff: 0.8,
  // Self-consumption ratio (typical for residential without battery)
  selfConsumptionRatio: 0.3,
  // Self-consumption ratio with battery
  selfConsumptionRatioWithBattery: 0.7,
  // Labor cost per hour (DKK)
  laborCostPerHour: 450,
  // Base installation cost (electrical work, permits, etc.)
  baseInstallationCost: 15000,
  // VAT rate
  vatRate: 0.25,
  // System lifetime (years)
  systemLifetime: 25,
  // Margin percentage (default)
  defaultMargin: 0.25,
}

// Calculator input
export interface CalculatorInput {
  // System configuration
  panelType: PanelTypeId
  panelCount: number
  inverterType: InverterTypeId
  mountingType: MountingTypeId
  batteryOption: BatteryOptionId

  // Customer info
  annualConsumption: number // kWh

  // Pricing
  margin: number // percentage as decimal (0.25 = 25%)
  discount: number // percentage as decimal

  // Options
  includeVat: boolean
}

// Calculator results
export interface CalculatorResults {
  // System specs
  systemSize: number // kWp
  annualProduction: number // kWh

  // Costs breakdown
  panelsCost: number
  inverterCost: number
  mountingCost: number
  batteryCost: number
  laborCost: number
  installationCost: number
  subtotal: number
  margin: number
  discount: number
  totalBeforeVat: number
  vat: number
  totalPrice: number
  pricePerWp: number

  // Savings
  annualSavings: number
  selfConsumptionSavings: number
  feedInIncome: number

  // ROI
  paybackYears: number
  roi25Years: number
  co2SavingsPerYear: number

  // Yearly projections (25 years)
  yearlyProjections: YearlyProjection[]
}

export interface YearlyProjection {
  year: number
  production: number
  savings: number
  cumulativeSavings: number
  systemValue: number
}

// Calculator labels in Danish
export const CALCULATOR_LABELS = {
  panelType: 'Paneltype',
  panelCount: 'Antal paneler',
  inverterType: 'Inverter',
  mountingType: 'Monteringstype',
  batteryOption: 'Batteri',
  annualConsumption: 'Årligt elforbrug (kWh)',
  margin: 'Avance (%)',
  discount: 'Rabat (%)',
  includeVat: 'Inkl. moms',
}

// Template data stored in JSONB
export interface TemplateData {
  config: CalculatorInput
  systemSize: number
  totalPrice: number
}

// Calculator template (matches DB structure with JSONB)
export interface CalculatorTemplate {
  id: string
  name: string
  description: string | null
  template_data: TemplateData
  is_default?: boolean | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface CreateTemplateInput {
  name: string
  description?: string
  config: CalculatorInput
  systemSize: number
  totalPrice: number
}

// TemplateWithCreator is same as CalculatorTemplate
export type TemplateWithCreator = CalculatorTemplate
