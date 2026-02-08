'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  createKalkiaNodeSchema,
  updateKalkiaNodeSchema,
  createKalkiaVariantSchema,
  updateKalkiaVariantSchema,
  createKalkiaVariantMaterialSchema,
  updateKalkiaVariantMaterialSchema,
  createKalkiaBuildingProfileSchema,
  updateKalkiaBuildingProfileSchema,
  createKalkiaGlobalFactorSchema,
  updateKalkiaGlobalFactorSchema,
  createKalkiaRuleSchema,
  updateKalkiaRuleSchema,
  createKalkiaCalculationSchema,
  updateKalkiaCalculationSchema,
  createKalkiaCalculationRowSchema,
  updateKalkiaCalculationRowSchema,
} from '@/lib/validations/kalkia'
import { validateUUID, sanitizeSearchTerm } from '@/lib/validations/common'
import type {
  KalkiaNode,
  KalkiaNodeWithRelations,
  KalkiaNodeSummary,
  KalkiaVariant,
  KalkiaVariantWithMaterials,
  KalkiaVariantMaterial,
  KalkiaBuildingProfile,
  KalkiaGlobalFactor,
  KalkiaRule,
  KalkiaCalculation,
  KalkiaCalculationWithRelations,
  KalkiaCalculationSummary,
  KalkiaCalculationRow,
  KalkiaCalculationRowWithRelations,
  KalkiaNodeFilters,
  KalkiaCalculationFilters,
  KalkiaCalculationItemInput,
  CalculationResult,
} from '@/types/kalkia.types'
import type { ActionResult, PaginatedResponse } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'
import { KalkiaCalculationEngine, createDefaultContext } from '@/lib/services/kalkia-engine'
import { requireAuth, formatError } from '@/lib/actions/action-helpers'
// =====================================================
// Kalkia Nodes
// =====================================================

export async function getKalkiaNodes(
  filters?: KalkiaNodeFilters
): Promise<ActionResult<KalkiaNodeSummary[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from('v_kalkia_nodes_summary')
      .select('*')

    // Apply filters
    if (filters?.search) {
      const sanitized = sanitizeSearchTerm(filters.search)
      if (sanitized) {
        query = query.or(`name.ilike.%${sanitized}%,code.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
      }
    }

    if (filters?.node_type) {
      query = query.eq('node_type', filters.node_type)
    }

    if (filters?.category_id) {
      validateUUID(filters.category_id, 'kategori ID')
      query = query.eq('category_id', filters.category_id)
    }

    if (filters?.parent_id !== undefined) {
      if (filters.parent_id === null) {
        query = query.is('parent_id', null)
      } else {
        validateUUID(filters.parent_id, 'parent ID')
        query = query.eq('parent_id', filters.parent_id)
      }
    }

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active)
    }

    if (filters?.depth !== undefined) {
      query = query.eq('depth', filters.depth)
    }

    // Sorting
    const sortBy = filters?.sortBy || 'path'
    const sortOrder = filters?.sortOrder || 'asc'
    query = query.order(sortBy, { ascending: sortOrder === 'asc' })

    const { data, error } = await query

    if (error) {
      console.error('Database error fetching kalkia nodes:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as KalkiaNodeSummary[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente noder') }
  }
}

export async function getKalkiaNodeTree(
  rootPath?: string
): Promise<ActionResult<KalkiaNodeWithRelations[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from('kalkia_nodes')
      .select(`
        *,
        category:calc_component_categories(id, name, slug),
        variants:kalkia_variants(*),
        rules:kalkia_rules(*)
      `)
      .eq('is_active', true)
      .order('path')

    if (rootPath) {
      // Use ltree query to get descendants
      query = query.filter('path', 'cd', rootPath)
    }

    const { data, error } = await query

    if (error) {
      console.error('Database error fetching kalkia node tree:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Build tree structure
    const nodeMap = new Map<string, KalkiaNodeWithRelations>()
    const rootNodes: KalkiaNodeWithRelations[] = []

    // First pass: create map
    for (const node of (data || [])) {
      nodeMap.set(node.id, { ...node, children: [] } as KalkiaNodeWithRelations)
    }

    // Second pass: build hierarchy
    for (const node of (data || [])) {
      const nodeWithChildren = nodeMap.get(node.id)!
      if (node.parent_id && nodeMap.has(node.parent_id)) {
        const parent = nodeMap.get(node.parent_id)!
        if (!parent.children) parent.children = []
        parent.children.push(nodeWithChildren)
      } else if (!node.parent_id || !rootPath) {
        rootNodes.push(nodeWithChildren)
      }
    }

    return { success: true, data: rootNodes }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente nodetrae') }
  }
}

export async function getKalkiaNode(
  id: string
): Promise<ActionResult<KalkiaNodeWithRelations>> {
  try {
    await requireAuth()
    validateUUID(id, 'node ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('kalkia_nodes')
      .select(`
        *,
        category:calc_component_categories(id, name, slug),
        variants:kalkia_variants(
          *,
          materials:kalkia_variant_materials(
            *,
            product:product_catalog(id, name, sku, cost_price, list_price)
          )
        ),
        rules:kalkia_rules(*),
        parent:kalkia_nodes!parent_id(id, code, name)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Noden blev ikke fundet' }
      }
      console.error('Database error fetching kalkia node:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as KalkiaNodeWithRelations }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente node') }
  }
}

export async function createKalkiaNode(
  formData: FormData
): Promise<ActionResult<KalkiaNode>> {
  try {
    const userId = await requireAuth()

    const rawData = {
      parent_id: formData.get('parent_id') as string || null,
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      node_type: formData.get('node_type') as string,
      base_time_seconds: formData.get('base_time_seconds') ? Number(formData.get('base_time_seconds')) : 0,
      category_id: formData.get('category_id') as string || null,
      default_cost_price: formData.get('default_cost_price') ? Number(formData.get('default_cost_price')) : 0,
      default_sale_price: formData.get('default_sale_price') ? Number(formData.get('default_sale_price')) : 0,
      difficulty_level: formData.get('difficulty_level') ? Number(formData.get('difficulty_level')) : 1,
      requires_certification: formData.get('requires_certification') === 'true',
      is_active: formData.get('is_active') !== 'false',
      ai_tags: formData.get('ai_tags') ? JSON.parse(formData.get('ai_tags') as string) : [],
      notes: formData.get('notes') as string || null,
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
    }

    const validated = createKalkiaNodeSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    // Generate path based on parent
    let path = validated.data.code.toLowerCase().replace(/[^a-z0-9_]/g, '_')
    let depth = 0

    if (validated.data.parent_id) {
      const { data: parent } = await supabase
        .from('kalkia_nodes')
        .select('path, depth')
        .eq('id', validated.data.parent_id)
        .single()

      if (parent) {
        path = `${parent.path}.${path}`
        depth = parent.depth + 1
      }
    }

    const { data, error } = await supabase
      .from('kalkia_nodes')
      .insert({
        ...validated.data,
        path,
        depth,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'En node med denne kode eksisterer allerede' }
      }
      console.error('Database error creating kalkia node:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia')
    revalidatePath('/dashboard/settings/kalkia/nodes')
    return { success: true, data: data as KalkiaNode }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette node') }
  }
}

