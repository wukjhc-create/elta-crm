'use server'

import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types/common.types'
import { validateUUID } from '@/lib/validations/common'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Types
// =====================================================

export interface ComponentCategory {
  id: string
  name: string
  slug: string
  description: string | null
  sort_order: number
  is_active: boolean
}

export interface Component {
  id: string
  name: string
  code: string | null
  category_id: string | null
  description: string | null
  base_time_minutes: number
  difficulty_level: number
  requires_certification: boolean
  notes: string | null
  is_active: boolean
  default_cost_price: number
  default_sale_price: number
  complexity_factor: number
  labor_type: string
  created_at: string
  updated_at: string
  category?: ComponentCategory | null
}

export interface ComponentVariant {
  id: string
  component_id: string
  name: string
  code: string | null
  description: string | null
  time_multiplier: number
  extra_minutes: number
  price_multiplier: number
  is_default: boolean
  is_active: boolean
  sort_order: number
}

export interface ComponentMaterial {
  id: string
  component_id: string
  product_id: string | null
  material_name: string
  quantity: number
  unit: string
  is_optional: boolean
  cost_price: number
  sale_price: number
  notes: string | null
  sort_order: number
}

export interface VariantMaterial {
  id: string
  variant_id: string
  product_id: string | null
  material_name: string
  quantity: number
  unit: string
  replaces_base: boolean
  cost_price: number
  sale_price: number
  notes: string | null
  sort_order: number
}

export interface ComponentWithDetails extends Component {
  variants: ComponentVariant[]
  materials: ComponentMaterial[]
}
// =====================================================
// Get Categories
// =====================================================

