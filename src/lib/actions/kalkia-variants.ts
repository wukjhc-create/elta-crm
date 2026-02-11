'use server'

import { revalidatePath } from 'next/cache'
import {
  createKalkiaVariantSchema,
  updateKalkiaVariantSchema,
  createKalkiaVariantMaterialSchema,
  updateKalkiaVariantMaterialSchema,
} from '@/lib/validations/kalkia'
import { validateUUID } from '@/lib/validations/common'
import type {
  KalkiaVariant,
  KalkiaVariantWithMaterials,
  KalkiaVariantMaterial,
} from '@/types/kalkia.types'
import type { ActionResult } from '@/types/common.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Kalkia Variants CRUD
// =====================================================

export async function getKalkiaVariants(
  nodeId: string
): Promise<ActionResult<KalkiaVariantWithMaterials[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(nodeId, 'node ID')

    const { data, error } = await supabase
      .from('kalkia_variants')
      .select(`
        *,
        materials:kalkia_variant_materials(
          *,
          product:product_catalog(id, name, sku, cost_price, list_price),
          supplier_product:supplier_products(id, supplier_sku, supplier_name, cost_price, list_price, supplier:suppliers(name, code))
        )
      `)
      .eq('node_id', nodeId)
      .order('sort_order')

    if (error) {
      logger.error('Database error fetching kalkia variants', { error: error })
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
    const { supabase } = await getAuthenticatedClient()

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
      logger.error('Database error creating kalkia variant', { error: error })
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
    const { supabase } = await getAuthenticatedClient()

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

    // If setting as default, get node_id first and unset others
    if (validated.data.is_default) {
      const { data: variant } = await supabase
        .from('kalkia_variants')
        .select('node_id')
        .eq('id', id)
        .maybeSingle()

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
      logger.error('Database error updating kalkia variant', { error: error })
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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'variant ID')

    const { error } = await supabase
      .from('kalkia_variants')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting kalkia variant', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/nodes')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette variant') }
  }
}

// =====================================================
// Kalkia Variant Materials CRUD
// =====================================================

export async function createKalkiaVariantMaterial(
  formData: FormData
): Promise<ActionResult<KalkiaVariantMaterial>> {
  try {
    const { supabase } = await getAuthenticatedClient()

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

    const { data, error } = await supabase
      .from('kalkia_variant_materials')
      .insert(validated.data)
      .select()
      .single()

    if (error) {
      logger.error('Database error creating kalkia variant material', { error: error })
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
    const { supabase } = await getAuthenticatedClient()

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
      logger.error('Database error updating kalkia variant material', { error: error })
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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'materiale ID')

    const { error } = await supabase
      .from('kalkia_variant_materials')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting kalkia variant material', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/nodes')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette materiale') }
  }
}