export async function updateKalkiaNode(
  formData: FormData
): Promise<ActionResult<KalkiaNode>> {
  try {
    await requireAuth()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Node ID mangler' }
    }
    validateUUID(id, 'node ID')

    const rawData = {
      id,
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      node_type: formData.get('node_type') as string,
      base_time_seconds: formData.get('base_time_seconds') ? Number(formData.get('base_time_seconds')) : 0,
      category_id: formData.get('category_id') as string || null,
      default_cost_price: formData.get('default_cost_price') ? Number(formData.get('default_cost_price')) : 0,
      default_sale_price: formData.get('default_sale_price') ? Number(formData.get('default_sale_price')) : 0,
      difficulty_level: formData.get('difficulty_level') ? Number(formData.get('difficulty_level')) : 1,
      requires_certification: formData.get('requires_certification') === 'true',
      is_active: formData.get('is_active') !== 'false',
      ai_tags: formData.get('ai_tags') ? JSON.parse(formData.get('ai_tags') as string) : [],
      notes: formData.get('notes') as string || null,
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
    }

    const validated = updateKalkiaNodeSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: nodeId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('kalkia_nodes')
      .update(updateData)
      .eq('id', nodeId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Noden blev ikke fundet' }
      }
      if (error.code === '23505') {
        return { success: false, error: 'En node med denne kode eksisterer allerede' }
      }
      console.error('Database error updating kalkia node:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia')
    revalidatePath('/dashboard/settings/kalkia/nodes')
    revalidatePath(`/dashboard/settings/kalkia/nodes/${nodeId}`)
    return { success: true, data: data as KalkiaNode }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere node') }
  }
}

export async function deleteKalkiaNode(id: string): Promise<ActionResult> {
  try {
    await requireAuth()
    validateUUID(id, 'node ID')

    const supabase = await createClient()

    // Check for children
    const { count } = await supabase
      .from('kalkia_nodes')
      .select('*', { count: 'exact', head: true })
      .eq('parent_id', id)

    if (count && count > 0) {
      return { success: false, error: 'Kan ikke slette en node med underliggende noder' }
    }

    const { error } = await supabase
      .from('kalkia_nodes')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Database error deleting kalkia node:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia')
    revalidatePath('/dashboard/settings/kalkia/nodes')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette node') }
  }
}

// =====================================================
// Kalkia Variants
// =====================================================

export async function getKalkiaVariants(
  nodeId: string
): Promise<ActionResult<KalkiaVariantWithMaterials[]>> {
  try {
    await requireAuth()
    validateUUID(nodeId, 'node ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('kalkia_variants')
      .select(`
        *,
        materials:kalkia_variant_materials(
          *,
          product:product_catalog(id, name, sku, cost_price, list_price)
        )
      `)
      .eq('node_id', nodeId)
      .order('sort_order')

    if (error) {
      console.error('Database error fetching kalkia variants:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as KalkiaVariantWithMaterials[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente varianter') }
  }
}

export async function createKalkiaVariant(
  formData: FormData
): Promise<ActionResult<KalkiaVariant>> {
  try {
    await requireAuth()

    const rawData = {
      node_id: formData.get('node_id') as string,
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      base_time_seconds: formData.get('base_time_seconds') ? Number(formData.get('base_time_seconds')) : 0,
      time_multiplier: formData.get('time_multiplier') ? Number(formData.get('time_multiplier')) : 1,
      extra_time_seconds: formData.get('extra_time_seconds') ? Number(formData.get('extra_time_seconds')) : 0,
      price_multiplier: formData.get('price_multiplier') ? Number(formData.get('price_multiplier')) : 1,
      cost_multiplier: formData.get('cost_multiplier') ? Number(formData.get('cost_multiplier')) : 1,
      waste_percentage: formData.get('waste_percentage') ? Number(formData.get('waste_percentage')) : 0,
      is_default: formData.get('is_default') === 'true',
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
    }

    const validated = createKalkiaVariantSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    // If setting as default, unset other defaults for this node
    if (validated.data.is_default) {
      await supabase
        .from('kalkia_variants')
        .update({ is_default: false })
        .eq('node_id', validated.data.node_id)
    }

    const { data, error } = await supabase
      .from('kalkia_variants')
      .insert(validated.data)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'En variant med denne kode eksisterer allerede for denne node' }
      }
      console.error('Database error creating kalkia variant:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/nodes')
    return { success: true, data: data as KalkiaVariant }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette variant') }
  }
}

export async function updateKalkiaVariant(
  formData: FormData
): Promise<ActionResult<KalkiaVariant>> {
  try {
    await requireAuth()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Variant ID mangler' }
    }
    validateUUID(id, 'variant ID')

    const rawData = {
      id,
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      base_time_seconds: formData.get('base_time_seconds') ? Number(formData.get('base_time_seconds')) : 0,
      time_multiplier: formData.get('time_multiplier') ? Number(formData.get('time_multiplier')) : 1,
      extra_time_seconds: formData.get('extra_time_seconds') ? Number(formData.get('extra_time_seconds')) : 0,
      price_multiplier: formData.get('price_multiplier') ? Number(formData.get('price_multiplier')) : 1,
      cost_multiplier: formData.get('cost_multiplier') ? Number(formData.get('cost_multiplier')) : 1,
      waste_percentage: formData.get('waste_percentage') ? Number(formData.get('waste_percentage')) : 0,
      is_default: formData.get('is_default') === 'true',
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
    }

    const validated = updateKalkiaVariantSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    // If setting as default, get node_id first and unset others
    if (validated.data.is_default) {
      const { data: variant } = await supabase
        .from('kalkia_variants')
        .select('node_id')
        .eq('id', id)
        .single()

      if (variant) {
        await supabase
          .from('kalkia_variants')
          .update({ is_default: false })
          .eq('node_id', variant.node_id)
          .neq('id', id)
      }
    }

    const { id: variantId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('kalkia_variants')
      .update(updateData)
      .eq('id', variantId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Varianten blev ikke fundet' }
      }
      console.error('Database error updating kalkia variant:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/nodes')
    return { success: true, data: data as KalkiaVariant }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere variant') }
  }
}

export async function deleteKalkiaVariant(id: string): Promise<ActionResult> {
  try {
    await requireAuth()
    validateUUID(id, 'variant ID')

    const supabase = await createClient()

    const { error } = await supabase
      .from('kalkia_variants')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Database error deleting kalkia variant:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/nodes')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette variant') }
  }
}

// =====================================================
// Kalkia Variant Materials
// =====================================================

export async function createKalkiaVariantMaterial(
  formData: FormData
): Promise<ActionResult<KalkiaVariantMaterial>> {
  try {
    await requireAuth()

    const rawData = {
      variant_id: formData.get('variant_id') as string,
      product_id: formData.get('product_id') as string || null,
      material_name: formData.get('material_name') as string,
      quantity: formData.get('quantity') ? Number(formData.get('quantity')) : 1,
      unit: formData.get('unit') as string || 'stk',
      cost_price: formData.get('cost_price') ? Number(formData.get('cost_price')) : null,
      sale_price: formData.get('sale_price') ? Number(formData.get('sale_price')) : null,
      is_optional: formData.get('is_optional') === 'true',
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
    }

    const validated = createKalkiaVariantMaterialSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('kalkia_variant_materials')
      .insert(validated.data)
      .select()
      .single()

    if (error) {
      console.error('Database error creating kalkia variant material:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/nodes')
    return { success: true, data: data as KalkiaVariantMaterial }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke tilfoeje materiale') }
  }
}

export async function updateKalkiaVariantMaterial(
  formData: FormData
): Promise<ActionResult<KalkiaVariantMaterial>> {
  try {
    await requireAuth()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Materiale ID mangler' }
    }
    validateUUID(id, 'materiale ID')

    const rawData = {
      id,
      product_id: formData.get('product_id') as string || null,
      material_name: formData.get('material_name') as string,
      quantity: formData.get('quantity') ? Number(formData.get('quantity')) : 1,
      unit: formData.get('unit') as string || 'stk',
      cost_price: formData.get('cost_price') ? Number(formData.get('cost_price')) : null,
      sale_price: formData.get('sale_price') ? Number(formData.get('sale_price')) : null,
      is_optional: formData.get('is_optional') === 'true',
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
    }

    const validated = updateKalkiaVariantMaterialSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: materialId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('kalkia_variant_materials')
      .update(updateData)
      .eq('id', materialId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Materialet blev ikke fundet' }
      }
      console.error('Database error updating kalkia variant material:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/nodes')
    return { success: true, data: data as KalkiaVariantMaterial }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere materiale') }
  }
}