export async function getComponentCategories(): Promise<ActionResult<ComponentCategory[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('calc_component_categories')
      .select('*')
      .order('sort_order')

    if (error) {
      logger.error('Database error fetching component categories', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as ComponentCategory[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kategorier') }
  }
}

// =====================================================
// Get Components
// =====================================================

export async function getComponents(): Promise<ActionResult<Component[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('calc_components')
      .select(`
        *,
        category:calc_component_categories(*)
      `)
      .eq('is_active', true)
      .order('name')

    if (error) {
      logger.error('Database error fetching components', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as Component[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente komponenter') }
  }
}

export async function getComponentsByCategory(categorySlug?: string): Promise<ActionResult<Component[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('calc_components')
      .select(`
        *,
        category:calc_component_categories(*)
      `)
      .eq('is_active', true)
      .order('name')

    if (categorySlug) {
      const { data: category, error: catError } = await supabase
        .from('calc_component_categories')
        .select('id')
        .eq('slug', categorySlug)
        .maybeSingle()

      if (catError) {
        logger.error('Database error fetching category', { error: catError })
        throw new Error('DATABASE_ERROR')
      }

      if (category) {
        query = query.eq('category_id', category.id)
      } else {
        // No category found, return empty list
        return { success: true, data: [] }
      }
    }

    const { data, error } = await query

    if (error) {
      logger.error('Database error fetching components', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as Component[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente komponenter') }
  }
}

// =====================================================
// Get Single Component with Details
// =====================================================

export async function getComponentWithDetails(id: string): Promise<ActionResult<ComponentWithDetails>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'komponent ID')

    // Get component
    const { data: component, error: compError } = await supabase
      .from('calc_components')
      .select(`
        *,
        category:calc_component_categories(*)
      `)
      .eq('id', id)
      .maybeSingle()

    if (compError) {
      logger.error('Database error fetching component', { error: compError })
      throw new Error('DATABASE_ERROR')
    }

    if (!component) {
      return { success: false, error: 'Komponenten blev ikke fundet' }
    }

    // Get variants
    const { data: variants, error: varError } = await supabase
      .from('calc_component_variants')
      .select('*')
      .eq('component_id', id)
      .order('sort_order')

    if (varError) {
      logger.error('Database error fetching variants', { error: varError })
      throw new Error('DATABASE_ERROR')
    }

    // Get materials
    const { data: materials, error: matError } = await supabase
      .from('calc_component_materials')
      .select('*')
      .eq('component_id', id)
      .order('sort_order')

    if (matError) {
      logger.error('Database error fetching materials', { error: matError })
      throw new Error('DATABASE_ERROR')
    }

    return {
      success: true,
      data: {
        ...component,
        variants: variants || [],
        materials: materials || [],
      } as ComponentWithDetails,
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente komponent') }
  }
}

// =====================================================
// Update Component
// =====================================================

export async function updateComponent(
  id: string,
  data: {
    name?: string
    description?: string | null
    base_time_minutes?: number
    difficulty_level?: number
    default_cost_price?: number
    default_sale_price?: number
    complexity_factor?: number
  }
): Promise<ActionResult<Component>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'komponent ID')

    const { data: updated, error } = await supabase
      .from('calc_components')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Komponenten blev ikke fundet' }
      }
      logger.error('Database error updating component', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/components')
    revalidatePath(`/dashboard/settings/components/${id}`)

    return { success: true, data: updated as Component }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere komponent') }
  }
}

// =====================================================
// Variant CRUD
// =====================================================

export async function createVariant(
  componentId: string,
  data: {
    name: string
    code?: string
    description?: string
    time_multiplier?: number
    extra_minutes?: number
    price_multiplier?: number
    is_default?: boolean
    is_active?: boolean
  }
): Promise<ActionResult<ComponentVariant>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(componentId, 'komponent ID')

    if (!data.name || data.name.trim().length === 0) {
      return { success: false, error: 'Navn er påkrævet' }
    }

    // Get next sort order
    const { data: existing, error: orderError } = await supabase
      .from('calc_component_variants')
      .select('sort_order')
      .eq('component_id', componentId)
      .order('sort_order', { ascending: false })
      .limit(1)

    if (orderError) {
      logger.error('Database error fetching sort order', { error: orderError })
      throw new Error('DATABASE_ERROR')
    }

    const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

    // If this is set as default, unset other defaults
    if (data.is_default) {
      const { error: updateError } = await supabase
        .from('calc_component_variants')
        .update({ is_default: false })
        .eq('component_id', componentId)

      if (updateError) {
        logger.error('Database error updating defaults', { error: updateError })
        throw new Error('DATABASE_ERROR')
      }
    }

    const { data: created, error } = await supabase
      .from('calc_component_variants')
      .insert({
        component_id: componentId,
        name: data.name.trim(),
        code: data.code || data.name.trim().toUpperCase().replace(/\s+/g, '_'),
        description: data.description || null,
        time_multiplier: data.time_multiplier ?? 1.0,
        extra_minutes: data.extra_minutes ?? 0,
        price_multiplier: data.price_multiplier ?? 1.0,
        is_default: data.is_default ?? false,
        is_active: data.is_active ?? true,
        sort_order: nextSortOrder,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'En variant med dette navn findes allerede' }
      }
      logger.error('Database error creating variant', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true, data: created as ComponentVariant }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette variant') }
  }
}

export async function updateVariant(
  id: string,
  componentId: string,
  data: {
    name?: string
    code?: string
    description?: string | null
    time_multiplier?: number
    extra_minutes?: number
    price_multiplier?: number
    is_default?: boolean
    is_active?: boolean
  }
): Promise<ActionResult<ComponentVariant>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'variant ID')
    validateUUID(componentId, 'komponent ID')

    // If setting as default, unset other defaults first
    if (data.is_default) {
      const { error: updateError } = await supabase
        .from('calc_component_variants')
        .update({ is_default: false })
        .eq('component_id', componentId)
        .neq('id', id)

      if (updateError) {
        logger.error('Database error updating defaults', { error: updateError })
        throw new Error('DATABASE_ERROR')
      }
    }

    const { data: updated, error } = await supabase
      .from('calc_component_variants')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Varianten blev ikke fundet' }
      }
      logger.error('Database error updating variant', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true, data: updated as ComponentVariant }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere variant') }
  }
}

export async function deleteVariant(id: string, componentId: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'variant ID')
    validateUUID(componentId, 'komponent ID')

    const { error } = await supabase
      .from('calc_component_variants')
      .delete()
      .eq('id', id)

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Varianten kan ikke slettes da den bruges i kalkulationer' }
      }
      logger.error('Database error deleting variant', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette variant') }
  }
}

// =====================================================
// Material CRUD
// =====================================================

