'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
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
      return 'Du skal vaere logget ind'
    }
    if (err.message.startsWith('Ugyldig')) {
      return err.message
    }
  }
  console.error(`${defaultMessage}:`, err)
  return defaultMessage
}

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