export async function deleteKalkiaVariantMaterial(id: string): Promise<ActionResult> {
  try {
    await requireAuth()
    validateUUID(id, 'materiale ID')

    const supabase = await createClient()

    const { error } = await supabase
      .from('kalkia_variant_materials')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Database error deleting kalkia variant material:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/nodes')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette materiale') }
  }
}

// =====================================================
// Kalkia Building Profiles
// =====================================================

export async function getBuildingProfiles(): Promise<ActionResult<KalkiaBuildingProfile[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('kalkia_building_profiles')
      .select('*')
      .order('sort_order')

    if (error) {
      console.error('Database error fetching building profiles:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as KalkiaBuildingProfile[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente bygningsprofiler') }
  }
}

export async function updateBuildingProfile(
  formData: FormData
): Promise<ActionResult<KalkiaBuildingProfile>> {
  try {
    await requireAuth()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Profil ID mangler' }
    }
    validateUUID(id, 'profil ID')

    const rawData = {
      id,
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      time_multiplier: formData.get('time_multiplier') ? Number(formData.get('time_multiplier')) : 1,
      difficulty_multiplier: formData.get('difficulty_multiplier') ? Number(formData.get('difficulty_multiplier')) : 1,
      material_waste_multiplier: formData.get('material_waste_multiplier') ? Number(formData.get('material_waste_multiplier')) : 1,
      overhead_multiplier: formData.get('overhead_multiplier') ? Number(formData.get('overhead_multiplier')) : 1,
      typical_wall_type: formData.get('typical_wall_type') as string || null,
      typical_access: formData.get('typical_access') as string || 'normal',
      is_active: formData.get('is_active') !== 'false',
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
    }

    const validated = updateKalkiaBuildingProfileSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: profileId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('kalkia_building_profiles')
      .update(updateData)
      .eq('id', profileId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Profilen blev ikke fundet' }
      }
      console.error('Database error updating building profile:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/profiles')
    return { success: true, data: data as KalkiaBuildingProfile }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere bygningsprofil') }
  }
}

// =====================================================
// Kalkia Global Factors
// =====================================================

export async function getGlobalFactors(): Promise<ActionResult<KalkiaGlobalFactor[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('kalkia_global_factors')
      .select('*')
      .order('sort_order')

    if (error) {
      console.error('Database error fetching global factors:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as KalkiaGlobalFactor[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente globale faktorer') }
  }
}

export async function updateGlobalFactor(
  formData: FormData
): Promise<ActionResult<KalkiaGlobalFactor>> {
  try {
    await requireAuth()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Faktor ID mangler' }
    }
    validateUUID(id, 'faktor ID')

    const rawData = {
      id,
      factor_key: formData.get('factor_key') as string,
      factor_name: formData.get('factor_name') as string,
      description: formData.get('description') as string || null,
      category: formData.get('category') as string,
      value_type: formData.get('value_type') as string,
      value: Number(formData.get('value')),
      min_value: formData.get('min_value') ? Number(formData.get('min_value')) : null,
      max_value: formData.get('max_value') ? Number(formData.get('max_value')) : null,
      is_active: formData.get('is_active') !== 'false',
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
    }

    const validated = updateKalkiaGlobalFactorSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: factorId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('kalkia_global_factors')
      .update(updateData)
      .eq('id', factorId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Faktoren blev ikke fundet' }
      }
      console.error('Database error updating global factor:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/factors')
    return { success: true, data: data as KalkiaGlobalFactor }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere faktor') }
  }
}

// =====================================================
// Kalkia Calculations
// =====================================================

export async function getKalkiaCalculations(
  filters?: KalkiaCalculationFilters
): Promise<ActionResult<PaginatedResponse<KalkiaCalculationSummary>>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    let countQuery = supabase
      .from('v_kalkia_calculations_summary')
      .select('*', { count: 'exact', head: true })

    let dataQuery = supabase
      .from('v_kalkia_calculations_summary')
      .select('*')

    // Apply filters
    if (filters?.search) {
      const sanitized = sanitizeSearchTerm(filters.search)
      if (sanitized) {
        const searchFilter = `name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`
        countQuery = countQuery.or(searchFilter)
        dataQuery = dataQuery.or(searchFilter)
      }
    }

    if (filters?.customer_id) {
      validateUUID(filters.customer_id, 'kunde ID')
      countQuery = countQuery.eq('customer_id', filters.customer_id)
      dataQuery = dataQuery.eq('customer_id', filters.customer_id)
    }

    if (filters?.status) {
      countQuery = countQuery.eq('status', filters.status)
      dataQuery = dataQuery.eq('status', filters.status)
    }

    if (filters?.is_template !== undefined) {
      countQuery = countQuery.eq('is_template', filters.is_template)
      dataQuery = dataQuery.eq('is_template', filters.is_template)
    }

    const sortBy = filters?.sortBy || 'created_at'
    const sortOrder = filters?.sortOrder || 'desc'
    dataQuery = dataQuery.order(sortBy, { ascending: sortOrder === 'asc' })

    dataQuery = dataQuery.range(offset, offset + pageSize - 1)

    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

    if (countResult.error) {
      console.error('Database error counting kalkia calculations:', countResult.error)
      throw new Error('DATABASE_ERROR')
    }

    if (dataResult.error) {
      console.error('Database error fetching kalkia calculations:', dataResult.error)
      throw new Error('DATABASE_ERROR')
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: (dataResult.data || []) as KalkiaCalculationSummary[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kalkulationer') }
  }
}

