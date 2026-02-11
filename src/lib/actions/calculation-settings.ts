'use server'

import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types/common.types'
import type {
  CalculationSetting,
  CalculationSettings,
  ProjectTemplate,
  RoomType,
  CalculationSummary,
} from '@/types/calculation-settings.types'
import { validateUUID } from '@/lib/validations/common'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { DEFAULT_TAX_RATE, DEFAULT_CURRENCY, OFFER_VALIDITY_DAYS, CALC_DEFAULTS } from '@/lib/constants'
import { logger } from '@/lib/utils/logger'
// =====================================================
// CALCULATION SETTINGS
// =====================================================

export async function getCalculationSettings(): Promise<ActionResult<CalculationSettings>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('calculation_settings')
      .select('*')
      .order('setting_key')

    if (error) {
      logger.error('Database error fetching calculation settings', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Parse settings into structured format
    const settings: CalculationSettings = {
      hourly_rates: {
        electrician: CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN,
        apprentice: CALC_DEFAULTS.HOURLY_RATES.APPRENTICE,
        master: CALC_DEFAULTS.HOURLY_RATES.MASTER,
        helper: CALC_DEFAULTS.HOURLY_RATES.HELPER,
      },
      margins: {
        materials: CALC_DEFAULTS.MARGINS.MATERIALS,
        products: CALC_DEFAULTS.MARGINS.PRODUCTS,
        subcontractor: CALC_DEFAULTS.MARGINS.SUBCONTRACTOR,
        default_db_target: CALC_DEFAULTS.MARGINS.DEFAULT_DB_TARGET,
        minimum_db: CALC_DEFAULTS.MARGINS.MINIMUM_DB,
      },
      work_hours: {
        start: CALC_DEFAULTS.WORK_HOURS.START,
        end: CALC_DEFAULTS.WORK_HOURS.END,
        break_minutes: CALC_DEFAULTS.WORK_HOURS.BREAK_MINUTES,
        overtime_multiplier: CALC_DEFAULTS.WORK_HOURS.OVERTIME_MULTIPLIER,
        weekend_multiplier: CALC_DEFAULTS.WORK_HOURS.WEEKEND_MULTIPLIER,
      },
      defaults: {
        vat_percentage: DEFAULT_TAX_RATE,
        currency: DEFAULT_CURRENCY,
        validity_days: OFFER_VALIDITY_DAYS,
        payment_terms_days: CALC_DEFAULTS.PAYMENT_TERMS_DAYS,
      },
      labor_types: [],
    }

    // Map database values to structured settings
    for (const setting of data || []) {
      const value = setting.setting_value as Record<string, unknown>

      switch (setting.setting_key) {
        case 'hourly_rate_electrician':
          settings.hourly_rates.electrician = (value.rate as number) || CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN
          break
        case 'hourly_rate_apprentice':
          settings.hourly_rates.apprentice = (value.rate as number) || CALC_DEFAULTS.HOURLY_RATES.APPRENTICE
          break
        case 'hourly_rate_master':
          settings.hourly_rates.master = (value.rate as number) || CALC_DEFAULTS.HOURLY_RATES.MASTER
          break
        case 'hourly_rate_helper':
          settings.hourly_rates.helper = (value.rate as number) || CALC_DEFAULTS.HOURLY_RATES.HELPER
          break
        case 'margin_materials':
          settings.margins.materials = (value.percentage as number) || CALC_DEFAULTS.MARGINS.MATERIALS
          break
        case 'margin_products':
          settings.margins.products = (value.percentage as number) || CALC_DEFAULTS.MARGINS.PRODUCTS
          break
        case 'margin_subcontractor':
          settings.margins.subcontractor = (value.percentage as number) || CALC_DEFAULTS.MARGINS.SUBCONTRACTOR
          break
        case 'default_db_target':
          settings.margins.default_db_target = (value.percentage as number) || CALC_DEFAULTS.MARGINS.DEFAULT_DB_TARGET
          break
        case 'minimum_db':
          settings.margins.minimum_db = (value.percentage as number) || CALC_DEFAULTS.MARGINS.MINIMUM_DB
          break
        case 'work_hours_standard':
          settings.work_hours.start = (value.start as string) || CALC_DEFAULTS.WORK_HOURS.START
          settings.work_hours.end = (value.end as string) || CALC_DEFAULTS.WORK_HOURS.END
          settings.work_hours.break_minutes = (value.break_minutes as number) || CALC_DEFAULTS.WORK_HOURS.BREAK_MINUTES
          break
        case 'work_hours_overtime':
          settings.work_hours.overtime_multiplier = (value.multiplier as number) || CALC_DEFAULTS.WORK_HOURS.OVERTIME_MULTIPLIER
          break
        case 'work_hours_weekend':
          settings.work_hours.weekend_multiplier = (value.multiplier as number) || CALC_DEFAULTS.WORK_HOURS.WEEKEND_MULTIPLIER
          break
        case 'default_vat':
          settings.defaults.vat_percentage = (value.percentage as number) || DEFAULT_TAX_RATE
          break
        case 'default_currency':
          settings.defaults.currency = (value.code as string) || DEFAULT_CURRENCY
          break
        case 'default_validity_days':
          settings.defaults.validity_days = (value.days as number) || OFFER_VALIDITY_DAYS
          break
        case 'default_payment_terms':
          settings.defaults.payment_terms_days = (value.days as number) || CALC_DEFAULTS.PAYMENT_TERMS_DAYS
          break
        case 'labor_types':
          settings.labor_types = (value.types as typeof settings.labor_types) || []
          break
      }
    }

    return { success: true, data: settings }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente indstillinger') }
  }
}

