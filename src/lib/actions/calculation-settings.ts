'use server'

import { createClient, getUser } from '@/lib/supabase/server'
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

// =====================================================
// Helper Functions
// =====================================================

async function requireAuth(): Promise<string> {
  const user = await getUser()
  if (!user) {
    throw new Error('AUTH_REQUIRED')
  }
  return user.id
}

function formatError(err: unknown, defaultMessage: string): string {
  if (err instanceof Error) {
    if (err.message === 'AUTH_REQUIRED') {
      return 'Du skal være logget ind'
    }
    if (err.message.startsWith('Ugyldig')) {
      return err.message
    }
  }
  console.error(`${defaultMessage}:`, err)
  return defaultMessage
}

// =====================================================
// CALCULATION SETTINGS
// =====================================================

export async function getCalculationSettings(): Promise<ActionResult<CalculationSettings>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('calculation_settings')
      .select('*')
      .order('setting_key')

    if (error) {
      console.error('Database error fetching calculation settings:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Parse settings into structured format
    const settings: CalculationSettings = {
      hourly_rates: {
        electrician: 495,
        apprentice: 295,
        master: 650,
        helper: 350,
      },
      margins: {
        materials: 25,
        products: 20,
        subcontractor: 10,
        default_db_target: 35,
        minimum_db: 20,
      },
      work_hours: {
        start: '07:00',
        end: '15:30',
        break_minutes: 30,
        overtime_multiplier: 1.5,
        weekend_multiplier: 2.0,
      },
      defaults: {
        vat_percentage: 25,
        currency: 'DKK',
        validity_days: 30,
        payment_terms_days: 14,
      },
      labor_types: [],
    }

    // Map database values to structured settings
    for (const setting of data || []) {
      const value = setting.setting_value as Record<string, unknown>

      switch (setting.setting_key) {
        case 'hourly_rate_electrician':
          settings.hourly_rates.electrician = (value.rate as number) || 495
          break
        case 'hourly_rate_apprentice':
          settings.hourly_rates.apprentice = (value.rate as number) || 295
          break
        case 'hourly_rate_master':
          settings.hourly_rates.master = (value.rate as number) || 650
          break
        case 'hourly_rate_helper':
          settings.hourly_rates.helper = (value.rate as number) || 350
          break
        case 'margin_materials':
          settings.margins.materials = (value.percentage as number) || 25
          break
        case 'margin_products':
          settings.margins.products = (value.percentage as number) || 20
          break
        case 'margin_subcontractor':
          settings.margins.subcontractor = (value.percentage as number) || 10
          break
        case 'default_db_target':
          settings.margins.default_db_target = (value.percentage as number) || 35
          break
        case 'minimum_db':
          settings.margins.minimum_db = (value.percentage as number) || 20
          break
        case 'work_hours_standard':
          settings.work_hours.start = (value.start as string) || '07:00'
          settings.work_hours.end = (value.end as string) || '15:30'
          settings.work_hours.break_minutes = (value.break_minutes as number) || 30
          break
        case 'work_hours_overtime':
          settings.work_hours.overtime_multiplier = (value.multiplier as number) || 1.5
          break
        case 'work_hours_weekend':
          settings.work_hours.weekend_multiplier = (value.multiplier as number) || 2.0
          break
        case 'default_vat':
          settings.defaults.vat_percentage = (value.percentage as number) || 25
          break
        case 'default_currency':
          settings.defaults.currency = (value.code as string) || 'DKK'
          break
        case 'default_validity_days':
          settings.defaults.validity_days = (value.days as number) || 30
          break
        case 'default_payment_terms':
          settings.defaults.payment_terms_days = (value.days as number) || 14
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
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('calculation_settings')
      .select('*')
      .order('category')
      .order('setting_key')

    if (error) {
      console.error('Database error fetching all settings:', error)
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
    const userId = await requireAuth()

    if (!settingKey || settingKey.trim().length === 0) {
      return { success: false, error: 'Indstillingsnøgle er påkrævet' }
    }

    const supabase = await createClient()

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
      console.error('Database error updating setting:', error)
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
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('project_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (error) {
      console.error('Database error fetching project templates:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as ProjectTemplate[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente projektskabeloner') }
  }
}

export async function getProjectTemplate(id: string): Promise<ActionResult<ProjectTemplate>> {
  try {
    await requireAuth()
    validateUUID(id, 'skabelon ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('project_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Skabelonen blev ikke fundet' }
      }
      console.error('Database error fetching project template:', error)
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
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('room_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (error) {
      console.error('Database error fetching room types:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as RoomType[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente rumtyper') }
  }
}

export async function getRoomType(code: string): Promise<ActionResult<RoomType>> {
  try {
    await requireAuth()

    if (!code || code.trim().length === 0) {
      return { success: false, error: 'Rumtype kode er påkrævet' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('room_types')
      .select('*')
      .eq('code', code.trim())
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Rumtypen blev ikke fundet' }
      }
      console.error('Database error fetching room type:', error)
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
    await requireAuth()
    validateUUID(calculationId, 'kalkulation ID')

    const supabase = await createClient()

    // Call the database function
    const { data, error } = await supabase
      .rpc('calculate_calculation_totals', { p_calculation_id: calculationId })
      .single()

    if (error) {
      console.error('Database error calculating totals:', error)
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
      console.error('Database error updating calculation totals:', updateError)
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
    await requireAuth()
    const supabase = await createClient()

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
      console.error('Database error fetching components with pricing:', error)
      throw new Error('DATABASE_ERROR')
    }

    if (!components || components.length === 0) {
      return { success: true, data: [] }
    }

    // Get variants for each component
    const result = await Promise.all(
      components.map(async (comp) => {
        const { data: variants, error: varError } = await supabase
          .from('calc_component_variants')
          .select('code, name, time_multiplier, extra_minutes')
          .eq('component_id', comp.id)
          .order('sort_order')

        if (varError) {
          console.error('Database error fetching variants:', varError)
        }

        const category = comp.category as unknown as { name: string } | { name: string }[] | null
        const categoryName = Array.isArray(category)
          ? category[0]?.name || ''
          : category?.name || ''

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
          variants: (variants || []).map(v => ({
            code: v.code,
            name: v.name,
            time_multiplier: v.time_multiplier || 1.0,
            extra_minutes: v.extra_minutes || 0,
          })),
        }
      })
    )

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente komponenter') }
  }
}