export async function getKalkiaCalculation(
  id: string
): Promise<ActionResult<KalkiaCalculationWithRelations>> {
  try {
    await requireAuth()
    validateUUID(id, 'kalkulation ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('kalkia_calculations')
      .select(`
        *,
        customer:customers(id, company_name, customer_number),
        building_profile:kalkia_building_profiles(*),
        rows:kalkia_calculation_rows(
          *,
          node:kalkia_nodes(id, code, name, node_type),
          variant:kalkia_variants(id, code, name)
        ),
        created_by_profile:profiles!created_by(id, full_name, email)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Kalkulationen blev ikke fundet' }
      }
      console.error('Database error fetching kalkia calculation:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Sort rows by position
    if (data.rows) {
      data.rows.sort((a: KalkiaCalculationRow, b: KalkiaCalculationRow) => a.position - b.position)
    }

    return { success: true, data: data as KalkiaCalculationWithRelations }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kalkulation') }
  }
}

export async function createKalkiaCalculation(
  formData: FormData
): Promise<ActionResult<KalkiaCalculation>> {
  try {
    const userId = await requireAuth()

    const rawData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      customer_id: formData.get('customer_id') as string || null,
      building_profile_id: formData.get('building_profile_id') as string || null,
      hourly_rate: formData.get('hourly_rate') ? Number(formData.get('hourly_rate')) : 495,
      margin_percentage: formData.get('margin_percentage') ? Number(formData.get('margin_percentage')) : 0,
      discount_percentage: formData.get('discount_percentage') ? Number(formData.get('discount_percentage')) : 0,
      vat_percentage: formData.get('vat_percentage') ? Number(formData.get('vat_percentage')) : 25,
      overhead_percentage: formData.get('overhead_percentage') ? Number(formData.get('overhead_percentage')) : 12,
      risk_percentage: formData.get('risk_percentage') ? Number(formData.get('risk_percentage')) : 0,
      is_template: formData.get('is_template') === 'true',
    }

    const validated = createKalkiaCalculationSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('kalkia_calculations')
      .insert({
        ...validated.data,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      console.error('Database error creating kalkia calculation:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/calculations')
    return { success: true, data: data as KalkiaCalculation }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette kalkulation') }
  }
}

export async function updateKalkiaCalculation(
  formData: FormData
): Promise<ActionResult<KalkiaCalculation>> {
  try {
    await requireAuth()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Kalkulation ID mangler' }
    }
    validateUUID(id, 'kalkulation ID')

    const rawData = {
      id,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      customer_id: formData.get('customer_id') as string || null,
      building_profile_id: formData.get('building_profile_id') as string || null,
      hourly_rate: formData.get('hourly_rate') ? Number(formData.get('hourly_rate')) : 495,
      margin_percentage: formData.get('margin_percentage') ? Number(formData.get('margin_percentage')) : 0,
      discount_percentage: formData.get('discount_percentage') ? Number(formData.get('discount_percentage')) : 0,
      vat_percentage: formData.get('vat_percentage') ? Number(formData.get('vat_percentage')) : 25,
      overhead_percentage: formData.get('overhead_percentage') ? Number(formData.get('overhead_percentage')) : 12,
      risk_percentage: formData.get('risk_percentage') ? Number(formData.get('risk_percentage')) : 0,
      is_template: formData.get('is_template') === 'true',
      status: formData.get('status') as string || undefined,
    }

    const validated = updateKalkiaCalculationSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: calcId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('kalkia_calculations')
      .update(updateData)
      .eq('id', calcId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Kalkulationen blev ikke fundet' }
      }
      console.error('Database error updating kalkia calculation:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/calculations')
    revalidatePath(`/dashboard/calculations/${calcId}`)
    return { success: true, data: data as KalkiaCalculation }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere kalkulation') }
  }
}

export async function deleteKalkiaCalculation(id: string): Promise<ActionResult> {
  try {
    await requireAuth()
    validateUUID(id, 'kalkulation ID')

    const supabase = await createClient()

    const { error } = await supabase
      .from('kalkia_calculations')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Database error deleting kalkia calculation:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/calculations')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette kalkulation') }
  }
}

// =====================================================
// PackageBuilder Integration
// =====================================================

interface PackageBuilderCalculationItem {
  id: string
  componentId: string
  componentName: string
  componentCode: string | null
  variantId: string | null
  variantName?: string
  quantity: number
  baseTimeMinutes: number
  variantTimeMultiplier: number
  variantExtraMinutes: number
  complexityFactor: number
  calculatedTimeMinutes: number
  costPrice: number
  salePrice: number
  materials?: {
    name: string
    quantity: number
    unit: string
    costPrice: number
    salePrice: number
  }[]
}

interface PackageBuilderSaveInput {
  name: string
  description: string
  items: PackageBuilderCalculationItem[]
  result: CalculationResult | null
  buildingProfileId: string | null
  settings: {
    hourlyRate: number
    marginPercentage: number
    discountPercentage: number
    laborType?: string
    timeAdjustment?: string
  }
  customerId?: string | null
  isTemplate?: boolean
}

/**
 * Save a complete calculation from the PackageBuilder component.
 * Creates a kalkia_calculation record with all line items and the final result.
 */
export async function savePackageBuilderCalculation(
  input: PackageBuilderSaveInput
): Promise<ActionResult<KalkiaCalculation>> {
  try {
    const userId = await requireAuth()
    const supabase = await createClient()

    // Build factors snapshot from settings
    const factorsSnapshot = {
      laborType: input.settings.laborType || 'electrician',
      timeAdjustment: input.settings.timeAdjustment || 'normal',
      ...(input.result?.factorsUsed || {}),
    }

    // Build building profile snapshot if selected
    let buildingProfileSnapshot = {}
    if (input.buildingProfileId) {
      validateUUID(input.buildingProfileId, 'bygningsprofil ID')
      const { data: profileData } = await supabase
        .from('kalkia_building_profiles')
        .select('*')
        .eq('id', input.buildingProfileId)
        .single()
      if (profileData) {
        buildingProfileSnapshot = profileData
      }
    }

    // Insert the calculation
    const { data: calculation, error: calcError } = await supabase
      .from('kalkia_calculations')
      .insert({
        name: input.name,
        description: input.description || null,
        customer_id: input.customerId || null,
        building_profile_id: input.buildingProfileId || null,

        // Time tracking
        total_direct_time_seconds: input.result?.totalDirectTimeSeconds || 0,
        total_indirect_time_seconds: input.result?.totalIndirectTimeSeconds || 0,
        total_personal_time_seconds: input.result?.totalPersonalTimeSeconds || 0,
        total_labor_time_seconds: input.result?.totalLaborTimeSeconds || 0,

        // Cost breakdown
        hourly_rate: input.settings.hourlyRate,
        total_material_cost: input.result?.totalMaterialCost || 0,
        total_material_waste: input.result?.totalMaterialWaste || 0,
        total_labor_cost: input.result?.totalLaborCost || 0,
        total_other_costs: input.result?.totalOtherCosts || 0,
        cost_price: input.result?.costPrice || 0,

        // Pricing
        overhead_percentage: 12,
        overhead_amount: input.result?.overheadAmount || 0,
        risk_percentage: 2,
        risk_amount: input.result?.riskAmount || 0,
        sales_basis: input.result?.salesBasis || 0,
        margin_percentage: input.settings.marginPercentage,
        margin_amount: input.result?.marginAmount || 0,
        sale_price_excl_vat: input.result?.salePriceExclVat || 0,
        discount_percentage: input.settings.discountPercentage,
        discount_amount: input.result?.discountAmount || 0,
        net_price: input.result?.netPrice || 0,
        vat_percentage: 25,
        vat_amount: input.result?.vatAmount || 0,
        final_amount: input.result?.finalAmount || 0,

        // Key metrics
        db_amount: input.result?.dbAmount || 0,
        db_percentage: input.result?.dbPercentage || 0,
        db_per_hour: input.result?.dbPerHour || 0,
        coverage_ratio: input.result?.coverageRatio || 0,

        // Snapshots
        factors_snapshot: factorsSnapshot,
        building_profile_snapshot: buildingProfileSnapshot,

        // Status
        status: 'draft',
        is_template: input.isTemplate || false,
        created_by: userId,
      })
      .select()
      .single()

    if (calcError) {
      console.error('Database error creating calculation:', calcError)
      throw new Error('DATABASE_ERROR')
    }

    // Insert calculation rows for each item
    if (input.items.length > 0) {
      const rows = input.items.map((item, index) => ({
        calculation_id: calculation.id,
        node_id: null, // We're using calc_components, not kalkia_nodes
        variant_id: item.variantId,
        position: index + 1,
        section: null,
        description: item.componentName + (item.variantName ? ` (${item.variantName})` : ''),
        quantity: item.quantity,
        unit: 'stk',
        base_time_seconds: item.baseTimeMinutes * 60,
        adjusted_time_seconds: item.calculatedTimeMinutes * 60,
        material_cost: item.materials?.reduce((sum, m) => sum + (m.costPrice * m.quantity * item.quantity), 0) || 0,
        material_waste: 0,
        labor_cost: (item.calculatedTimeMinutes / 60) * input.settings.hourlyRate * item.quantity,
        total_cost: item.costPrice * item.quantity,
        sale_price: item.salePrice,
        total_sale: item.salePrice * item.quantity,
        rules_applied: [],
        conditions: {
          componentId: item.componentId,
          componentCode: item.componentCode,
          variantTimeMultiplier: item.variantTimeMultiplier,
          variantExtraMinutes: item.variantExtraMinutes,
          complexityFactor: item.complexityFactor,
        },
        show_on_offer: true,
        is_optional: false,
      }))

      const { error: rowsError } = await supabase
        .from('kalkia_calculation_rows')
        .insert(rows)

      if (rowsError) {
        console.error('Database error creating calculation rows:', rowsError)
        // Don't fail the whole operation, just log
      }
    }

    revalidatePath('/dashboard/calculations')
    return { success: true, data: calculation as KalkiaCalculation }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gemme kalkulation') }
  }
}

/**
 * Clone a calculation as a template.
 */
export async function cloneCalculationAsTemplate(
  input: Omit<PackageBuilderSaveInput, 'result' | 'buildingProfileId' | 'customerId'>
): Promise<ActionResult<KalkiaCalculation>> {
  return savePackageBuilderCalculation({
    ...input,
    buildingProfileId: null,
    customerId: null,
    result: null, // Will be recalculated
    isTemplate: true,
  })
}

// =====================================================
// Calculation Engine Integration
// =====================================================

export async function calculateFromNodes(
  items: KalkiaCalculationItemInput[],
  buildingProfileId: string | null,
  hourlyRate: number = 495,
  marginPercentage: number = 0,
  discountPercentage: number = 0,
  vatPercentage: number = 25,
  riskPercentage: number = 0
): Promise<ActionResult<{ items: unknown[]; result: CalculationResult }>> {
  try {
    await requireAuth()

    const supabase = await createClient()

    // Get building profile if specified
    let buildingProfile: KalkiaBuildingProfile | null = null
    if (buildingProfileId) {
      validateUUID(buildingProfileId, 'bygningsprofil ID')
      const { data } = await supabase
        .from('kalkia_building_profiles')
        .select('*')
        .eq('id', buildingProfileId)
        .single()
      buildingProfile = data as KalkiaBuildingProfile
    }

    // Get global factors
    const { data: factorsData } = await supabase
      .from('kalkia_global_factors')
      .select('*')
      .eq('is_active', true)

    const globalFactors = (factorsData || []) as KalkiaGlobalFactor[]

    // Create engine
    const context = createDefaultContext(hourlyRate, buildingProfile, globalFactors)
    const engine = new KalkiaCalculationEngine(context)

    // Get all node IDs
    const nodeIds = items.map((item) => item.nodeId)

    // Fetch nodes with variants and materials
    const { data: nodesData } = await supabase
      .from('kalkia_nodes')
      .select(`
        *,
        variants:kalkia_variants(
          *,
          materials:kalkia_variant_materials(*)
        ),
        rules:kalkia_rules(*)
      `)
      .in('id', nodeIds)

    const nodeMap = new Map((nodesData || []).map((n) => [n.id, n]))

    // Calculate each item
    const calculatedItems: unknown[] = []

    for (const input of items) {
      const nodeData = nodeMap.get(input.nodeId)
      if (!nodeData) continue

      const variant = input.variantId
        ? nodeData.variants?.find((v: KalkiaVariant) => v.id === input.variantId)
        : nodeData.variants?.find((v: KalkiaVariant) => v.is_default) || nodeData.variants?.[0]

      const materials = variant?.materials || []
      const rules = nodeData.rules || []

      const calculatedItem = engine.calculateItem(
        nodeData as KalkiaNode,
        variant as KalkiaVariant,
        materials as KalkiaVariantMaterial[],
        rules as KalkiaRule[],
        input
      )

      calculatedItems.push(calculatedItem)
    }

    // Calculate final pricing
    const result = engine.calculateFinalPricing(
      calculatedItems as never[],
      marginPercentage,
      discountPercentage,
      vatPercentage,
      riskPercentage
    )

    return { success: true, data: { items: calculatedItems, result } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke beregne') }
  }
}

// =====================================================
// Browse and Search
// =====================================================

/**
 * Get browseable Kalkia nodes for initial component display.
 * Returns operation and composite nodes, excluding legacy and category groups.
 */
export async function getKalkiaBrowseNodes(
  limit: number = 50
): Promise<ActionResult<KalkiaNodeSummary[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Fetch operation and composite nodes from the new Kalkia system
    // Exclude legacy (migrated from calc_components) and category group nodes
    const { data, error } = await supabase
      .from('v_kalkia_nodes_summary')
      .select('*')
      .eq('is_active', true)
      .in('node_type', ['operation', 'composite'])
      .not('path', 'like', 'legacy%')
      .not('code', 'like', 'LEG_%')
      .not('code', 'like', 'CAT_%')
      .order('path')
      .limit(limit)

    if (error) {
      console.error('Database error fetching browse nodes:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as KalkiaNodeSummary[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente komponenter') }
  }
}

/**
 * Search Kalkia nodes by name, code, or description.
 * Excludes legacy and category group nodes.
 */
export async function searchKalkiaNodes(
  query: string,
  limit: number = 20,
  includeGroups: boolean = false
): Promise<ActionResult<KalkiaNodeSummary[]>> {
  try {
    await requireAuth()

    const sanitized = sanitizeSearchTerm(query)
    if (!sanitized || sanitized.length < 2) {
      return { success: true, data: [] }
    }

    const supabase = await createClient()

    let dbQuery = supabase
      .from('v_kalkia_nodes_summary')
      .select('*')
      .eq('is_active', true)
      .not('path', 'like', 'legacy%')
      .not('code', 'like', 'LEG_%')
      .not('code', 'like', 'CAT_%')
      .or(`name.ilike.%${sanitized}%,code.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)

    // Filter out group nodes unless explicitly requested
    if (!includeGroups) {
      dbQuery = dbQuery.in('node_type', ['operation', 'composite'])
    }

    const { data, error } = await dbQuery
      .order('name')
      .limit(limit)

    if (error) {
      console.error('Database error searching kalkia nodes:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as KalkiaNodeSummary[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Sorgning fejlede') }
  }
}

// =====================================================
// Create Offer from Calculation
// =====================================================

interface CalculationItemForOffer {
  id: string
  componentId: string
  componentName: string
  componentCode: string | null
  variantId: string | null
  variantName?: string
  quantity: number
  baseTimeMinutes: number
  variantTimeMultiplier: number
  variantExtraMinutes: number
  complexityFactor: number
  calculatedTimeMinutes: number
  costPrice: number
  salePrice: number
  materials?: {
    name: string
    quantity: number
    unit: string
    costPrice: number
    salePrice: number
  }[]
}

interface CreateOfferFromCalculationInput {
  title: string
  description: string | null
  customerId: string
  validUntil: string | null
  termsAndConditions: string | null
  items: CalculationItemForOffer[]
  result: CalculationResult | null
  settings: {
    hourlyRate: number
    marginPercentage: number
    discountPercentage: number
  }
}

/**
 * Create an offer directly from a calculation with all line items.
 */
export async function createOfferFromCalculation(
  input: CreateOfferFromCalculationInput
): Promise<ActionResult<{ id: string; offer_number: string }>> {
  try {
    const userId = await requireAuth()
    const supabase = await createClient()

    // Validate customer exists
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, company_name')
      .eq('id', input.customerId)
      .single()

    if (customerError || !customer) {
      return { success: false, error: 'Kunde ikke fundet' }
    }

    // Generate offer number
    const currentYear = new Date().getFullYear()
    const prefix = `TILBUD-${currentYear}-`

    const { data: lastOffer } = await supabase
      .from('offers')
      .select('offer_number')
      .ilike('offer_number', `${prefix}%`)
      .order('offer_number', { ascending: false })
      .limit(1)

    let nextNumber = 1
    if (lastOffer && lastOffer.length > 0) {
      const lastNum = parseInt(lastOffer[0].offer_number.replace(prefix, ''), 10)
      if (!isNaN(lastNum)) {
        nextNumber = lastNum + 1
      }
    }
    const offerNumber = `${prefix}${String(nextNumber).padStart(4, '0')}`

    // Calculate totals from items
    const totalAmount = input.result?.salePriceExclVat ||
      input.items.reduce((sum, item) => sum + item.salePrice * item.quantity, 0)

    const discountPercentage = input.settings.discountPercentage || 0
    const discountAmount = totalAmount * (discountPercentage / 100)
    const taxPercentage = 25
    const taxAmount = (totalAmount - discountAmount) * (taxPercentage / 100)
    const finalAmount = totalAmount - discountAmount + taxAmount

    // Create the offer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .insert({
        offer_number: offerNumber,
        title: input.title,
        description: input.description,
        customer_id: input.customerId,
        status: 'draft',
        total_amount: totalAmount,
        discount_percentage: discountPercentage,
        discount_amount: discountAmount,
        tax_percentage: taxPercentage,
        tax_amount: taxAmount,
        final_amount: finalAmount,
        currency: 'DKK',
        valid_until: input.validUntil,
        terms_and_conditions: input.termsAndConditions,
        created_by: userId,
      })
      .select('id, offer_number')
      .single()

    if (offerError || !offer) {
      console.error('Error creating offer:', offerError)
      return { success: false, error: 'Kunne ikke oprette tilbud' }
    }

    // Create line items from calculation items
    const lineItems = input.items.map((item, index) => {
      const totalTimeMinutes = item.calculatedTimeMinutes * item.quantity
      const laborCost = (totalTimeMinutes / 60) * input.settings.hourlyRate
      const materialCost = item.materials?.reduce(
        (sum, m) => sum + m.costPrice * m.quantity * item.quantity,
        0
      ) || 0
      const itemCostPrice = laborCost + materialCost
      const itemSalePrice = item.salePrice * item.quantity

      return {
        offer_id: offer.id,
        position: index,
        description: item.variantName
          ? `${item.componentName} (${item.variantName})`
          : item.componentName,
        quantity: item.quantity,
        unit: 'stk',
        unit_price: item.salePrice,
        cost_price: itemCostPrice / item.quantity,
        discount_percentage: 0,
        total: itemSalePrice,
      }
    })

    const { error: lineItemsError } = await supabase
      .from('offer_line_items')
      .insert(lineItems)

    if (lineItemsError) {
      console.error('Error creating line items:', lineItemsError)
      // Don't fail the whole operation, the offer was created
    }

    // Log activity
    await supabase.from('offer_activities').insert({
      offer_id: offer.id,
      activity_type: 'created',
      description: `Tilbud oprettet fra kalkulation med ${input.items.length} komponenter`,
      performed_by: userId,
    })

    revalidatePath('/dashboard/offers')
    revalidatePath(`/dashboard/offers/${offer.id}`)

    return { success: true, data: offer }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette tilbud fra kalkulation') }
  }
}

