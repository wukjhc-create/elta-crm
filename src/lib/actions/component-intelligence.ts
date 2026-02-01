'use server'

import { createClient, getUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types/common.types'
import type {
  RoomType,
  RoomTemplate,
  RoomTemplateWithRelations,
  RoomComponentSuggestion,
  Material,
  MaterialPriceHistory,
  OfferTextTemplate,
  IntelligentTimeCalculation,
  TimeProfile,
  CreateMaterialInput,
  UpdateMaterialInput,
  CreateRoomTemplateInput,
  UpdateRoomTemplateInput,
  CreateOfferTextInput,
  UpdateOfferTextInput,
} from '@/types/component-intelligence.types'

// =====================================================
// HELPER FUNCTIONS
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
  }
  console.error(`${defaultMessage}:`, err)
  return defaultMessage
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

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente rumtyper') }
  }
}

export async function getRoomType(id: string): Promise<ActionResult<RoomType>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('room_types')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Rumtype ikke fundet' }
      }
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente rumtype') }
  }
}

export async function createRoomType(
  input: Omit<RoomType, 'id' | 'created_at' | 'updated_at'>
): Promise<ActionResult<RoomType>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('room_types')
      .insert({
        ...input,
        is_active: input.is_active ?? true,
      })
      .select()
      .single()

    if (error) {
      console.error('Database error creating room type:', error)
      if (error.code === '23505') {
        return { success: false, error: 'En rumtype med denne kode eksisterer allerede' }
      }
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/rooms')
    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette rumtype') }
  }
}

export async function updateRoomType(
  id: string,
  input: Partial<Omit<RoomType, 'id' | 'created_at' | 'updated_at'>>
): Promise<ActionResult<RoomType>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('room_types')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Database error updating room type:', error)
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Rumtype ikke fundet' }
      }
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/rooms')
    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere rumtype') }
  }
}

export async function deleteRoomType(id: string): Promise<ActionResult<void>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from('room_types')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Database error deleting room type:', error)
      if (error.code === '23503') {
        return { success: false, error: 'Rumtypen bruges af andre data og kan ikke slettes' }
      }
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/rooms')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette rumtype') }
  }
}

export async function getRoomComponentSuggestions(
  roomTypeCode: string,
  sizeM2: number
): Promise<ActionResult<RoomComponentSuggestion[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('get_room_component_suggestions', {
      p_room_type_code: roomTypeCode,
      p_size_m2: sizeM2,
    })

    if (error) {
      console.error('Database error getting room suggestions:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente rumforslag') }
  }
}

// =====================================================
// ROOM TEMPLATES
// =====================================================

export async function getRoomTemplates(options?: {
  room_type_id?: string
  tier?: string
}): Promise<ActionResult<RoomTemplateWithRelations[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from('room_templates')
      .select(`
        *,
        room_type:room_types(*)
      `)
      .eq('is_active', true)
      .order('sort_order')

    if (options?.room_type_id) {
      query = query.eq('room_type_id', options.room_type_id)
    }

    if (options?.tier) {
      query = query.eq('tier', options.tier)
    }

    const { data, error } = await query

    if (error) {
      console.error('Database error fetching room templates:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente rumskabeloner') }
  }
}

export async function createRoomTemplate(
  input: CreateRoomTemplateInput
): Promise<ActionResult<RoomTemplate>> {
  try {
    const userId = await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('room_templates')
      .insert({
        ...input,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      console.error('Database error creating room template:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia')
    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette rumskabelon') }
  }
}

export async function updateRoomTemplate(
  input: UpdateRoomTemplateInput
): Promise<ActionResult<RoomTemplate>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { id, ...updateData } = input

    const { data, error } = await supabase
      .from('room_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Rumskabelon ikke fundet' }
      }
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia')
    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere rumskabelon') }
  }
}

export async function deleteRoomTemplate(id: string): Promise<ActionResult<void>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from('room_templates')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette rumskabelon') }
  }
}

// =====================================================
// MATERIALS CATALOG
// =====================================================

