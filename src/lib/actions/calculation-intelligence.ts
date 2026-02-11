'use server'

import { revalidatePath } from 'next/cache'
import { DEFAULT_TAX_RATE } from '@/lib/constants'
import type { ActionResult } from '@/types/common.types'
import type {
  InstallationType,
  RoomTemplate,
  ComponentTimeIntelligence,
  RoomCalculation,
  ProjectEstimate,
  ProjectCalculationInput,
  CreateRoomCalculationInput,
  CalculationAnomaly,
  SystemAlert,
  OfferTextTemplate,
  ProfitSimulationInput,
  ProfitSimulationResult,
} from '@/types/calculation-intelligence.types'
import { CalculationIntelligenceEngine, detectAnomalies } from '@/lib/services/calculation-intelligence'
import { requireAuth, getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'

// =====================================================
// Auth Helper
// =====================================================
// =====================================================
// Installation Types
// =====================================================

export async function getInstallationTypes(): Promise<ActionResult<InstallationType[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('installation_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (error) {
      console.error('Error fetching installation types:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as InstallationType[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente installationstyper') }
  }
}

// =====================================================
// Room Templates
// =====================================================

export async function getRoomTemplates(): Promise<ActionResult<RoomTemplate[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('room_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (error) {
      console.error('Error fetching room templates:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as RoomTemplate[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente rumskabeloner') }
  }
}

// =====================================================
// Component Time Intelligence
// =====================================================

export async function getComponentTimeData(): Promise<ActionResult<ComponentTimeIntelligence[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('component_time_intelligence')
      .select('*')
      .eq('is_active', true)

    if (error) {
      console.error('Error fetching component time data:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as ComponentTimeIntelligence[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente komponenttider') }
  }
}

// =====================================================
// Project Calculation
// =====================================================

export async function calculateProject(
  input: ProjectCalculationInput
): Promise<ActionResult<ProjectEstimate>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const [installTypesResult, roomTemplatesResult, componentTimeResult] = await Promise.all([
      supabase.from('installation_types').select('*').eq('is_active', true),
      supabase.from('room_templates').select('*').eq('is_active', true),
      supabase.from('component_time_intelligence').select('*').eq('is_active', true),
    ])

    if (installTypesResult.error || roomTemplatesResult.error || componentTimeResult.error) {
      console.error('Error loading reference data')
      throw new Error('DATABASE_ERROR')
    }

    const engine = new CalculationIntelligenceEngine(
      (componentTimeResult.data || []) as ComponentTimeIntelligence[],
      (installTypesResult.data || []) as InstallationType[],
      (roomTemplatesResult.data || []) as RoomTemplate[],
      input.hourly_rate
    )

    const estimate = engine.calculateProject(input)

    return { success: true, data: estimate }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke beregne projekt') }
  }
}

// =====================================================
// Room Calculation CRUD
// =====================================================

export async function saveRoomCalculation(
  input: CreateRoomCalculationInput & { total_time_seconds: number; total_material_cost: number; total_cable_meters: number; total_labor_cost: number; total_cost: number; component_breakdown: unknown[] }
): Promise<ActionResult<RoomCalculation>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('room_calculations')
      .insert({
        calculation_id: input.calculation_id,
        room_name: input.room_name,
        room_template_id: input.room_template_id || null,
        room_type: input.room_type,
        size_m2: input.size_m2 || null,
        floor_number: input.floor_number || 0,
        installation_type_id: input.installation_type_id || null,
        ceiling_height_m: input.ceiling_height_m || 2.5,
        points: input.points,
        total_time_seconds: input.total_time_seconds,
        total_material_cost: input.total_material_cost,
        total_cable_meters: input.total_cable_meters,
        total_labor_cost: input.total_labor_cost,
        total_cost: input.total_cost,
        component_breakdown: input.component_breakdown,
        notes: input.notes || null,
        sort_order: input.sort_order || 0,
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving room calculation:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as RoomCalculation }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gemme rumberegning') }
  }
}

export async function getRoomCalculations(
  calculationId: string
): Promise<ActionResult<RoomCalculation[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('room_calculations')
      .select('*')
      .eq('calculation_id', calculationId)
      .order('sort_order')

    if (error) {
      console.error('Error fetching room calculations:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as RoomCalculation[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente rumberegninger') }
  }
}

export async function deleteRoomCalculation(id: string): Promise<ActionResult> {
  try {
    validateUUID(id, 'rumberegning ID')
    const { supabase } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('room_calculations')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting room calculation:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette rumberegning') }
  }
}

// =====================================================
// Anomaly Detection
// =====================================================

