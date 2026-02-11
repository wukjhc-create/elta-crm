'use server'

import { revalidatePath } from 'next/cache'
import { validateUUID } from '@/lib/validations/common'
import type { ActionResult } from '@/types/common.types'
import type {
  SupplierMarginRule,
  CreateMarginRuleData,
  MarginRuleType,
} from '@/types/suppliers.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
// =====================================================
// Margin Rules CRUD
// =====================================================

/**
 * Get all margin rules for a supplier
 */
export async function getSupplierMarginRules(
  supplierId: string
): Promise<ActionResult<SupplierMarginRule[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(supplierId, 'leverandør ID')

    const { data, error } = await supabase
      .from('supplier_margin_rules')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('priority', { ascending: false })
      .order('rule_type')

    if (error) {
      logger.error('Database error fetching margin rules', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as SupplierMarginRule[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente marginregler') }
  }
}

/**
 * Create a new margin rule
 */
export async function createMarginRule(
  data: CreateMarginRuleData
): Promise<ActionResult<SupplierMarginRule>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(data.supplier_id, 'leverandør ID')

    // Validate optional IDs
    if (data.supplier_product_id) {
      validateUUID(data.supplier_product_id, 'produkt ID')
    }
    if (data.customer_id) {
      validateUUID(data.customer_id, 'kunde ID')
    }

    // Validate rule type and required fields
    if (data.rule_type === 'category' && !data.category) {
      return { success: false, error: 'Kategori er påkrævet for kategori-regler' }
    }
    if (data.rule_type === 'subcategory' && (!data.category || !data.sub_category)) {
      return { success: false, error: 'Kategori og underkategori er påkrævet' }
    }
    if (data.rule_type === 'product' && !data.supplier_product_id) {
      return { success: false, error: 'Produkt er påkrævet for produkt-regler' }
    }
    if (data.rule_type === 'customer' && !data.customer_id) {
      return { success: false, error: 'Kunde er påkrævet for kunde-regler' }
    }

    const { data: result, error } = await supabase
      .from('supplier_margin_rules')
      .insert({
        supplier_id: data.supplier_id,
        rule_type: data.rule_type,
        category: data.category || null,
        sub_category: data.sub_category || null,
        supplier_product_id: data.supplier_product_id || null,
        customer_id: data.customer_id || null,
        margin_percentage: data.margin_percentage,
        min_margin_percentage: data.min_margin_percentage || null,
        max_margin_percentage: data.max_margin_percentage || null,
        fixed_markup: data.fixed_markup || 0,
        round_to: data.round_to || null,
        valid_from: data.valid_from || null,
        valid_to: data.valid_to || null,
        is_active: true,
        priority: data.priority || 0,
        notes: data.notes || null,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      logger.error('Database error creating margin rule', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')

    return { success: true, data: result as SupplierMarginRule }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette marginregel') }
  }
}

/**
 * Update a margin rule
 */
export async function updateMarginRule(
  id: string,
  data: Partial<{
    margin_percentage: number
    min_margin_percentage: number | null
    max_margin_percentage: number | null
    fixed_markup: number
    round_to: number | null
    valid_from: string | null
    valid_to: string | null
    is_active: boolean
    priority: number
    notes: string
  }>
): Promise<ActionResult<SupplierMarginRule>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'regel ID')

    const updateData: Record<string, unknown> = {}

    if (data.margin_percentage !== undefined) updateData.margin_percentage = data.margin_percentage
    if (data.min_margin_percentage !== undefined) updateData.min_margin_percentage = data.min_margin_percentage
    if (data.max_margin_percentage !== undefined) updateData.max_margin_percentage = data.max_margin_percentage
    if (data.fixed_markup !== undefined) updateData.fixed_markup = data.fixed_markup
    if (data.round_to !== undefined) updateData.round_to = data.round_to
    if (data.valid_from !== undefined) updateData.valid_from = data.valid_from
    if (data.valid_to !== undefined) updateData.valid_to = data.valid_to
    if (data.is_active !== undefined) updateData.is_active = data.is_active
    if (data.priority !== undefined) updateData.priority = data.priority
    if (data.notes !== undefined) updateData.notes = data.notes || null

    const { data: result, error } = await supabase
      .from('supplier_margin_rules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Marginregel ikke fundet' }
      }
      logger.error('Database error updating margin rule', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')

    return { success: true, data: result as SupplierMarginRule }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere marginregel') }
  }
}

/**
 * Delete a margin rule
 */
export async function deleteMarginRule(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'regel ID')

    const { error } = await supabase
      .from('supplier_margin_rules')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting margin rule', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')

    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette marginregel') }
  }
}

/**
 * Toggle margin rule active/inactive
 */
export async function toggleMarginRule(id: string): Promise<ActionResult<SupplierMarginRule>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'regel ID')

    // Get current state
    const { data: current, error: fetchError } = await supabase
      .from('supplier_margin_rules')
      .select('is_active')
      .eq('id', id)
      .single()

    if (fetchError || !current) {
      return { success: false, error: 'Marginregel ikke fundet' }
    }

    // Toggle
    const { data: result, error } = await supabase
      .from('supplier_margin_rules')
      .update({ is_active: !current.is_active })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Database error toggling margin rule', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')

    return { success: true, data: result as SupplierMarginRule }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke ændre marginregel') }
  }
}

