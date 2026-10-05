'use server'

import { revalidatePath } from 'next/cache'
import { validateUUID } from '@/lib/validations/common'
import type { ActionResult } from '@/types/common.types'
import type {
  CustomerSupplierPrice,
  CreateCustomerSupplierPriceData,
  CustomerProductPrice,
  CustomerEffectivePrice,
} from '@/types/suppliers.types'
import { getAuthenticatedClient, getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import type { Permission } from '@/lib/auth/permissions'

/**
 * P3 #17 / P-005: rettighedstjek for pris-/leverandoerdomaenet. Server actions kan kaldes direkte af enhver
 * indlogget bruger (et skjult menupunkt eller en layout-guard beskytter ikke en action).
 */
async function requireGate(permission: Permission) {
  const ctx = await getAuthenticatedClientWithRole()
  ctx.requirePermission(permission)
  return ctx
}
import { logger } from '@/lib/utils/logger'
import { createAdminClient } from '@/lib/supabase/admin'
// =====================================================
// Customer-Supplier Price Agreements
// =====================================================

export async function getCustomerSupplierPrices(
  customerId: string
): Promise<ActionResult<CustomerSupplierPrice[]>> {
  try {
    const { supabase } = await requireGate('tools.pricing') // D48: kostpris/avance/leverandørrabat
    validateUUID(customerId, 'kunde ID')

    const { data, error } = await supabase
      .from('customer_supplier_prices')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      logger.error('Database error fetching customer supplier prices', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as CustomerSupplierPrice[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kundeaftaler') }
  }
}

export async function upsertCustomerSupplierPrice(
  data: CreateCustomerSupplierPriceData
): Promise<ActionResult<CustomerSupplierPrice>> {
  try {
    const { supabase, userId } = await requireGate('tools.pricing')
    validateUUID(data.customer_id, 'kunde ID')
    validateUUID(data.supplier_id, 'leverandør ID')

    const { data: result, error } = await supabase
      .from('customer_supplier_prices')
      .upsert(
        {
          ...data,
          created_by: userId,
        },
        { onConflict: 'customer_id,supplier_id' }
      )
      .select()
      .single()

    if (error) {
      logger.error('Database error upserting customer supplier price', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/customers/${data.customer_id}`)
    return { success: true, data: result as CustomerSupplierPrice }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gemme kundeaftale') }
  }
}

export async function deleteCustomerSupplierPrice(
  id: string
): Promise<ActionResult> {
  try {
    const { supabase } = await requireGate('tools.pricing')
    validateUUID(id, 'aftale ID')

    const { error } = await supabase
      .from('customer_supplier_prices')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting customer supplier price', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/customers')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette kundeaftale') }
  }
}

// =====================================================
// Customer-Specific Product Prices
// =====================================================

export async function getCustomerProductPrices(
  customerId: string,
  supplierProductId?: string
): Promise<ActionResult<CustomerProductPrice[]>> {
  try {
    const { supabase } = await requireGate('tools.pricing') // D48: kostpris/avance/leverandørrabat
    validateUUID(customerId, 'kunde ID')

    let query = supabase
      .from('customer_product_prices')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })

    if (supplierProductId) {
      validateUUID(supplierProductId, 'leverandørprodukt ID')
      query = query.eq('supplier_product_id', supplierProductId)
    }

    query = query.limit(200)

    const { data, error } = await query

    if (error) {
      logger.error('Database error fetching customer product prices', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as CustomerProductPrice[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kundepriser') }
  }
}

export async function upsertCustomerProductPrice(
  customerId: string,
  supplierProductId: string,
  data: {
    custom_cost_price?: number
    custom_list_price?: number
    custom_discount_percentage?: number
    notes?: string
    valid_from?: string
    valid_to?: string
    source?: 'manual' | 'import' | 'api'
  }
): Promise<ActionResult<CustomerProductPrice>> {
  try {
    const { supabase, userId } = await requireGate('tools.pricing')
    validateUUID(customerId, 'kunde ID')
    validateUUID(supplierProductId, 'leverandørprodukt ID')

    const { data: result, error } = await supabase
      .from('customer_product_prices')
      .upsert(
        {
          customer_id: customerId,
          supplier_product_id: supplierProductId,
          ...data,
          is_active: true,
          created_by: userId,
        },
        { onConflict: 'customer_id,supplier_product_id' }
      )
      .select()
      .single()

    if (error) {
      logger.error('Database error upserting customer product price', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/customers/${customerId}`)
    return { success: true, data: result as CustomerProductPrice }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gemme kundepris') }
  }
}

// =====================================================
// Effective Price Calculation
// =====================================================

export async function getCustomerEffectivePrice(
  customerId: string,
  supplierProductId: string
): Promise<ActionResult<CustomerEffectivePrice>> {
  try {
    const { supabase } = await requireGate('tools.pricing') // D48: kostpris/avance/leverandørrabat
    validateUUID(customerId, 'kunde ID')
    validateUUID(supplierProductId, 'leverandørprodukt ID')

    // 00192: DB-funktionen læser kostkolonner (invoker) → admin-klienten bag tools.pricing
    const { data, error } = await createAdminClient()
      .rpc('get_customer_product_price', {
        p_customer_id: customerId,
        p_supplier_product_id: supplierProductId,
      })

    if (error) {
      logger.error('Database error getting effective price', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Produkt ikke fundet' }
    }

    return { success: true, data: data[0] as CustomerEffectivePrice }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke beregne pris') }
  }
}

export async function getBestPriceForCustomer(
  customerId: string,
  productSku: string
): Promise<ActionResult<Array<{
  supplier_product_id: string
  supplier_id: string
  supplier_name: string
  supplier_code: string
  base_cost_price: number
  effective_cost_price: number
  effective_sale_price: number
  discount_percentage: number
  is_preferred: boolean
  is_available: boolean
  price_source: string
}>>> {
  try {
    const { supabase } = await requireGate('tools.pricing') // D48: kostpris/avance/leverandørrabat
    validateUUID(customerId, 'kunde ID')

    // 00192: DB-funktionen læser kostkolonner (invoker) → admin-klienten bag tools.pricing
    const { data, error } = await createAdminClient()
      .rpc('get_best_price_for_customer', {
        p_customer_id: customerId,
        p_product_sku: productSku,
      })

    if (error) {
      logger.error('Database error getting best price', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke finde bedste pris') }
  }
}