export async function getAllSettings(): Promise<ActionResult<CalculationSetting[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('calculation_settings')
      .select('*')
      .order('category')
      .order('setting_key')

    if (error) {
      logger.error('Database error fetching all settings', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as CalculationSetting[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente indstillinger') }
  }
}

export async function updateSetting(
  settingKey: string,
  value: Record<string, unknown>
): Promise<ActionResult<CalculationSetting>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    if (!settingKey || settingKey.trim().length === 0) {
      return { success: false, error: 'Indstillingsnøgle er påkrævet' }
    }

    const { data, error } = await supabase
      .from('calculation_settings')
      .update({
        setting_value: value,
        updated_by: userId,
      })
      .eq('setting_key', settingKey)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Indstillingen blev ikke fundet' }
      }
      logger.error('Database error updating setting', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/calculation')
    return { success: true, data: data as CalculationSetting }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere indstilling') }
  }
}

export async function updateHourlyRate(
  type: 'electrician' | 'apprentice' | 'master' | 'helper',
  rate: number
): Promise<ActionResult<void>> {
  if (typeof rate !== 'number' || rate < 0) {
    return { success: false, error: 'Ugyldig timesats' }
  }

  const keyMap = {
    electrician: 'hourly_rate_electrician',
    apprentice: 'hourly_rate_apprentice',
    master: 'hourly_rate_master',
    helper: 'hourly_rate_helper',
  }

  const labelMap = {
    electrician: 'Elektriker',
    apprentice: 'Lærling',
    master: 'El-installatør',
    helper: 'Hjælper',
  }

  const result = await updateSetting(keyMap[type], { rate, label: labelMap[type] })
  return result.success ? { success: true } : { success: false, error: result.error }
}

export async function updateMargin(
  type: 'materials' | 'products' | 'subcontractor' | 'default_db_target' | 'minimum_db',
  percentage: number
): Promise<ActionResult<void>> {
  if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
    return { success: false, error: 'Ugyldig procentværdi (0-100)' }
  }

  const keyMap = {
    materials: 'margin_materials',
    products: 'margin_products',
    subcontractor: 'margin_subcontractor',
    default_db_target: 'default_db_target',
    minimum_db: 'minimum_db',
  }

  const labelMap = {
    materials: 'Materialer',
    products: 'Produkter',
    subcontractor: 'Underentreprise',
    default_db_target: 'Mål-DB',
    minimum_db: 'Minimum DB',
  }

  const result = await updateSetting(keyMap[type], { percentage, label: labelMap[type] })
  return result.success ? { success: true } : { success: false, error: result.error }
}

// =====================================================
// PROJECT TEMPLATES
// =====================================================

export async function getProjectTemplates(): Promise<ActionResult<ProjectTemplate[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('project_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (error) {
      logger.error('Database error fetching project templates', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as ProjectTemplate[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente projektskabeloner') }
  }
}

export async function getProjectTemplate(id: string): Promise<ActionResult<ProjectTemplate>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'skabelon ID')

    const { data, error } = await supabase
      .from('project_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Skabelonen blev ikke fundet' }
      }
      logger.error('Database error fetching project template', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!data) {
      return { success: false, error: 'Skabelonen blev ikke fundet' }
    }

    return { success: true, data: data as ProjectTemplate }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente projektskabelon') }
  }
}

// =====================================================
// ROOM TYPES
// =====================================================

export async function getRoomTypes(): Promise<ActionResult<RoomType[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('room_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (error) {
      logger.error('Database error fetching room types', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as RoomType[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente rumtyper') }
  }
}

export async function getRoomType(code: string): Promise<ActionResult<RoomType>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    if (!code || code.trim().length === 0) {
      return { success: false, error: 'Rumtype kode er påkrævet' }
    }

    const { data, error } = await supabase
      .from('room_types')
      .select('*')
      .eq('code', code.trim())
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Rumtypen blev ikke fundet' }
      }
      logger.error('Database error fetching room type', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!data) {
      return { success: false, error: 'Rumtypen blev ikke fundet' }
    }

    return { success: true, data: data as RoomType }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente rumtype') }
  }
}