// =====================================================
// Effective Margin Calculation
// =====================================================

/**
 * Get the effective margin for a product.
 * Uses the database function get_effective_margin for accurate rule hierarchy.
 */
export async function getEffectiveMargin(
  supplierId: string,
  options?: {
    supplierProductId?: string
    category?: string
    subCategory?: string
    customerId?: string
  }
): Promise<ActionResult<{
  margin_percentage: number
  fixed_markup: number
  round_to: number | null
  rule_type: MarginRuleType
  rule_id: string
} | null>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(supplierId, 'leverandør ID')

    // Call the database function
    const { data, error } = await supabase.rpc('get_effective_margin', {
      p_supplier_id: supplierId,
      p_supplier_product_id: options?.supplierProductId || null,
      p_category: options?.category || null,
      p_sub_category: options?.subCategory || null,
      p_customer_id: options?.customerId || null,
    })

    if (error) {
      logger.error('Database error getting effective margin', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!data || data.length === 0) {
      return { success: true, data: null }
    }

    const margin = data[0]
    return {
      success: true,
      data: {
        margin_percentage: margin.margin_percentage,
        fixed_markup: margin.fixed_markup,
        round_to: margin.round_to,
        rule_type: margin.rule_type as MarginRuleType,
        rule_id: margin.rule_id,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke beregne margin') }
  }
}

/**
 * Calculate the sale price for a product using margin rules.
 * Uses the database function calculate_sale_price.
 */
export async function calculateSalePrice(
  costPrice: number,
  supplierId: string,
  options?: {
    supplierProductId?: string
    category?: string
    subCategory?: string
    customerId?: string
  }
): Promise<ActionResult<number>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(supplierId, 'leverandør ID')

    // Call the database function
    const { data, error } = await supabase.rpc('calculate_sale_price', {
      p_cost_price: costPrice,
      p_supplier_id: supplierId,
      p_supplier_product_id: options?.supplierProductId || null,
      p_category: options?.category || null,
      p_sub_category: options?.subCategory || null,
      p_customer_id: options?.customerId || null,
    })

    if (error) {
      logger.error('Database error calculating sale price', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as number }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke beregne salgspris') }
  }
}

// =====================================================
// Bulk Operations
// =====================================================

/**
 * Apply a default margin rule to a supplier (supplier-level rule).
 * Creates or updates the base margin for all products from this supplier.
 */
export async function setDefaultSupplierMargin(
  supplierId: string,
  marginPercentage: number,
  options?: {
    fixedMarkup?: number
    roundTo?: number
  }
): Promise<ActionResult<SupplierMarginRule>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(supplierId, 'leverandør ID')

    // Check if supplier-level rule exists
    const { data: existing } = await supabase
      .from('supplier_margin_rules')
      .select('id')
      .eq('supplier_id', supplierId)
      .eq('rule_type', 'supplier')
      .maybeSingle()

    if (existing) {
      // Update existing rule
      const { data, error } = await supabase
        .from('supplier_margin_rules')
        .update({
          margin_percentage: marginPercentage,
          fixed_markup: options?.fixedMarkup || 0,
          round_to: options?.roundTo || null,
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        logger.error('Database error updating default margin', { error: error })
        throw new Error('DATABASE_ERROR')
      }

      revalidatePath('/dashboard/settings/suppliers')
      return { success: true, data: data as SupplierMarginRule }
    } else {
      // Create new supplier-level rule
      const { data, error } = await supabase
        .from('supplier_margin_rules')
        .insert({
          supplier_id: supplierId,
          rule_type: 'supplier',
          margin_percentage: marginPercentage,
          fixed_markup: options?.fixedMarkup || 0,
          round_to: options?.roundTo || null,
          is_active: true,
          priority: 0,
          created_by: userId,
        })
        .select()
        .single()

      if (error) {
        logger.error('Database error creating default margin', { error: error })
        throw new Error('DATABASE_ERROR')
      }

      revalidatePath('/dashboard/settings/suppliers')
      return { success: true, data: data as SupplierMarginRule }
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke sætte standard margin') }
  }
}

/**
 * Get margin rule summary for a supplier
 */
export async function getMarginRuleSummary(
  supplierId: string
): Promise<ActionResult<{
  totalRules: number
  activeRules: number
  defaultMargin: number | null
  rulesByType: Record<MarginRuleType, number>
}>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(supplierId, 'leverandør ID')

    const { data, error } = await supabase
      .from('supplier_margin_rules')
      .select('rule_type, is_active, margin_percentage')
      .eq('supplier_id', supplierId)

    if (error) {
      logger.error('Database error getting margin rule summary', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    const rules = data || []
    const rulesByType: Record<MarginRuleType, number> = {
      supplier: 0,
      category: 0,
      subcategory: 0,
      product: 0,
      customer: 0,
    }

    let defaultMargin: number | null = null

    for (const rule of rules) {
      rulesByType[rule.rule_type as MarginRuleType]++
      if (rule.rule_type === 'supplier' && rule.is_active) {
        defaultMargin = rule.margin_percentage
      }
    }

    return {
      success: true,
      data: {
        totalRules: rules.length,
        activeRules: rules.filter((r) => r.is_active).length,
        defaultMargin,
        rulesByType,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente marginregel oversigt') }
  }
}

// UI Helper Constants moved to client components (margin-rules-manager.tsx)
// 'use server' files can only export async functions