// =====================================================
// Supplier Integration for Materials
// =====================================================

/**
 * Link a Kalkia variant material to a supplier product
 */
export async function linkMaterialToSupplierProduct(
  materialId: string,
  supplierProductId: string,
  autoUpdatePrice: boolean = false
): Promise<ActionResult<KalkiaVariantMaterial>> {
  try {
    await requireAuth()
    validateUUID(materialId, 'materiale ID')
    validateUUID(supplierProductId, 'leverandørprodukt ID')

    const supabase = await createClient()

    // Get supplier product to verify it exists and get prices
    const { data: supplierProduct, error: spError } = await supabase
      .from('supplier_products')
      .select('id, cost_price, list_price, supplier_name')
      .eq('id', supplierProductId)
      .single()

    if (spError || !supplierProduct) {
      return { success: false, error: 'Leverandørprodukt ikke fundet' }
    }

    // Update material with supplier product link
    const updateData: Record<string, unknown> = {
      supplier_product_id: supplierProductId,
      auto_update_price: autoUpdatePrice,
    }

    // Optionally update prices from supplier product
    if (autoUpdatePrice) {
      if (supplierProduct.cost_price) {
        updateData.cost_price = supplierProduct.cost_price
      }
      if (supplierProduct.list_price) {
        updateData.sale_price = supplierProduct.list_price
      }
    }

    const { data, error } = await supabase
      .from('kalkia_variant_materials')
      .update(updateData)
      .eq('id', materialId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Materiale ikke fundet' }
      }
      console.error('Database error linking material to supplier product:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/nodes')
    return { success: true, data: data as KalkiaVariantMaterial }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke linke materiale til leverandørprodukt') }
  }
}

