'use server'

import { revalidatePath } from 'next/cache'
import {
  createKalkiaNodeSchema,
  updateKalkiaNodeSchema,
} from '@/lib/validations/kalkia'
import { validateUUID, sanitizeSearchTerm } from '@/lib/validations/common'
import type {
  KalkiaNode,
  KalkiaNodeWithRelations,
  KalkiaNodeSummary,
  KalkiaNodeFilters,
} from '@/types/kalkia.types'
import type { ActionResult } from '@/types/common.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Kalkia Nodes CRUD
// =====================================================

export async function getKalkiaNodes(
  filters?: KalkiaNodeFilters
): Promise<ActionResult<KalkiaNodeSummary[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

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
      logger.error('Database error fetching kalkia nodes', { error: error })
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
    const { supabase } = await getAuthenticatedClient()

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
      logger.error('Database error fetching kalkia node tree', { error: error })
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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'node ID')

    const { data, error } = await supabase
      .from('kalkia_nodes')
      .select(`
        *,
        category:calc_component_categories(id, name, slug),
        variants:kalkia_variants(
          *,
          materials:kalkia_variant_materials(
            *,
            product:product_catalog(id, name, sku, cost_price, list_price),
            supplier_product:supplier_products(id, supplier_sku, supplier_name, cost_price, list_price, supplier:suppliers(name, code))
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
      logger.error('Database error fetching kalkia node', { error: error })
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
    const { supabase, userId } = await getAuthenticatedClient()

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

    // Generate path based on parent
    let path = validated.data.code.toLowerCase().replace(/[^a-z0-9_]/g, '_')
    let depth = 0

    if (validated.data.parent_id) {
      const { data: parent } = await supabase
        .from('kalkia_nodes')
        .select('path, depth')
        .eq('id', validated.data.parent_id)
        .maybeSingle()

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
      logger.error('Database error creating kalkia node', { error: error })
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
    const { supabase } = await getAuthenticatedClient()

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
      logger.error('Database error updating kalkia node', { error: error })
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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'node ID')

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
      logger.error('Database error deleting kalkia node', { error: error })
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
    const { supabase } = await getAuthenticatedClient()

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
      logger.error('Database error fetching browse nodes', { error: error })
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
    const { supabase } = await getAuthenticatedClient()

    const sanitized = sanitizeSearchTerm(query)
    if (!sanitized || sanitized.length < 2) {
      return { success: true, data: [] }
    }

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
      logger.error('Database error searching kalkia nodes', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as KalkiaNodeSummary[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Sorgning fejlede') }
  }
}
