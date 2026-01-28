/**
 * Solar Products Types
 * Database-driven solar component catalog and assumptions
 */

// =============================================================================
// PRODUCT TYPES
// =============================================================================

export const SOLAR_PRODUCT_TYPES = ['panel', 'inverter', 'battery', 'mounting'] as const
export type SolarProductType = (typeof SOLAR_PRODUCT_TYPES)[number]

export const SOLAR_PRODUCT_TYPE_LABELS: Record<SolarProductType, string> = {
  panel: 'Solpaneler',
  inverter: 'Invertere',
  battery: 'Batterier',
  mounting: 'Montering',
}

// =============================================================================
// SPECIFICATION INTERFACES
// =============================================================================

export interface PanelSpecs {
  wattage: number // Watts per panel
  efficiency: number // Decimal (0.20 = 20%)
  [key: string]: unknown
}

export interface InverterSpecs {
  capacity: number // kW
  efficiency: number // Decimal (0.97 = 97%)
  inverter_type: 'string' | 'hybrid'
  [key: string]: unknown
}

export interface BatterySpecs {
  capacity: number // kWh
  [key: string]: unknown
}

export interface MountingSpecs {
  price_per_panel: number // DKK per panel
  labor_hours_per_panel: number // Hours per panel for installation
  [key: string]: unknown
}

// Type guard helpers
export function isPanelSpecs(specs: unknown): specs is PanelSpecs {
  return (
    typeof specs === 'object' &&
    specs !== null &&
    'wattage' in specs &&
    'efficiency' in specs
  )
}

export function isInverterSpecs(specs: unknown): specs is InverterSpecs {
  return (
    typeof specs === 'object' &&
    specs !== null &&
    'capacity' in specs &&
    'efficiency' in specs &&
    'inverter_type' in specs
  )
}

export function isBatterySpecs(specs: unknown): specs is BatterySpecs {
  return (
    typeof specs === 'object' &&
    specs !== null &&
    'capacity' in specs
  )
}

export function isMountingSpecs(specs: unknown): specs is MountingSpecs {
  return (
    typeof specs === 'object' &&
    specs !== null &&
    'price_per_panel' in specs &&
    'labor_hours_per_panel' in specs
  )
}

// =============================================================================
// PRODUCT INTERFACES
// =============================================================================

