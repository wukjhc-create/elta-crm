'use server'
import { permissionDenied } from '@/lib/actions/action-helpers'

import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types/common.types'
import { validateUUID } from '@/lib/validations/common'
import {
  type SolarProduct,
  type SolarProductType,
  type SolarProductsByType,
  type SolarAssumptions,
  type CreateSolarProductInput,
  type UpdateSolarProductInput,
  type PanelProduct,
  type InverterProduct,
  type BatteryProduct,
  type MountingProduct,
  DEFAULT_SOLAR_ASSUMPTIONS,
  isPanelSpecs,
  isInverterSpecs,
  isBatterySpecs,
  isMountingSpecs,
} from '@/types/solar-products.types'
import { getAuthenticatedClient, formatError, getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import type { Permission } from '@/lib/auth/permissions'

/**
 * RBAC app-lag (P-006, runde 2): modul-paritet — skrivende actions kraever samme rettighed som modulets side
 * (ModuleGuard). Den der legitimt kan se modulet kan fortsat alt; direkte kald fra andre roller afvises.
 */
async function requireGate(permission: Permission) {
  const ctx = await getAuthenticatedClientWithRole()
  ctx.requirePermission(permission)
  return ctx
}

/**
 * D48/D51 (privacy): solprodukternes `price` og monteringens `price_per_panel` er internt kostgrundlag (avance lægges
 * på i beregneren). Uden offers.view.cost_prices (salg m.fl.) sendes de aldrig til klienten — beregningen sker
 * server-side (calculateSolarQuote). Navngivet konstant: check:rls-matrix læser literal-strenge som skrive-gates.
 */
const SOLAR_COST_PERMISSION: Permission = 'offers.view.cost_prices'
/** Standardavance for roller uden kostadgang — de kan ikke selv sætte avancen (ellers afslører avance 0 kostprisen). */
const SALES_DEFAULT_SOLAR_MARGIN = 0.25
const MAX_SOLAR_DISCOUNT = 0.3

function stripSolarCostIfNeeded<T extends SolarProduct>(rows: T[], hasPermission: (p: Permission) => boolean): T[] {
  if (hasPermission(SOLAR_COST_PERMISSION)) return rows
  return rows.map((p) => ({
    ...p,
    price: 0,
    specifications: p.product_type === 'mounting' ? { ...p.specifications, price_per_panel: 0 } : p.specifications,
  }))
}
import { logger } from '@/lib/utils/logger'
import { buildCalculatorContext, calculateSolarSystemV2 } from '@/lib/utils/solar-calculator'
import type { CalculatorInputV2 } from '@/types/solar-products.types'
import type { CalculatorResults } from '@/types/calculator.types'
// =====================================================
// Read Operations
// =====================================================

/**
 * Get all solar products, optionally filtered by type
 */
export async function getSolarProducts(
  type?: SolarProductType
): Promise<ActionResult<SolarProduct[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()

    let query = supabase
      .from('solar_products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('name')

    if (type) {
      query = query.eq('product_type', type)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Database error fetching solar products', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: stripSolarCostIfNeeded(data as SolarProduct[], hasPermission) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente solprodukter') }
  }
}

/**
 * Get a single solar product by ID
 */
export async function getSolarProduct(id: string): Promise<ActionResult<SolarProduct>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    validateUUID(id, 'produkt ID')

    const { data, error } = await supabase
      .from('solar_products')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      logger.error('Database error fetching solar product', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!data) {
      return { success: false, error: 'Produktet blev ikke fundet' }
    }

    return { success: true, data: stripSolarCostIfNeeded([data as SolarProduct], hasPermission)[0] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente produkt') }
  }
}

/**
 * Get a solar product by its code
 */
export async function getSolarProductByCode(code: string): Promise<ActionResult<SolarProduct>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()

    if (!code || typeof code !== 'string') {
      return { success: false, error: 'Ugyldig produktkode' }
    }

    const { data, error } = await supabase
      .from('solar_products')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      logger.error('Database error fetching solar product by code', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!data) {
      return { success: false, error: 'Produktet blev ikke fundet' }
    }

    return { success: true, data: stripSolarCostIfNeeded([data as SolarProduct], hasPermission)[0] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente produkt') }
  }
}

