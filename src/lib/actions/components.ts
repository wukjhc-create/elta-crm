'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

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
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('calc_component_categories')
      .select('*')
      .order('sort_order')

    if (error) throw error

    return { success: true, data: data as ComponentCategory[] }
  } catch (err) {
    console.error('Error fetching component categories:', err)
    return { success: false, error: 'Kunne ikke hente kategorier' }
  }
}

// =====================================================
// Get Components
// =====================================================

export async function getComponents(): Promise<ActionResult<Component[]>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('calc_components')
      .select(`
        *,
        category:calc_component_categories(*)
      `)
      .eq('is_active', true)
      .order('name')

    if (error) throw error

    return { success: true, data: data as Component[] }
  } catch (err) {
    console.error('Error fetching components:', err)
    return { success: false, error: 'Kunne ikke hente komponenter' }
  }
}

export async function getComponentsByCategory(categorySlug?: string): Promise<ActionResult<Component[]>> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('calc_components')
      .select(`
        *,
        category:calc_component_categories(*)
      `)
      .eq('is_active', true)
      .order('name')

    if (categorySlug) {
      const { data: category } = await supabase
        .from('calc_component_categories')
        .select('id')
        .eq('slug', categorySlug)
        .single()

      if (category) {
        query = query.eq('category_id', category.id)
      }
    }

    const { data, error } = await query

    if (error) throw error

    return { success: true, data: data as Component[] }
  } catch (err) {
    console.error('Error fetching components by category:', err)
    return { success: false, error: 'Kunne ikke hente komponenter' }
  }
}

// =====================================================
// Get Single Component with Details
// =====================================================

export async function getComponentWithDetails(id: string): Promise<ActionResult<ComponentWithDetails>> {
  try {
    const supabase = await createClient()

    // Get component
    const { data: component, error: compError } = await supabase
      .from('calc_components')
      .select(`
        *,
        category:calc_component_categories(*)
      `)
      .eq('id', id)
      .single()

    if (compError) throw compError

    // Get variants
    const { data: variants, error: varError } = await supabase
      .from('calc_component_variants')
      .select('*')
      .eq('component_id', id)
      .order('sort_order')

    if (varError) throw varError

    // Get materials
    const { data: materials, error: matError } = await supabase
      .from('calc_component_materials')
      .select('*')
      .eq('component_id', id)
      .order('sort_order')

    if (matError) throw matError

    return {
      success: true,
      data: {
        ...component,
        variants: variants || [],
        materials: materials || [],
      } as ComponentWithDetails,
    }
  } catch (err) {
    console.error('Error fetching component details:', err)
    return { success: false, error: 'Kunne ikke hente komponent' }
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
    const supabase = await createClient()

    const { data: updated, error } = await supabase
      .from('calc_components')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/settings/components')
    revalidatePath(`/dashboard/settings/components/${id}`)

    return { success: true, data: updated as Component }
  } catch (err) {
    console.error('Error updating component:', err)
    return { success: false, error: 'Kunne ikke opdatere komponent' }
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
  }
): Promise<ActionResult<ComponentVariant>> {
  try {
    const supabase = await createClient()

    // Get next sort order
    const { data: existing } = await supabase
      .from('calc_component_variants')
      .select('sort_order')
      .eq('component_id', componentId)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

    // If this is set as default, unset other defaults
    if (data.is_default) {
      await supabase
        .from('calc_component_variants')
        .update({ is_default: false })
        .eq('component_id', componentId)
    }

    const { data: created, error } = await supabase
      .from('calc_component_variants')
      .insert({
        component_id: componentId,
        name: data.name,
        code: data.code || data.name.toUpperCase().replace(/\s+/g, '_'),
        description: data.description,
        time_multiplier: data.time_multiplier ?? 1.0,
        extra_minutes: data.extra_minutes ?? 0,
        price_multiplier: data.price_multiplier ?? 1.0,
        is_default: data.is_default ?? false,
        sort_order: nextSortOrder,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true, data: created as ComponentVariant }
  } catch (err) {
    console.error('Error creating variant:', err)
    return { success: false, error: 'Kunne ikke oprette variant' }
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
  }
): Promise<ActionResult<ComponentVariant>> {
  try {
    const supabase = await createClient()

    // If setting as default, unset other defaults first
    if (data.is_default) {
      await supabase
        .from('calc_component_variants')
        .update({ is_default: false })
        .eq('component_id', componentId)
        .neq('id', id)
    }

    const { data: updated, error } = await supabase
      .from('calc_component_variants')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true, data: updated as ComponentVariant }
  } catch (err) {
    console.error('Error updating variant:', err)
    return { success: false, error: 'Kunne ikke opdatere variant' }
  }
}