export async function getMaterials(options?: {
  category?: string
  search?: string
  limit?: number
}): Promise<ActionResult<Material[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from('materials_catalog')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('name')

    if (options?.category) {
      query = query.eq('category', options.category)
    }

    if (options?.search) {
      query = query.or(`name.ilike.%${options.search}%,sku.ilike.%${options.search}%,description.ilike.%${options.search}%`)
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query

    if (error) {
      console.error('Database error fetching materials:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente materialer') }
  }
}

export async function getMaterial(id: string): Promise<ActionResult<Material>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('materials_catalog')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Materiale ikke fundet' }
      }
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente materiale') }
  }
}

export async function createMaterial(
  input: CreateMaterialInput
): Promise<ActionResult<Material>> {
  try {
    const userId = await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('materials_catalog')
      .insert({
        ...input,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'SKU eksisterer allerede' }
      }
      console.error('Database error creating material:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Record initial price in history
    await supabase.from('material_price_history').insert({
      material_id: data.id,
      cost_price: input.cost_price,
      sale_price: input.sale_price,
      change_reason: 'Initial pris',
      changed_by: userId,
    })

    revalidatePath('/dashboard/settings/materials')
    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette materiale') }
  }
}

export async function updateMaterial(
  input: UpdateMaterialInput
): Promise<ActionResult<Material>> {
  try {
    const userId = await requireAuth()
    const supabase = await createClient()

    const { id, ...updateData } = input

    // Get current material for price comparison
    const { data: currentMaterial } = await supabase
      .from('materials_catalog')
      .select('cost_price, sale_price')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('materials_catalog')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Materiale ikke fundet' }
      }
      if (error.code === '23505') {
        return { success: false, error: 'SKU eksisterer allerede' }
      }
      throw new Error('DATABASE_ERROR')
    }

    // Record price change if prices changed
    if (currentMaterial && (
      (input.cost_price !== undefined && input.cost_price !== currentMaterial.cost_price) ||
      (input.sale_price !== undefined && input.sale_price !== currentMaterial.sale_price)
    )) {
      await supabase.from('material_price_history').insert({
        material_id: id,
        cost_price: input.cost_price ?? currentMaterial.cost_price,
        sale_price: input.sale_price ?? currentMaterial.sale_price,
        change_reason: 'Prisopdatering',
        changed_by: userId,
      })
    }

    revalidatePath('/dashboard/settings/materials')
    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere materiale') }
  }
}

export async function deleteMaterial(id: string): Promise<ActionResult<void>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Soft delete by setting is_active = false
    const { error } = await supabase
      .from('materials_catalog')
      .update({ is_active: false, discontinued_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/materials')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette materiale') }
  }
}

export async function getMaterialPriceHistory(
  materialId: string
): Promise<ActionResult<MaterialPriceHistory[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('material_price_history')
      .select('*')
      .eq('material_id', materialId)
      .order('effective_from', { ascending: false })
      .limit(20)

    if (error) {
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente prishistorik') }
  }
}

export async function updateMaterialPrice(
  materialId: string,
  input: {
    cost_price: number
    sale_price: number
    change_reason?: string
  }
): Promise<ActionResult<Material>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Get current prices
    const { data: current, error: fetchError } = await supabase
      .from('materials_catalog')
      .select('cost_price, sale_price')
      .eq('id', materialId)
      .single()

    if (fetchError || !current) {
      return { success: false, error: 'Materiale ikke fundet' }
    }

    // Record price history (stores the new price as a snapshot)
    const { error: historyError } = await supabase
      .from('material_price_history')
      .insert({
        material_id: materialId,
        cost_price: input.cost_price,
        sale_price: input.sale_price,
        change_reason: input.change_reason,
        effective_from: new Date().toISOString(),
      })

    if (historyError) {
      console.error('Error recording price history:', historyError)
      // Continue anyway - price update is more important
    }

    // Update material prices
    const { data, error } = await supabase
      .from('materials_catalog')
      .update({
        cost_price: input.cost_price,
        sale_price: input.sale_price,
        updated_at: new Date().toISOString(),
      })
      .eq('id', materialId)
      .select()
      .single()

    if (error) {
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/materials')
    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere priser') }
  }
}

// =====================================================
// OFFER TEXT TEMPLATES
// =====================================================