export async function createMaterial(
  componentId: string,
  data: {
    material_name: string
    quantity?: number
    unit?: string
    is_optional?: boolean
    cost_price?: number
    sale_price?: number
    notes?: string
  }
): Promise<ActionResult<ComponentMaterial>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(componentId, 'komponent ID')

    if (!data.material_name || data.material_name.trim().length === 0) {
      return { success: false, error: 'Materialenavn er påkrævet' }
    }

    // Get next sort order
    const { data: existing, error: orderError } = await supabase
      .from('calc_component_materials')
      .select('sort_order')
      .eq('component_id', componentId)
      .order('sort_order', { ascending: false })
      .limit(1)

    if (orderError) {
      logger.error('Database error fetching sort order', { error: orderError })
      throw new Error('DATABASE_ERROR')
    }

    const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

    const { data: created, error } = await supabase
      .from('calc_component_materials')
      .insert({
        component_id: componentId,
        material_name: data.material_name.trim(),
        quantity: data.quantity ?? 1,
        unit: data.unit ?? 'stk',
        is_optional: data.is_optional ?? false,
        cost_price: data.cost_price ?? 0,
        sale_price: data.sale_price ?? 0,
        notes: data.notes || null,
        sort_order: nextSortOrder,
      })
      .select()
      .single()

    if (error) {
      logger.error('Database error creating material', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true, data: created as ComponentMaterial }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette materiale') }
  }
}

export async function updateMaterial(
  id: string,
  componentId: string,
  data: {
    material_name?: string
    quantity?: number
    unit?: string
    is_optional?: boolean
    cost_price?: number
    sale_price?: number
    notes?: string | null
  }
): Promise<ActionResult<ComponentMaterial>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'materiale ID')
    validateUUID(componentId, 'komponent ID')

    const { data: updated, error } = await supabase
      .from('calc_component_materials')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Materialet blev ikke fundet' }
      }
      logger.error('Database error updating material', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true, data: updated as ComponentMaterial }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere materiale') }
  }
}

export async function deleteMaterial(id: string, componentId: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'materiale ID')
    validateUUID(componentId, 'komponent ID')

    const { error } = await supabase
      .from('calc_component_materials')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting material', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette materiale') }
  }
}

// =====================================================
// Get Variant Materials
// =====================================================

export async function getVariantMaterials(variantId: string): Promise<ActionResult<VariantMaterial[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(variantId, 'variant ID')

    const { data, error } = await supabase
      .from('calc_component_variant_materials')
      .select('*')
      .eq('variant_id', variantId)
      .order('sort_order')

    if (error) {
      logger.error('Database error fetching variant materials', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as VariantMaterial[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente variant-materialer') }
  }
}

export async function createVariantMaterial(
  variantId: string,
  componentId: string,
  data: {
    material_name: string
    quantity?: number
    unit?: string
    replaces_base?: boolean
    cost_price?: number
    sale_price?: number
    notes?: string
  }
): Promise<ActionResult<VariantMaterial>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(variantId, 'variant ID')
    validateUUID(componentId, 'komponent ID')

    if (!data.material_name || data.material_name.trim().length === 0) {
      return { success: false, error: 'Materialenavn er påkrævet' }
    }

    // Get next sort order
    const { data: existing, error: orderError } = await supabase
      .from('calc_component_variant_materials')
      .select('sort_order')
      .eq('variant_id', variantId)
      .order('sort_order', { ascending: false })
      .limit(1)

    if (orderError) {
      logger.error('Database error fetching sort order', { error: orderError })
      throw new Error('DATABASE_ERROR')
    }

    const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

    const { data: created, error } = await supabase
      .from('calc_component_variant_materials')
      .insert({
        variant_id: variantId,
        material_name: data.material_name.trim(),
        quantity: data.quantity ?? 1,
        unit: data.unit ?? 'stk',
        replaces_base: data.replaces_base ?? false,
        cost_price: data.cost_price ?? 0,
        sale_price: data.sale_price ?? 0,
        notes: data.notes || null,
        sort_order: nextSortOrder,
      })
      .select()
      .single()

    if (error) {
      logger.error('Database error creating variant material', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true, data: created as VariantMaterial }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette variant-materiale') }
  }
}

export async function deleteVariantMaterial(id: string, componentId: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'variant-materiale ID')
    validateUUID(componentId, 'komponent ID')

    const { error } = await supabase
      .from('calc_component_variant_materials')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting variant material', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette variant-materiale') }
  }
}