export async function runAnomalyDetection(
  calculationId: string,
  estimate: ProjectEstimate,
  marginPercentage: number
): Promise<ActionResult<CalculationAnomaly[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const anomalies = detectAnomalies({
      calculation_id: calculationId,
      rooms: estimate.rooms,
      total_hours: estimate.total_labor_hours,
      cost_price: estimate.cost_price,
      margin_percentage: marginPercentage,
      material_cost: estimate.total_material_cost,
    })

    if (anomalies.length === 0) {
      return { success: true, data: [] }
    }

    // Save anomalies to database
    const { data, error } = await supabase
      .from('calculation_anomalies')
      .insert(
        anomalies.map((a) => ({
          calculation_id: calculationId,
          anomaly_type: a.anomaly_type,
          severity: a.severity,
          message: a.message,
          details: a.details,
        }))
      )
      .select()

    if (error) {
      console.error('Error saving anomalies:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as CalculationAnomaly[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke køre anomalidetektion') }
  }
}

export async function getCalculationAnomalies(
  calculationId: string
): Promise<ActionResult<CalculationAnomaly[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('calculation_anomalies')
      .select('*')
      .eq('calculation_id', calculationId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching anomalies:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as CalculationAnomaly[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente anomalier') }
  }
}

export async function resolveAnomaly(
  id: string,
  notes: string
): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('calculation_anomalies')
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
        resolution_notes: notes,
      })
      .eq('id', id)

    if (error) {
      console.error('Error resolving anomaly:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke løse anomali') }
  }
}

// =====================================================
// System Alerts
// =====================================================

export async function getSystemAlerts(
  filters?: { is_read?: boolean; alert_type?: string; limit?: number }
): Promise<ActionResult<SystemAlert[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('system_alerts')
      .select('*')
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false })
      .limit(filters?.limit || 50)

    if (filters?.is_read !== undefined) {
      query = query.eq('is_read', filters.is_read)
    }
    if (filters?.alert_type) {
      query = query.eq('alert_type', filters.alert_type)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching alerts:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as SystemAlert[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente advarsler') }
  }
}

export async function markAlertRead(id: string): Promise<ActionResult> {
  try {
    validateUUID(id, 'advarsel ID')
    const { supabase } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('system_alerts')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw new Error('DATABASE_ERROR')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke markere advarsel som læst') }
  }
}

export async function dismissAlert(id: string): Promise<ActionResult> {
  try {
    validateUUID(id, 'advarsel ID')
    const { supabase, userId } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('system_alerts')
      .update({
        is_dismissed: true,
        dismissed_at: new Date().toISOString(),
        dismissed_by: userId,
      })
      .eq('id', id)

    if (error) throw new Error('DATABASE_ERROR')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke afvise advarsel') }
  }
}

export async function createSystemAlert(
  alert: Omit<SystemAlert, 'id' | 'is_read' | 'is_dismissed' | 'read_at' | 'dismissed_at' | 'dismissed_by' | 'created_at'>
): Promise<ActionResult<SystemAlert>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('system_alerts')
      .insert(alert)
      .select()
      .single()

    if (error) {
      console.error('Error creating alert:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as SystemAlert }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette advarsel') }
  }
}

// =====================================================
// Offer Text Templates
// =====================================================