export async function getOfferTextTemplates(options?: {
  scope_type?: string
  scope_id?: string
  template_key?: string
}): Promise<ActionResult<OfferTextTemplate[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from('offer_text_templates')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })

    if (options?.scope_type) {
      query = query.eq('scope_type', options.scope_type)
    }

    if (options?.scope_id) {
      query = query.eq('scope_id', options.scope_id)
    }

    if (options?.template_key) {
      query = query.eq('template_key', options.template_key)
    }

    const { data, error } = await query

    if (error) {
      console.error('Database error fetching offer templates:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente tilbudstekster') }
  }
}

export async function createOfferTextTemplate(
  input: CreateOfferTextInput
): Promise<ActionResult<OfferTextTemplate>> {
  try {
    const userId = await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('offer_text_templates')
      .insert({
        ...input,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      console.error('Database error creating offer template:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia')
    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette tilbudstekst') }
  }
}

export async function updateOfferTextTemplate(
  input: UpdateOfferTextInput
): Promise<ActionResult<OfferTextTemplate>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { id, ...updateData } = input

    const { data, error } = await supabase
      .from('offer_text_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Tilbudstekst ikke fundet' }
      }
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia')
    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere tilbudstekst') }
  }
}

export async function deleteOfferTextTemplate(id: string): Promise<ActionResult<void>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from('offer_text_templates')
      .update({ is_active: false })
      .eq('id', id)

    if (error) {
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette tilbudstekst') }
  }
}

// =====================================================
// INTELLIGENT TIME CALCULATION
// =====================================================

export async function calculateIntelligentTime(
  componentId: string,
  quantity: number,
  variantMultiplier: number = 1.0
): Promise<ActionResult<IntelligentTimeCalculation>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Get component with intelligence data
    const { data: component, error } = await supabase
      .from('calc_components')
      .select(`
        base_time_minutes,
        first_unit_time_minutes,
        subsequent_unit_time_minutes,
        setup_time_minutes,
        cleanup_time_minutes,
        time_profile
      `)
      .eq('id', componentId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Komponent ikke fundet' }
      }
      throw new Error('DATABASE_ERROR')
    }

    const timeProfile = (component.time_profile || 'linear') as TimeProfile
    const firstTime = component.first_unit_time_minutes ?? component.base_time_minutes
    const subsequentTime = component.subsequent_unit_time_minutes ?? component.base_time_minutes
    const setupTime = component.setup_time_minutes ?? 0
    const cleanupTime = component.cleanup_time_minutes ?? 0

    let totalMinutes: number
    let firstUnitCalc = 0
    let subsequentUnitsCalc = 0

    switch (timeProfile) {
      case 'fixed':
        totalMinutes = firstTime
        firstUnitCalc = firstTime
        break

      case 'diminishing':
        if (quantity === 1) {
          totalMinutes = firstTime
          firstUnitCalc = firstTime
        } else {
          totalMinutes = firstTime + (quantity - 1) * subsequentTime
          firstUnitCalc = firstTime
          subsequentUnitsCalc = (quantity - 1) * subsequentTime
        }
        break

      case 'batch':
        totalMinutes = setupTime + quantity * subsequentTime
        subsequentUnitsCalc = quantity * subsequentTime
        break

      case 'stepped':
        // Every 5 units adds extra setup time
        const steps = Math.floor(quantity / 5)
        totalMinutes = quantity * component.base_time_minutes + steps * setupTime
        subsequentUnitsCalc = totalMinutes
        break

      default: // linear
        totalMinutes = quantity * component.base_time_minutes
        subsequentUnitsCalc = totalMinutes
    }

    // Apply variant multiplier
    totalMinutes = Math.round(totalMinutes * variantMultiplier)
    firstUnitCalc = Math.round(firstUnitCalc * variantMultiplier)
    subsequentUnitsCalc = Math.round(subsequentUnitsCalc * variantMultiplier)

    // Add setup and cleanup for non-fixed profiles
    if (timeProfile !== 'fixed') {
      totalMinutes += setupTime + cleanupTime
    }

    const result: IntelligentTimeCalculation = {
      base_time: component.base_time_minutes,
      first_unit_time: firstTime,
      subsequent_unit_time: subsequentTime,
      setup_time: setupTime,
      cleanup_time: cleanupTime,
      quantity,
      time_profile: timeProfile,
      total_minutes: totalMinutes,
      breakdown: {
        setup: setupTime,
        first_unit: firstUnitCalc,
        subsequent_units: subsequentUnitsCalc,
        cleanup: cleanupTime,
      },
    }

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke beregne tid') }
  }
}