export async function deleteVariant(id: string, componentId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('calc_component_variants')
      .delete()
      .eq('id', id)

    if (error) throw error

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true }
  } catch (err) {
    console.error('Error deleting variant:', err)
    return { success: false, error: 'Kunne ikke slette variant' }
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
    notes?: string
  }
): Promise<ActionResult<ComponentMaterial>> {
  try {
    const supabase = await createClient()

    // Get next sort order
    const { data: existing } = await supabase
      .from('calc_component_materials')
      .select('sort_order')
      .eq('component_id', componentId)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

    const { data: created, error } = await supabase
      .from('calc_component_materials')
      .insert({
        component_id: componentId,
        material_name: data.material_name,
        quantity: data.quantity ?? 1,
        unit: data.unit ?? 'stk',
        is_optional: data.is_optional ?? false,
        notes: data.notes,
        sort_order: nextSortOrder,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true, data: created as ComponentMaterial }
  } catch (err) {
    console.error('Error creating material:', err)
    return { success: false, error: 'Kunne ikke oprette materiale' }
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
    notes?: string | null
  }
): Promise<ActionResult<ComponentMaterial>> {
  try {
    const supabase = await createClient()

    const { data: updated, error } = await supabase
      .from('calc_component_materials')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true, data: updated as ComponentMaterial }
  } catch (err) {
    console.error('Error updating material:', err)
    return { success: false, error: 'Kunne ikke opdatere materiale' }
  }
}

export async function deleteMaterial(id: string, componentId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('calc_component_materials')
      .delete()
      .eq('id', id)

    if (error) throw error

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true }
  } catch (err) {
    console.error('Error deleting material:', err)
    return { success: false, error: 'Kunne ikke slette materiale' }
  }
}

// =====================================================
// Get Variant Materials
// =====================================================

export async function getVariantMaterials(variantId: string): Promise<ActionResult<VariantMaterial[]>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('calc_component_variant_materials')
      .select('*')
      .eq('variant_id', variantId)
      .order('sort_order')

    if (error) throw error

    return { success: true, data: data as VariantMaterial[] }
  } catch (err) {
    console.error('Error fetching variant materials:', err)
    return { success: false, error: 'Kunne ikke hente variant-materialer' }
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
    notes?: string
  }
): Promise<ActionResult<VariantMaterial>> {
  try {
    const supabase = await createClient()

    // Get next sort order
    const { data: existing } = await supabase
      .from('calc_component_variant_materials')
      .select('sort_order')
      .eq('variant_id', variantId)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

    const { data: created, error } = await supabase
      .from('calc_component_variant_materials')
      .insert({
        variant_id: variantId,
        material_name: data.material_name,
        quantity: data.quantity ?? 1,
        unit: data.unit ?? 'stk',
        replaces_base: data.replaces_base ?? false,
        notes: data.notes,
        sort_order: nextSortOrder,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true, data: created as VariantMaterial }
  } catch (err) {
    console.error('Error creating variant material:', err)
    return { success: false, error: 'Kunne ikke oprette variant-materiale' }
  }
}

export async function deleteVariantMaterial(id: string, componentId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('calc_component_variant_materials')
      .delete()
      .eq('id', id)

    if (error) throw error

    revalidatePath(`/dashboard/settings/components/${componentId}`)

    return { success: true }
  } catch (err) {
    console.error('Error deleting variant material:', err)
    return { success: false, error: 'Kunne ikke slette variant-materiale' }
  }
}