/**
 * Unlink a Kalkia variant material from a supplier product
 */
export async function unlinkMaterialFromSupplierProduct(
  materialId: string
): Promise<ActionResult<KalkiaVariantMaterial>> {
  try {
    await requireAuth()
    validateUUID(materialId, 'materiale ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('kalkia_variant_materials')
      .update({
        supplier_product_id: null,
        auto_update_price: false,
      })
      .eq('id', materialId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Materiale ikke fundet' }
      }
      console.error('Database error unlinking material from supplier product:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/nodes')
    return { success: true, data: data as KalkiaVariantMaterial }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke fjerne link til leverandørprodukt') }
  }
}

/**
 * Get supplier product options for a material (by name match)
 */
export async function getSupplierOptionsForMaterial(
  materialName: string
): Promise<ActionResult<Array<{
  supplier_product_id: string
  supplier_id: string
  supplier_name: string
  supplier_code: string | null
  supplier_sku: string
  product_name: string
  cost_price: number
  list_price: number | null
  is_preferred: boolean
  is_available: boolean
}>>> {
  try {
    await requireAuth()

    const sanitized = sanitizeSearchTerm(materialName)
    if (!sanitized || sanitized.length < 2) {
      return { success: true, data: [] }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('v_supplier_products_with_supplier')
      .select(`
        id,
        supplier_id,
        supplier_name,
        supplier_code,
        supplier_sku,
        cost_price,
        list_price,
        is_preferred,
        is_available
      `)
      .eq('is_available', true)
      .eq('supplier_is_active', true)
      .or(`supplier_name.ilike.%${sanitized}%,supplier_sku.ilike.%${sanitized}%`)
      .order('is_preferred', { ascending: false })
      .order('cost_price', { ascending: true })
      .limit(20)

    if (error) {
      console.error('Database error fetching supplier options:', error)
      throw new Error('DATABASE_ERROR')
    }

    const options = (data || []).map((row) => ({
      supplier_product_id: row.id,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      supplier_code: row.supplier_code,
      supplier_sku: row.supplier_sku,
      product_name: row.supplier_name,
      cost_price: row.cost_price || 0,
      list_price: row.list_price,
      is_preferred: row.is_preferred || false,
      is_available: row.is_available,
    }))

    return { success: true, data: options }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandørmuligheder') }
  }
}

/**
 * Sync material prices from linked supplier products for a variant
 */
export async function syncMaterialPricesFromSupplier(
  variantId: string
): Promise<ActionResult<{ updated: number; skipped: number }>> {
  try {
    await requireAuth()
    validateUUID(variantId, 'variant ID')

    const supabase = await createClient()

    // Get all materials with supplier links that have auto_update_price enabled
    const { data: materials, error: materialsError } = await supabase
      .from('kalkia_variant_materials')
      .select(`
        id,
        supplier_product_id,
        auto_update_price,
        cost_price,
        sale_price
      `)
      .eq('variant_id', variantId)
      .not('supplier_product_id', 'is', null)

    if (materialsError) {
      console.error('Database error fetching materials:', materialsError)
      throw new Error('DATABASE_ERROR')
    }

    if (!materials || materials.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } }
    }

    // Get linked supplier products
    const supplierProductIds = materials.map((m) => m.supplier_product_id).filter(Boolean)

    const { data: supplierProducts, error: spError } = await supabase
      .from('supplier_products')
      .select('id, cost_price, list_price')
      .in('id', supplierProductIds)

    if (spError) {
      console.error('Database error fetching supplier products:', spError)
      throw new Error('DATABASE_ERROR')
    }

    const spMap = new Map(
      (supplierProducts || []).map((sp) => [sp.id, sp])
    )

    let updated = 0
    let skipped = 0

    // Update each material with auto_update_price enabled
    for (const material of materials) {
      if (!material.auto_update_price) {
        skipped++
        continue
      }

      const sp = spMap.get(material.supplier_product_id)
      if (!sp) {
        skipped++
        continue
      }

      // Check if prices are different
      if (
        sp.cost_price === material.cost_price &&
        sp.list_price === material.sale_price
      ) {
        skipped++
        continue
      }

      // Update material prices
      const { error: updateError } = await supabase
        .from('kalkia_variant_materials')
        .update({
          cost_price: sp.cost_price,
          sale_price: sp.list_price,
        })
        .eq('id', material.id)

      if (!updateError) {
        updated++
      } else {
        skipped++
      }
    }

    revalidatePath('/dashboard/settings/kalkia/nodes')
    return { success: true, data: { updated, skipped } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke synkronisere priser') }
  }
}

/**
 * Sync all material prices across all variants (batch operation)
 */
export async function syncAllMaterialPricesFromSuppliers(): Promise<ActionResult<{ updated: number; skipped: number }>> {
  try {
    await requireAuth()

    const supabase = await createClient()

    // Call the database function to sync all materials
    const { data, error } = await supabase
      .rpc('sync_all_material_prices_from_suppliers')

    if (error) {
      // If the function doesn't exist, do it manually
      console.log('RPC not available, syncing manually')

      // Get all materials with supplier links and auto_update enabled
      const { data: materials, error: materialsError } = await supabase
        .from('kalkia_variant_materials')
        .select(`
          id,
          supplier_product_id,
          cost_price,
          sale_price
        `)
        .eq('auto_update_price', true)
        .not('supplier_product_id', 'is', null)

      if (materialsError) {
        throw new Error('DATABASE_ERROR')
      }

      if (!materials || materials.length === 0) {
        return { success: true, data: { updated: 0, skipped: 0 } }
      }

      // Get linked supplier products
      const supplierProductIds = materials.map((m) => m.supplier_product_id).filter(Boolean)

      const { data: supplierProducts } = await supabase
        .from('supplier_products')
        .select('id, cost_price, list_price')
        .in('id', supplierProductIds)

      const spMap = new Map(
        (supplierProducts || []).map((sp) => [sp.id, sp])
      )

      let updated = 0
      let skipped = 0

      for (const material of materials) {
        const sp = spMap.get(material.supplier_product_id)
        if (!sp) {
          skipped++
          continue
        }

        if (
          sp.cost_price === material.cost_price &&
          sp.list_price === material.sale_price
        ) {
          skipped++
          continue
        }

        const { error: updateError } = await supabase
          .from('kalkia_variant_materials')
          .update({
            cost_price: sp.cost_price,
            sale_price: sp.list_price,
          })
          .eq('id', material.id)

        if (!updateError) {
          updated++
        } else {
          skipped++
        }
      }

      revalidatePath('/dashboard/settings/kalkia')
      return { success: true, data: { updated, skipped } }
    }

    revalidatePath('/dashboard/settings/kalkia')
    return { success: true, data: data as { updated: number; skipped: number } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke synkronisere alle priser') }
  }
}

// =====================================================
// Live Supplier Price Loading for Kalkia Calculations
// =====================================================

/**
 * Load live supplier prices for all materials in a variant.
 * Returns a Map that can be passed to CalculationContext.supplierPrices
 * to enable live pricing in the calculation engine.
 *
 * Optionally accepts a customer ID for customer-specific pricing.
 */
export async function loadSupplierPricesForVariant(
  variantId: string,
  customerId?: string
): Promise<ActionResult<Map<string, {
  materialId: string
  supplierProductId: string
  supplierName: string
  supplierSku: string
  baseCostPrice: number
  effectiveCostPrice: number
  effectiveSalePrice: number
  discountPercentage: number
  marginPercentage: number
  priceSource: string
  isStale: boolean
  lastSyncedAt: string | null
}>>> {
  try {
    await requireAuth()
    validateUUID(variantId, 'variant ID')

    const supabase = await createClient()

    // Get all materials with supplier product links
    const { data: materials, error: materialsError } = await supabase
      .from('kalkia_variant_materials')
      .select(`
        id,
        supplier_product_id,
        cost_price,
        sale_price
      `)
      .eq('variant_id', variantId)
      .not('supplier_product_id', 'is', null)

    if (materialsError) {
      console.error('Database error loading materials:', materialsError)
      throw new Error('DATABASE_ERROR')
    }

    if (!materials || materials.length === 0) {
      return { success: true, data: new Map() }
    }

    // Get linked supplier products with supplier info
    const supplierProductIds = materials.map((m) => m.supplier_product_id).filter(Boolean)

    const { data: supplierProducts, error: spError } = await supabase
      .from('v_supplier_products_with_supplier')
      .select('*')
      .in('id', supplierProductIds)

    if (spError) {
      console.error('Database error loading supplier products:', spError)
      throw new Error('DATABASE_ERROR')
    }

    // Build supplier product map
    const spMap = new Map(
      (supplierProducts || []).map((sp) => [sp.id, sp])
    )

    // Optionally load customer-specific pricing
    let customerDiscountMap = new Map<string, { discount: number; margin: number | null }>()
    let customerProductPriceMap = new Map<string, { cost: number | null; list: number | null; discount: number | null }>()

    if (customerId) {
      validateUUID(customerId, 'kunde ID')

      // Customer-supplier agreements
      const { data: customerSupplierPrices } = await supabase
        .from('customer_supplier_prices')
        .select('supplier_id, discount_percentage, custom_margin_percentage')
        .eq('customer_id', customerId)
        .eq('is_active', true)

      if (customerSupplierPrices) {
        customerDiscountMap = new Map(
          customerSupplierPrices.map((csp) => [
            csp.supplier_id,
            { discount: csp.discount_percentage || 0, margin: csp.custom_margin_percentage }
          ])
        )
      }

      // Customer-specific product prices
      const { data: customerProductPrices } = await supabase
        .from('customer_product_prices')
        .select('supplier_product_id, custom_cost_price, custom_list_price, custom_discount_percentage')
        .eq('customer_id', customerId)
        .eq('is_active', true)
        .in('supplier_product_id', supplierProductIds)

      if (customerProductPrices) {
        customerProductPriceMap = new Map(
          customerProductPrices.map((cpp) => [
            cpp.supplier_product_id,
            { cost: cpp.custom_cost_price, list: cpp.custom_list_price, discount: cpp.custom_discount_percentage }
          ])
        )
      }
    }

    // Build price override map
    const priceMap = new Map<string, {
      materialId: string
      supplierProductId: string
      supplierName: string
      supplierSku: string
      baseCostPrice: number
      effectiveCostPrice: number
      effectiveSalePrice: number
      discountPercentage: number
      marginPercentage: number
      priceSource: string
      isStale: boolean
      lastSyncedAt: string | null
    }>()

    for (const material of materials) {
      const sp = spMap.get(material.supplier_product_id)
      if (!sp || !sp.cost_price) continue

      const baseCost = sp.cost_price
      let effectiveCost = baseCost
      let discount = 0
      let margin = sp.margin_percentage || sp.default_margin_percentage || 25
      let priceSource = 'standard'

      // Check customer-specific product price
      const customerProductPrice = customerProductPriceMap.get(sp.id)
      if (customerProductPrice) {
        priceSource = 'customer_product'
        if (customerProductPrice.cost !== null) {
          effectiveCost = customerProductPrice.cost
        }
        if (customerProductPrice.discount !== null) {
          discount = customerProductPrice.discount
          effectiveCost = baseCost * (1 - discount / 100)
        }
      } else {
        // Check customer-supplier agreement
        const customerSupplier = customerDiscountMap.get(sp.supplier_id)
        if (customerSupplier) {
          priceSource = 'customer_supplier'
          discount = customerSupplier.discount
          effectiveCost = baseCost * (1 - discount / 100)
          if (customerSupplier.margin !== null) {
            margin = customerSupplier.margin
          }
        }
      }

      const effectiveSale = effectiveCost * (1 + margin / 100)

      // Check if price is stale (not synced in 7+ days)
      const lastSynced = sp.last_synced_at ? new Date(sp.last_synced_at) : null
      const isStale = !lastSynced || (Date.now() - lastSynced.getTime() > 7 * 24 * 60 * 60 * 1000)

      priceMap.set(material.id, {
        materialId: material.id,
        supplierProductId: sp.id,
        supplierName: sp.supplier_name || '',
        supplierSku: sp.supplier_sku || '',
        baseCostPrice: baseCost,
        effectiveCostPrice: effectiveCost,
        effectiveSalePrice: effectiveSale,
        discountPercentage: discount,
        marginPercentage: margin,
        priceSource,
        isStale,
        lastSyncedAt: sp.last_synced_at,
      })
    }

    return { success: true, data: priceMap }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandørpriser') }
  }
}

/**
 * Load supplier prices for all materials in a calculation.
 * Returns a combined Map for all variants used in the calculation.
 */
export async function loadSupplierPricesForCalculation(
  calculationId: string,
  customerId?: string
): Promise<ActionResult<Map<string, {
  materialId: string
  supplierProductId: string
  supplierName: string
  supplierSku: string
  baseCostPrice: number
  effectiveCostPrice: number
  effectiveSalePrice: number
  discountPercentage: number
  marginPercentage: number
  priceSource: string
  isStale: boolean
  lastSyncedAt: string | null
}>>> {
  try {
    await requireAuth()
    validateUUID(calculationId, 'kalkulation ID')

    const supabase = await createClient()

    // Get all rows in the calculation to find variant IDs
    const { data: rows, error: rowsError } = await supabase
      .from('kalkia_calculation_rows')
      .select('variant_id')
      .eq('calculation_id', calculationId)
      .not('variant_id', 'is', null)

    if (rowsError) {
      console.error('Database error loading calculation rows:', rowsError)
      throw new Error('DATABASE_ERROR')
    }

    const variantIds = [...new Set((rows || []).map((r) => r.variant_id).filter(Boolean))]

    if (variantIds.length === 0) {
      return { success: true, data: new Map() }
    }

    // Load supplier prices for all variants
    const allPrices = new Map<string, {
      materialId: string
      supplierProductId: string
      supplierName: string
      supplierSku: string
      baseCostPrice: number
      effectiveCostPrice: number
      effectiveSalePrice: number
      discountPercentage: number
      marginPercentage: number
      priceSource: string
      isStale: boolean
      lastSyncedAt: string | null
    }>()

    for (const variantId of variantIds) {
      const result = await loadSupplierPricesForVariant(variantId, customerId)
      if (result.success && result.data) {
        for (const [key, value] of result.data.entries()) {
          allPrices.set(key, value)
        }
      }
    }

    return { success: true, data: allPrices }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandørpriser for kalkulation') }
  }
}

/**
 * Refresh supplier prices for all linked materials in a calculation.
 * Fetches live prices from supplier APIs and updates the database.
 * Returns updated price map for immediate use.
 */
export async function refreshSupplierPricesForCalculation(
  calculationId: string,
  customerId?: string
): Promise<ActionResult<{
  refreshedCount: number
  failedCount: number
  priceChanges: number
  prices: Map<string, {
    materialId: string
    supplierProductId: string
    supplierName: string
    supplierSku: string
    baseCostPrice: number
    effectiveCostPrice: number
    effectiveSalePrice: number
    discountPercentage: number
    marginPercentage: number
    priceSource: string
    isStale: boolean
    lastSyncedAt: string | null
  }>
}>> {
  try {
    await requireAuth()
    validateUUID(calculationId, 'kalkulation ID')

    const supabase = await createClient()

    // Get all variants in calculation
    const { data: rows, error: rowsError } = await supabase
      .from('kalkia_calculation_rows')
      .select('variant_id')
      .eq('calculation_id', calculationId)
      .not('variant_id', 'is', null)

    if (rowsError) {
      console.error('Database error fetching calculation rows:', rowsError)
      throw new Error('DATABASE_ERROR')
    }

    const variantIds = [...new Set((rows || []).map((r) => r.variant_id).filter(Boolean))]

    if (variantIds.length === 0) {
      return {
        success: true,
        data: { refreshedCount: 0, failedCount: 0, priceChanges: 0, prices: new Map() }
      }
    }

    // Get all materials with supplier links
    const { data: materials, error: materialsError } = await supabase
      .from('kalkia_variant_materials')
      .select(`
        id,
        supplier_product_id,
        cost_price,
        sale_price,
        supplier_products!inner (
          id,
          supplier_id,
          supplier_sku,
          cost_price,
          suppliers!inner (
            id,
            code,
            name
          )
        )
      `)
      .in('variant_id', variantIds)
      .not('supplier_product_id', 'is', null)

    if (materialsError) {
      console.error('Database error loading materials:', materialsError)
      throw new Error('DATABASE_ERROR')
    }

    if (!materials || materials.length === 0) {
      return {
        success: true,
        data: { refreshedCount: 0, failedCount: 0, priceChanges: 0, prices: new Map() }
      }
    }

    // Group materials by supplier
    const materialsBySupplier = new Map<string, Array<{
      materialId: string
      supplierProductId: string
      sku: string
      oldPrice: number | null
    }>>()

    for (const material of materials) {
      const sp = Array.isArray(material.supplier_products)
        ? material.supplier_products[0]
        : material.supplier_products
      if (!sp) continue

      const supplier = Array.isArray(sp.suppliers) ? sp.suppliers[0] : sp.suppliers
      if (!supplier) continue

      const key = `${sp.supplier_id}:${supplier.code}`
      if (!materialsBySupplier.has(key)) {
        materialsBySupplier.set(key, [])
      }
      materialsBySupplier.get(key)!.push({
        materialId: material.id,
        supplierProductId: sp.id,
        sku: sp.supplier_sku,
        oldPrice: sp.cost_price,
      })
    }

    // Import API client factory
    const { SupplierAPIClientFactory } = await import('@/lib/services/supplier-api-client')

    let refreshedCount = 0
    let failedCount = 0
    let priceChanges = 0

    // Refresh prices from each supplier
    for (const [key, supplierMaterials] of materialsBySupplier) {
      const [supplierId, supplierCode] = key.split(':')

      try {
        const client = await SupplierAPIClientFactory.getClient(supplierId, supplierCode)
        if (!client) {
          failedCount += supplierMaterials.length
          continue
        }

        const skus = supplierMaterials.map((m) => m.sku)
        const prices = await client.getProductPrices(skus)

        for (const material of supplierMaterials) {
          const newPrice = prices.get(material.sku)
          if (newPrice) {
            // Update supplier product with new price
            if (material.oldPrice !== newPrice.costPrice) {
              await supabase
                .from('supplier_products')
                .update({
                  cost_price: newPrice.costPrice,
                  list_price: newPrice.listPrice,
                  is_available: newPrice.isAvailable,
                  lead_time_days: newPrice.leadTimeDays,
                  last_synced_at: new Date().toISOString(),
                })
                .eq('id', material.supplierProductId)

              // Record price change
              if (material.oldPrice) {
                const changePercent = ((newPrice.costPrice - material.oldPrice) / material.oldPrice) * 100
                await supabase.from('price_history').insert({
                  supplier_product_id: material.supplierProductId,
                  old_cost_price: material.oldPrice,
                  new_cost_price: newPrice.costPrice,
                  change_percentage: Math.round(changePercent * 100) / 100,
                  change_source: 'api_sync',
                })
                priceChanges++
              }
            }
            refreshedCount++
          } else {
            failedCount++
          }
        }
      } catch {
        failedCount += supplierMaterials.length
      }
    }

    // Now load the updated prices
    const priceResult = await loadSupplierPricesForCalculation(calculationId, customerId)

    return {
      success: true,
      data: {
        refreshedCount,
        failedCount,
        priceChanges,
        prices: priceResult.success && priceResult.data ? priceResult.data : new Map(),
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere leverandørpriser') }
  }
}