// =====================================================
// GET OFFER TEXTS FOR CALCULATION
// =====================================================

export async function getOfferTextsForCalculation(
  componentCodes: string[],
  roomTypeCodes: string[] = [],
  buildingProfileCode?: string
): Promise<ActionResult<{
  descriptions: Record<string, string>
  obsPoints: string[]
  globalTexts: OfferTextTemplate[]
}>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Get component-level texts
    const { data: componentTexts } = await supabase
      .from('calc_components')
      .select('code, offer_description, offer_obs_points')
      .in('code', componentCodes)

    // Get global and category texts
    const { data: templateTexts } = await supabase
      .from('offer_text_templates')
      .select('*')
      .eq('is_active', true)
      .in('scope_type', ['global', 'category', 'room_type'])
      .order('priority', { ascending: false })

    // Build descriptions map
    const descriptions: Record<string, string> = {}
    const obsPointsSet = new Set<string>()

    for (const comp of componentTexts || []) {
      if (comp.offer_description) {
        descriptions[comp.code] = comp.offer_description
      }
      if (comp.offer_obs_points) {
        const points = comp.offer_obs_points as string[]
        points.forEach((p) => obsPointsSet.add(p))
      }
    }

    // Filter template texts by conditions
    const globalTexts: OfferTextTemplate[] = []
    for (const template of templateTexts || []) {
      const conditions = template.conditions as {
        room_types?: string[]
        component_codes?: string[]
        building_profiles?: string[]
      }

      let matches = true

      if (conditions.room_types?.length) {
        matches = matches && conditions.room_types.some((rt) => roomTypeCodes.includes(rt))
      }

      if (conditions.component_codes?.length) {
        matches = matches && conditions.component_codes.some((cc) => componentCodes.includes(cc))
      }

      if (conditions.building_profiles?.length && buildingProfileCode) {
        matches = matches && conditions.building_profiles.includes(buildingProfileCode)
      }

      if (matches) {
        globalTexts.push(template)
        if (template.template_key === 'obs_point') {
          obsPointsSet.add(template.content)
        }
      }
    }

    return {
      success: true,
      data: {
        descriptions,
        obsPoints: Array.from(obsPointsSet),
        globalTexts,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente tilbudstekster') }
  }
}

// =====================================================
// BULK UPDATE MATERIAL PRICES
// =====================================================

export async function bulkUpdateMaterialPrices(
  updates: Array<{ id: string; cost_price?: number; sale_price?: number }>
): Promise<ActionResult<{ updated: number }>> {
  try {
    const userId = await requireAuth()
    const supabase = await createClient()

    let updatedCount = 0

    for (const update of updates) {
      const { id, cost_price, sale_price } = update

      if (cost_price === undefined && sale_price === undefined) continue

      // Get current prices
      const { data: current } = await supabase
        .from('materials_catalog')
        .select('cost_price, sale_price')
        .eq('id', id)
        .single()

      if (!current) continue

      const newCostPrice = cost_price ?? current.cost_price
      const newSalePrice = sale_price ?? current.sale_price

      // Update material
      const { error: updateError } = await supabase
        .from('materials_catalog')
        .update({ cost_price: newCostPrice, sale_price: newSalePrice })
        .eq('id', id)

      if (!updateError) {
        // Record price history
        await supabase.from('material_price_history').insert({
          material_id: id,
          cost_price: newCostPrice,
          sale_price: newSalePrice,
          change_reason: 'Masseopdatering',
          changed_by: userId,
        })

        updatedCount++
      }
    }

    revalidatePath('/dashboard/settings/materials')
    return { success: true, data: { updated: updatedCount } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere priser') }
  }
}