export async function getOfferTextTemplates(
  type?: string
): Promise<ActionResult<OfferTextTemplate[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('offer_text_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (type) {
      query = query.eq('template_type', type)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching offer templates:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as OfferTextTemplate[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente tilbudsskabeloner') }
  }
}

// =====================================================
// Profit Simulator
// =====================================================

export async function simulateProfit(
  input: ProfitSimulationInput
): Promise<ActionResult<ProfitSimulationResult>> {
  try {
    await requireAuth()

    const result = CalculationIntelligenceEngine.simulateProfit(input)
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke simulere profit') }
  }
}

// =====================================================
// Offer Generation from Calculation
// =====================================================

export async function generateOfferFromCalculation(
  calculationId: string,
  options?: {
    project_type?: string
    building_type?: string
    include_obs?: boolean
    include_risk?: boolean
  }
): Promise<ActionResult<{
  title: string
  description: string
  introduction: string
  scope_text: string
  line_items: Array<{
    position: number
    section: string | null
    description: string
    quantity: number
    unit: string
    unit_price: number
    discount_percentage: number
    total: number
    cost_price: number | null
  }>
  obs_points: string[]
  terms_and_conditions: string
  warranty_text: string
  disclaimers: string[]
  margin_warnings: string[]
  upsell_suggestions: Array<{ title: string; description: string; estimated_cost: number }>
}>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Get calculation with rows
    const { data: calculation, error: calcError } = await supabase
      .from('kalkia_calculations')
      .select(`
        *,
        rows:kalkia_calculation_rows(*),
        customer:customers(id, company_name, customer_number),
        building_profile:kalkia_building_profiles(*)
      `)
      .eq('id', calculationId)
      .single()

    if (calcError || !calculation) {
      return { success: false, error: 'Kalkulation ikke fundet' }
    }

    // Get offer templates
    const { data: templates } = await supabase
      .from('offer_text_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    // Import and use the automation engine
    const { OfferAutomationEngine } = await import('@/lib/services/offer-automation')
    const engine = new OfferAutomationEngine((templates || []) as OfferTextTemplate[])

    const generated = engine.generateOfferFromKalkia(
      calculation as unknown as import('@/types/kalkia.types').KalkiaCalculationWithRelations,
      (templates || []) as OfferTextTemplate[]
    )

    return {
      success: true,
      data: {
        title: generated.title,
        description: generated.description,
        introduction: generated.introduction,
        scope_text: generated.scope_text,
        line_items: generated.line_items.map((li) => ({
          position: li.position,
          section: li.section,
          description: li.description,
          quantity: li.quantity,
          unit: li.unit,
          unit_price: li.unit_price,
          discount_percentage: li.discount_percentage,
          total: li.total,
          cost_price: li.cost_price,
        })),
        obs_points: generated.obs_points,
        terms_and_conditions: generated.terms_and_conditions,
        warranty_text: generated.warranty_text,
        disclaimers: generated.disclaimers,
        margin_warnings: generated.margin_analysis.warnings,
        upsell_suggestions: generated.upsell_suggestions.map((s) => ({
          title: s.title,
          description: s.description,
          estimated_cost: s.estimated_cost,
        })),
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke generere tilbud') }
  }
}

// =====================================================
// Convert Calculation to Offer (One Click)
// =====================================================

export async function convertCalculationToOffer(
  calculationId: string,
  customerId: string | null,
  options?: {
    project_type?: string
    include_obs?: boolean
    discount_percentage?: number
  }
): Promise<ActionResult<{ offer_id: string }>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Generate offer data
    const genResult = await generateOfferFromCalculation(calculationId, {
      project_type: options?.project_type,
      include_obs: options?.include_obs,
    })

    if (!genResult.success || !genResult.data) {
      return { success: false, error: genResult.error || 'Generering fejlede' }
    }

    const gen = genResult.data

    // Generate offer number
    const currentYear = new Date().getFullYear()
    const prefix = `TILBUD-${currentYear}-`
    const { data: lastOffer } = await supabase
      .from('offers')
      .select('offer_number')
      .like('offer_number', `${prefix}%`)
      .order('offer_number', { ascending: false })
      .limit(1)

    let offerNumber = `${prefix}0001`
    if (lastOffer && lastOffer.length > 0) {
      const numPart = parseInt(lastOffer[0].offer_number.split('-').pop() || '0', 10)
      offerNumber = `${prefix}${(numPart + 1).toString().padStart(4, '0')}`
    }

    // Build terms text with all sections
    const fullTerms = [
      gen.introduction,
      '',
      'OMFANG:',
      gen.scope_text,
      '',
      ...(gen.obs_points.length > 0 ? ['BEMÆRKNINGER:', ...gen.obs_points, ''] : []),
      'VILKÅR:',
      gen.terms_and_conditions,
      '',
      'GARANTI:',
      gen.warranty_text,
      '',
      ...gen.disclaimers,
    ].join('\n')

    // Calculate totals
    const subtotal = gen.line_items
      .filter((li) => li.total > 0)
      .reduce((sum, li) => sum + li.total, 0)

    const discountPct = options?.discount_percentage || 0
    const discountAmount = subtotal * (discountPct / 100)
    const taxPct = DEFAULT_TAX_RATE
    const taxAmount = (subtotal - discountAmount) * (taxPct / 100)
    const finalAmount = subtotal - discountAmount + taxAmount

    // Create the offer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .insert({
        offer_number: offerNumber,
        title: gen.title,
        description: gen.description,
        status: 'draft',
        customer_id: customerId,
        total_amount: subtotal,
        discount_percentage: discountPct,
        discount_amount: discountAmount,
        tax_percentage: taxPct,
        tax_amount: taxAmount,
        final_amount: finalAmount,
        terms_and_conditions: fullTerms,
        notes: gen.margin_warnings.length > 0
          ? `MARGIN ADVARSLER:\n${gen.margin_warnings.join('\n')}`
          : null,
        created_by: userId,
      })
      .select('id')
      .single()

    if (offerError || !offer) {
      console.error('Error creating offer:', offerError)
      throw new Error('DATABASE_ERROR')
    }

    // Create line items
    const lineItems = gen.line_items
      .filter((li) => li.total > 0)
      .map((li) => ({
        offer_id: offer.id,
        position: li.position,
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        unit_price: li.unit_price,
        discount_percentage: li.discount_percentage,
        total: li.total,
        section: li.section,
        cost_price: li.cost_price,
        line_type: 'calculation' as const,
        calculation_id: calculationId,
      }))

    if (lineItems.length > 0) {
      const { error: liError } = await supabase
        .from('offer_line_items')
        .insert(lineItems)

      if (liError) {
        console.error('Error creating line items:', liError)
        // Don't fail - offer is created, just missing line items
      }
    }

    // Update calculation status to converted
    await supabase
      .from('kalkia_calculations')
      .update({ status: 'converted' })
      .eq('id', calculationId)

    revalidatePath('/offers')
    revalidatePath('/calculator')

    return { success: true, data: { offer_id: offer.id } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke konvertere kalkulation til tilbud') }
  }
}