export interface SolarProduct {
  id: string
  product_type: SolarProductType
  code: string
  name: string
  description: string | null
  price: number
  is_active: boolean
  sort_order: number
  specifications: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

// Typed product variants for type-safe access
export interface PanelProduct extends SolarProduct {
  product_type: 'panel'
  specifications: PanelSpecs
}

export interface InverterProduct extends SolarProduct {
  product_type: 'inverter'
  specifications: InverterSpecs
}

export interface BatteryProduct extends SolarProduct {
  product_type: 'battery'
  specifications: BatterySpecs
}

export interface MountingProduct extends SolarProduct {
  product_type: 'mounting'
  specifications: MountingSpecs
}

// Helper to cast products with type safety
export function asPanelProduct(product: SolarProduct): PanelProduct | null {
  if (product.product_type === 'panel' && isPanelSpecs(product.specifications)) {
    return product as PanelProduct
  }
  return null
}

export function asInverterProduct(product: SolarProduct): InverterProduct | null {
  if (product.product_type === 'inverter' && isInverterSpecs(product.specifications)) {
    return product as InverterProduct
  }
  return null
}

export function asBatteryProduct(product: SolarProduct): BatteryProduct | null {
  if (product.product_type === 'battery' && isBatterySpecs(product.specifications)) {
    return product as BatteryProduct
  }
  return null
}

export function asMountingProduct(product: SolarProduct): MountingProduct | null {
  if (product.product_type === 'mounting' && isMountingSpecs(product.specifications)) {
    return product as MountingProduct
  }
  return null
}

// =============================================================================
// SOLAR ASSUMPTIONS
// =============================================================================

export interface SolarAssumptions {
  annualSunHours: number // Hours of effective sunlight per year
  annualDegradation: number // Decimal (0.005 = 0.5% per year)
  electricityPrice: number // DKK per kWh
  electricityPriceIncrease: number // Decimal (0.03 = 3% per year)
  feedInTariff: number // DKK per kWh sold to grid
  selfConsumptionRatio: number // Decimal without battery (0.3 = 30%)
  selfConsumptionRatioWithBattery: number // Decimal with battery (0.7 = 70%)
  laborCostPerHour: number // DKK per hour
  baseInstallationCost: number // Fixed installation cost in DKK
  systemLifetime: number // Years
  co2Factor: number // kg CO2 per kWh
}

// Default assumptions (fallback if database fails)
export const DEFAULT_SOLAR_ASSUMPTIONS: SolarAssumptions = {
  annualSunHours: 1000,
  annualDegradation: 0.005,
  electricityPrice: 2.5,
  electricityPriceIncrease: 0.03,
  feedInTariff: 0.8,
  selfConsumptionRatio: 0.3,
  selfConsumptionRatioWithBattery: 0.7,
  laborCostPerHour: 450,
  baseInstallationCost: 15000,
  systemLifetime: 25,
  co2Factor: 0.4,
}

// =============================================================================
// CRUD INPUT TYPES
// =============================================================================

export interface CreateSolarProductInput {
  product_type: SolarProductType
  code: string
  name: string
  description?: string
  price: number
  specifications: Record<string, unknown>
  sort_order?: number
}

export interface UpdateSolarProductInput {
  name?: string
  description?: string | null
  price?: number
  specifications?: Record<string, unknown>
  is_active?: boolean
  sort_order?: number
}

// =============================================================================
// GROUPED PRODUCTS TYPE
// =============================================================================

export interface SolarProductsByType {
  panels: PanelProduct[]
  inverters: InverterProduct[]
  batteries: BatteryProduct[]
  mountings: MountingProduct[]
}

// =============================================================================
// CALCULATOR INPUT V2 (Database-driven)
// =============================================================================

export interface CalculatorInputV2 {
  panelCode: string
  panelCount: number
  inverterCode: string
  mountingCode: string
  batteryCode: string
  annualConsumption: number
  margin: number
  discount: number
  includeVat: boolean
}

// =============================================================================
// TEMPLATE DATA V2
// =============================================================================

export interface ProductSnapshot {
  panel: {
    code: string
    name: string
    price: number
    wattage: number
    efficiency: number
  }
  inverter: {
    code: string
    name: string
    price: number
    capacity: number
    efficiency: number
  }
  battery: {
    code: string
    name: string
    price: number
    capacity: number
  }
  mounting: {
    code: string
    name: string
    pricePerPanel: number
    laborHoursPerPanel: number
  }
}

export interface TemplateDataV2 {
  version: 2
  config: CalculatorInputV2
  systemSize: number
  totalPrice: number
  productSnapshot: ProductSnapshot
  assumptionsSnapshot: SolarAssumptions
}

// =============================================================================
// LEGACY MAPPING
// =============================================================================

// Maps old hardcoded panel types to new product codes
export const LEGACY_PANEL_CODE_MAP: Record<string, string> = {
  standard: 'PANEL-STD',
  premium: 'PANEL-PREMIUM',
  high_efficiency: 'PANEL-HIGH-EFF',
}

// Maps old hardcoded inverter types to new product codes
export const LEGACY_INVERTER_CODE_MAP: Record<string, string> = {
  string_small: 'INV-STRING-3KW',
  string_medium: 'INV-STRING-5KW',
  string_large: 'INV-STRING-8KW',
  string_xl: 'INV-STRING-10KW',
  hybrid_medium: 'INV-HYBRID-5KW',
  hybrid_large: 'INV-HYBRID-10KW',
}

// Maps old hardcoded battery options to new product codes
export const LEGACY_BATTERY_CODE_MAP: Record<string, string> = {
  none: 'BAT-NONE',
  small: 'BAT-5KWH',
  medium: 'BAT-10KWH',
  large: 'BAT-15KWH',
}

// Maps old hardcoded mounting types to new product codes
export const LEGACY_MOUNTING_CODE_MAP: Record<string, string> = {
  roof_tile: 'MOUNT-TILE',
  roof_flat: 'MOUNT-FLAT',
  roof_metal: 'MOUNT-METAL',
  ground: 'MOUNT-GROUND',
}