/**
 * Get all solar products grouped by type
 */
export async function getSolarProductsByType(): Promise<ActionResult<SolarProductsByType>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    const data = await loadSolarProductsByType(supabase)
    if (hasPermission(SOLAR_COST_PERMISSION)) return { success: true, data }
    return { success: true, data: {
      panels: stripSolarCostIfNeeded(data.panels, hasPermission),
      inverters: stripSolarCostIfNeeded(data.inverters, hasPermission),
      batteries: stripSolarCostIfNeeded(data.batteries, hasPermission),
      mountings: stripSolarCostIfNeeded(data.mountings, hasPermission),
    } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente solprodukter') }
  }
}

/** Ufiltreret (inkl. kostpriser) — kun til server-side beregning. */
async function loadSolarProductsByType(supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase']): Promise<SolarProductsByType> {
    const { data, error } = await supabase
      .from('solar_products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('name')

    if (error) {
      logger.error('Database error fetching solar products', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    const products = data as SolarProduct[]

    // Group by type with type-safe casting (using unknown intermediate for type narrowing)
    const panels = products
      .filter((p) => p.product_type === 'panel' && isPanelSpecs(p.specifications))
      .map((p) => p as unknown as PanelProduct)

    const inverters = products
      .filter((p) => p.product_type === 'inverter' && isInverterSpecs(p.specifications))
      .map((p) => p as unknown as InverterProduct)

    const batteries = products
      .filter((p) => p.product_type === 'battery' && isBatterySpecs(p.specifications))
      .map((p) => p as unknown as BatteryProduct)

    const mountings = products
      .filter((p) => p.product_type === 'mounting' && isMountingSpecs(p.specifications))
      .map((p) => p as unknown as MountingProduct)

    return { panels, inverters, batteries, mountings }
}

// =====================================================
// Write Operations
// =====================================================

/**
 * Create a new solar product
 */
export async function createSolarProduct(
  input: CreateSolarProductInput
): Promise<ActionResult<SolarProduct>> {
  try {
    const { supabase, userId } = await requireGate('settings.view')

    // Validate required fields
    if (!input.code || !input.name || !input.product_type) {
      return { success: false, error: 'Kode, navn og type er påkrævet' }
    }

    // Validate code format (uppercase letters, numbers, hyphens)
    if (!/^[A-Z0-9-]+$/.test(input.code)) {
      return { success: false, error: 'Produktkode må kun indeholde store bogstaver, tal og bindestreger' }
    }

    const { data, error } = await supabase
      .from('solar_products')
      .insert({
        product_type: input.product_type,
        code: input.code,
        name: input.name,
        description: input.description || null,
        price: input.price,
        specifications: input.specifications,
        sort_order: input.sort_order ?? 0,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Et produkt med denne kode findes allerede' }
      }
      logger.error('Database error creating solar product', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/solar')
    revalidatePath('/dashboard/calculator')

    return { success: true, data: data as SolarProduct }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette produkt') }
  }
}

/**
 * Update an existing solar product
 */
export async function updateSolarProduct(
  id: string,
  input: UpdateSolarProductInput
): Promise<ActionResult<SolarProduct>> {
  try {
    const { supabase } = await requireGate('settings.view')
    validateUUID(id, 'produkt ID')

    const { data, error } = await supabase
      .from('solar_products')
      .update({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.price !== undefined && { price: input.price }),
        ...(input.specifications !== undefined && { specifications: input.specifications }),
        ...(input.is_active !== undefined && { is_active: input.is_active }),
        ...(input.sort_order !== undefined && { sort_order: input.sort_order }),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Produktet blev ikke fundet' }
      }
      logger.error('Database error updating solar product', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/solar')
    revalidatePath('/dashboard/calculator')

    return { success: true, data: data as SolarProduct }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere produkt') }
  }
}

/**
 * Delete a solar product (soft delete by setting is_active = false)
 */
export async function deleteSolarProduct(id: string): Promise<ActionResult<void>> {
  try {
    const { supabase } = await requireGate('settings.view')
    validateUUID(id, 'produkt ID')

    const { error } = await supabase
      .from('solar_products')
      .update({ is_active: false })
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting solar product', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/solar')
    revalidatePath('/dashboard/calculator')

    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette produkt') }
  }
}

// =====================================================
// Solar Assumptions
// =====================================================

/**
 * Get solar assumptions from calculation_settings
 */
export async function getSolarAssumptions(): Promise<ActionResult<SolarAssumptions>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    const assumptions = await loadSolarAssumptions(supabase)
    // D48/D51: lønsats og basis-installationskost er internt kostgrundlag
    if (hasPermission(SOLAR_COST_PERMISSION)) return { success: true, data: assumptions }
    return { success: true, data: { ...assumptions, laborCostPerHour: 0, baseInstallationCost: 0 } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente solcelleindstillinger') }
  }
}

/** Ufiltreret (inkl. intern lønsats) — kun til server-side beregning. */
async function loadSolarAssumptions(supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase']): Promise<SolarAssumptions> {
  {
    const { data, error } = await supabase
      .from('calculation_settings')
      .select('setting_key, setting_value')
      .eq('category', 'solar_assumptions')

    if (error) {
      logger.error('Database error fetching solar assumptions', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Build assumptions object from settings
    const assumptions: SolarAssumptions = { ...DEFAULT_SOLAR_ASSUMPTIONS }

    for (const setting of data || []) {
      const value = (setting.setting_value as { value?: number })?.value

      if (value === undefined) continue

      switch (setting.setting_key) {
        case 'solar_annual_sun_hours':
          assumptions.annualSunHours = value
          break
        case 'solar_annual_degradation':
          assumptions.annualDegradation = value
          break
        case 'solar_electricity_price':
          assumptions.electricityPrice = value
          break
        case 'solar_electricity_price_increase':
          assumptions.electricityPriceIncrease = value
          break
        case 'solar_feed_in_tariff':
          assumptions.feedInTariff = value
          break
        case 'solar_self_consumption_ratio':
          assumptions.selfConsumptionRatio = value
          break
        case 'solar_self_consumption_ratio_battery':
          assumptions.selfConsumptionRatioWithBattery = value
          break
        case 'solar_labor_cost_per_hour':
          assumptions.laborCostPerHour = value
          break
        case 'solar_base_installation_cost':
          assumptions.baseInstallationCost = value
          break
        case 'solar_system_lifetime':
          assumptions.systemLifetime = value
          break
        case 'solar_co2_factor':
          assumptions.co2Factor = value
          break
      }
    }

    return assumptions
  }
}

/**
 * Update a solar assumption
 */
export async function updateSolarAssumption(
  key: string,
  value: number
): Promise<ActionResult<void>> {
  try {
    const { supabase } = await requireGate('settings.view')

    // Validate key
    const validKeys = [
      'solar_annual_sun_hours',
      'solar_annual_degradation',
      'solar_electricity_price',
      'solar_electricity_price_increase',
      'solar_feed_in_tariff',
      'solar_self_consumption_ratio',
      'solar_self_consumption_ratio_battery',
      'solar_labor_cost_per_hour',
      'solar_base_installation_cost',
      'solar_system_lifetime',
      'solar_co2_factor',
    ]

    if (!validKeys.includes(key)) {
      return { success: false, error: 'Ugyldig indstillingsnøgle' }
    }

    // Validate value
    if (typeof value !== 'number' || isNaN(value)) {
      return { success: false, error: 'Værdien skal være et tal' }
    }


    // Get existing setting to preserve label and unit
    const { data: existing } = await supabase
      .from('calculation_settings')
      .select('setting_value')
      .eq('setting_key', key)
      .maybeSingle()

    const existingValue = existing?.setting_value as Record<string, unknown> | null
    const updatedValue = {
      ...existingValue,
      value,
    }

    const { error } = await supabase
      .from('calculation_settings')
      .update({ setting_value: updatedValue })
      .eq('setting_key', key)

    if (error) {
      logger.error('Database error updating solar assumption', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/solar')
    revalidatePath('/dashboard/calculator')

    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere indstilling') }
  }
}

/**
 * Update multiple solar assumptions at once
 */
export async function updateSolarAssumptions(
  updates: Partial<SolarAssumptions>
): Promise<ActionResult<void>> {
  const __denied = await permissionDenied('settings.view')
  if (__denied) return { success: false, error: __denied }
  try {
    await getAuthenticatedClient()

    const keyMap: Record<keyof SolarAssumptions, string> = {
      annualSunHours: 'solar_annual_sun_hours',
      annualDegradation: 'solar_annual_degradation',
      electricityPrice: 'solar_electricity_price',
      electricityPriceIncrease: 'solar_electricity_price_increase',
      feedInTariff: 'solar_feed_in_tariff',
      selfConsumptionRatio: 'solar_self_consumption_ratio',
      selfConsumptionRatioWithBattery: 'solar_self_consumption_ratio_battery',
      laborCostPerHour: 'solar_labor_cost_per_hour',
      baseInstallationCost: 'solar_base_installation_cost',
      systemLifetime: 'solar_system_lifetime',
      co2Factor: 'solar_co2_factor',
    }

    // Update each setting
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue

      const dbKey = keyMap[key as keyof SolarAssumptions]
      if (!dbKey) continue

      const result = await updateSolarAssumption(dbKey, value)
      if (!result.success) {
        return result
      }
    }

    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere indstillinger') }
  }
}

// =====================================================
// Combined Data Fetch for Calculator
// =====================================================

/**
 * Get all data needed for the solar calculator
 */
export async function getSolarCalculatorData(): Promise<
  ActionResult<{
    products: SolarProductsByType
    assumptions: SolarAssumptions
  }>
> {
  try {
    const [productsResult, assumptionsResult] = await Promise.all([
      getSolarProductsByType(),
      getSolarAssumptions(),
    ])

    if (!productsResult.success || !productsResult.data) {
      return { success: false, error: productsResult.error || 'Ingen produktdata' }
    }

    if (!assumptionsResult.success || !assumptionsResult.data) {
      return { success: false, error: assumptionsResult.error || 'Ingen antagelsesdata' }
    }

    return {
      success: true,
      data: {
        products: productsResult.data,
        assumptions: assumptionsResult.data,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente beregnerdata') }
  }
}

/**
 * D48/D51: solcelleberegning server-side. Kostpris-roller regner som før (egen avance); øvrige (salg) regner med
 * standardavancen og en begrænset rabat, og får kun kundevendte tal tilbage (ingen komponent-/lønkost, subtotal
 * eller avancebeløb).
 */
export async function calculateSolarQuote(input: CalculatorInputV2): Promise<ActionResult<CalculatorResults>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('tools.solar_calc')) return { success: false, error: 'Manglende tilladelse: tools.solar_calc' }
    const seesCost = hasPermission(SOLAR_COST_PERMISSION)
    const panelCount = Math.round(Number(input?.panelCount))
    if (!Number.isFinite(panelCount) || panelCount < 1 || panelCount > 500) {
      return { success: false, error: 'Ugyldigt antal paneler' }
    }
    const clamp = (v: unknown, max: number) => Math.min(Math.max(Number(v) || 0, 0), max)
    const safeInput: CalculatorInputV2 = {
      panelCode: String(input.panelCode ?? ''),
      panelCount,
      inverterCode: String(input.inverterCode ?? ''),
      mountingCode: String(input.mountingCode ?? ''),
      batteryCode: String(input.batteryCode ?? ''),
      annualConsumption: clamp(input.annualConsumption, 1_000_000),
      margin: seesCost ? clamp(input.margin, 1) : SALES_DEFAULT_SOLAR_MARGIN,
      discount: clamp(input.discount, MAX_SOLAR_DISCOUNT),
      includeVat: input.includeVat !== false,
    }
    const [products, assumptions] = await Promise.all([loadSolarProductsByType(supabase), loadSolarAssumptions(supabase)])
    const context = buildCalculatorContext(products, assumptions, safeInput)
    if (!context) return { success: false, error: 'Kunne ikke finde de valgte produkter' }
    const results = calculateSolarSystemV2(safeInput, context)
    if (seesCost) return { success: true, data: results }
    return {
      success: true,
      data: {
        ...results,
        panelsCost: 0, inverterCost: 0, mountingCost: 0, batteryCost: 0, laborCost: 0, installationCost: 0,
        subtotal: 0, margin: 0,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke beregne anlægget') }
  }
}