// =====================================================
// Kalkia Component Browser Functions
// =====================================================

export interface ComponentSummary {
  id: string
  code: string | null
  name: string
  description: string | null
  base_time_minutes: number
  difficulty_level: number
  category_name: string | null
  category_slug: string | null
  variant_count: number
  material_count: number
  is_active: boolean
}

export interface ComponentForCalculation extends Component {
  variants: ComponentVariant[]
  materials: ComponentMaterial[]
  labor_rules: {
    id: string
    rule_name: string
    condition_type: string
    condition_value: Record<string, unknown>
    extra_minutes: number
    time_multiplier: number
    description: string | null
  }[]
}

/**
 * Get browseable components for initial display in Kalkia component browser.
 * Returns active components with category info and counts.
 */
export async function getCalcComponentsBrowse(
  limit: number = 50
): Promise<ActionResult<ComponentSummary[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('v_calc_components_summary')
      .select('*')
      .eq('is_active', true)
      .order('category_name')
      .order('name')
      .limit(limit)

    if (error) {
      logger.error('Database error fetching browse components', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as ComponentSummary[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente komponenter') }
  }
}

/**
 * Search components by name, code, or description.
 */
export async function searchCalcComponents(
  query: string,
  limit: number = 30
): Promise<ActionResult<ComponentSummary[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const sanitized = query.trim().toLowerCase()
    if (!sanitized || sanitized.length < 2) {
      return { success: true, data: [] }
    }

    const { data, error } = await supabase
      .from('v_calc_components_summary')
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${sanitized}%,code.ilike.%${sanitized}%,description.ilike.%${sanitized}%,category_name.ilike.%${sanitized}%`)
      .order('name')
      .limit(limit)

    if (error) {
      logger.error('Database error searching components', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as ComponentSummary[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Søgning fejlede') }
  }
}

/**
 * Get a component with all details needed for calculation:
 * - Component base data
 * - All variants with materials
 * - Labor rules
 */
export async function getCalcComponentForCalculation(
  id?: string,
  code?: string
): Promise<ActionResult<ComponentForCalculation>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    if (!id && !code) {
      return { success: false, error: 'Enten ID eller kode skal angives' }
    }

    if (id) {
      validateUUID(id, 'komponent ID')
    }

    // Get component with category - by ID or code
    let query = supabase
      .from('calc_components')
      .select(`
        *,
        category:calc_component_categories(*)
      `)

    if (id) {
      query = query.eq('id', id)
    } else if (code) {
      query = query.eq('code', code)
    }

    const { data: component, error: compError } = await query.maybeSingle()

    if (compError) {
      logger.error('Database error fetching component', { error: compError })
      throw new Error('DATABASE_ERROR')
    }

    if (!component) {
      return { success: false, error: 'Komponenten blev ikke fundet' }
    }

    const componentId = component.id

    // Get variants
    const { data: variants, error: varError } = await supabase
      .from('calc_component_variants')
      .select('*')
      .eq('component_id', componentId)
      .order('sort_order')

    if (varError) {
      logger.error('Database error fetching variants', { error: varError })
      throw new Error('DATABASE_ERROR')
    }

    // Get base materials
    const { data: materials, error: matError } = await supabase
      .from('calc_component_materials')
      .select('*')
      .eq('component_id', componentId)
      .order('sort_order')

    if (matError) {
      logger.error('Database error fetching materials', { error: matError })
      throw new Error('DATABASE_ERROR')
    }

    // Get labor rules
    const { data: laborRules, error: ruleError } = await supabase
      .from('calc_component_labor_rules')
      .select('*')
      .eq('component_id', componentId)
      .eq('is_active', true)
      .order('sort_order')

    if (ruleError) {
      logger.error('Database error fetching labor rules', { error: ruleError })
      throw new Error('DATABASE_ERROR')
    }

    return {
      success: true,
      data: {
        ...component,
        variants: variants || [],
        materials: materials || [],
        labor_rules: laborRules || [],
      } as ComponentForCalculation,
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente komponent') }
  }
}