// =====================================================
// CALCULATION ENGINE
// =====================================================

export async function calculateTotals(calculationId: string): Promise<ActionResult<CalculationSummary>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(calculationId, 'kalkulation ID')

    // Call the database function
    const { data, error } = await supabase
      .rpc('calculate_calculation_totals', { p_calculation_id: calculationId })
      .single()

    if (error) {
      logger.error('Database error calculating totals', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!data) {
      return { success: false, error: 'Kunne ikke beregne totaler' }
    }

    const result = data as {
      total_time_minutes: number
      total_materials_cost: number
      total_labor_cost: number
      total_cost_price: number
      total_sale_price: number
      db_amount: number
      db_percentage: number
    }

    // Format time
    const hours = Math.floor(result.total_time_minutes / 60)
    const mins = result.total_time_minutes % 60
    const totalTimeFormatted = hours > 0 ? `${hours}t ${mins}m` : `${mins}m`

    // Update the calculation with the new totals
    const { error: updateError } = await supabase
      .from('calculations')
      .update({
        total_time_minutes: result.total_time_minutes,
        total_materials_cost: result.total_materials_cost,
        total_labor_cost: result.total_labor_cost,
        total_cost_price: result.total_cost_price,
        total_sale_price: result.total_sale_price,
        db_amount: result.db_amount,
        db_percentage: result.db_percentage,
      })
      .eq('id', calculationId)

    if (updateError) {
      logger.error('Database error updating calculation totals', { error: updateError })
      // Don't throw - we still have valid results
    }

    return {
      success: true,
      data: {
        totalTimeMinutes: result.total_time_minutes,
        totalTimeFormatted,
        totalMaterialsCost: result.total_materials_cost,
        totalLaborCost: result.total_labor_cost,
        totalCostPrice: result.total_cost_price,
        totalSalePrice: result.total_sale_price,
        dbAmount: result.db_amount,
        dbPercentage: result.db_percentage,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke beregne totaler') }
  }
}

// =====================================================
// COMPONENTS FOR CALCULATION
// =====================================================

export async function getComponentsWithPricing(): Promise<ActionResult<{
  id: string
  code: string
  name: string
  description: string | null
  base_time_minutes: number
  default_cost_price: number
  default_sale_price: number
  complexity_factor: number
  category_name: string
  variants: { code: string; name: string; time_multiplier: number; extra_minutes: number }[]
}[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data: components, error } = await supabase
      .from('calc_components')
      .select(`
        id,
        code,
        name,
        description,
        base_time_minutes,
        default_cost_price,
        default_sale_price,
        complexity_factor,
        category:calc_component_categories(name)
      `)
      .eq('is_active', true)
      .order('code')

    if (error) {
      logger.error('Database error fetching components with pricing', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!components || components.length === 0) {
      return { success: true, data: [] }
    }

    // Batch fetch all variants for all components (avoids N+1 queries)
    const componentIds = components.map((c) => c.id)
    const { data: allVariants, error: varError } = await supabase
      .from('calc_component_variants')
      .select('component_id, code, name, time_multiplier, extra_minutes')
      .in('component_id', componentIds)
      .order('sort_order')

    if (varError) {
      logger.error('Database error fetching variants', { error: varError })
    }

    // Create lookup map for variants by component
    const variantsByComponent = new Map<string, typeof allVariants>()
    allVariants?.forEach((variant) => {
      const existing = variantsByComponent.get(variant.component_id) || []
      existing.push(variant)
      variantsByComponent.set(variant.component_id, existing)
    })

    // Build result without additional queries
    const result = components.map((comp) => {
      const category = comp.category as unknown as { name: string } | { name: string }[] | null
      const categoryName = Array.isArray(category)
        ? category[0]?.name || ''
        : category?.name || ''

      const variants = variantsByComponent.get(comp.id) || []

      return {
        id: comp.id,
        code: comp.code,
        name: comp.name,
        description: comp.description,
        base_time_minutes: comp.base_time_minutes,
        default_cost_price: comp.default_cost_price || 0,
        default_sale_price: comp.default_sale_price || 0,
        complexity_factor: comp.complexity_factor || 1.0,
        category_name: categoryName,
        variants: variants.map((v) => ({
          code: v.code,
          name: v.name,
          time_multiplier: v.time_multiplier || 1.0,
          extra_minutes: v.extra_minutes || 0,
        })),
      }
    })

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente komponenter') }
  }
}
