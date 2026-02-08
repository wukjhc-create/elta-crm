'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validateUUID } from '@/lib/validations/common'
import type { ActionResult } from '@/types/common.types'
import type {
  CustomerSupplierPrice,
  CreateCustomerSupplierPriceData,
  CustomerProductPrice,
  CustomerEffectivePrice,
} from '@/types/suppliers.types'
import { requireAuth, formatError } from '@/lib/actions/action-helpers'
// =====================================================
// Customer-Supplier Price Agreements
// =====================================================

export async function getCustomerSupplierPrices(
  customerId: string
): Promise<ActionResult<CustomerSupplierPrice[]>> {
  try {
    await requireAuth()
    validateUUID(customerId, 'kunde ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('customer_supplier_prices')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error fetching customer supplier prices:', error)
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
    const userId = await requireAuth()
    validateUUID(data.customer_id, 'kunde ID')
    validateUUID(data.supplier_id, 'leverandør ID')

    const supabase = await createClient()

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
      console.error('Database error upserting customer supplier price:', error)
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
    await requireAuth()
    validateUUID(id, 'aftale ID')

    const supabase = await createClient()

    const { error } = await supabase
      .from('customer_supplier_prices')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Database error deleting customer supplier price:', error)
      throw new Error('DATABASE_ERROR')
    }

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
    await requireAuth()
    validateUUID(customerId, 'kunde ID')

    const supabase = await createClient()

    let query = supabase
      .from('customer_product_prices')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })

    if (supplierProductId) {
      validateUUID(supplierProductId, 'leverandørprodukt ID')
      query = query.eq('supplier_product_id', supplierProductId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Database error fetching customer product prices:', error)
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
    const userId = await requireAuth()
    validateUUID(customerId, 'kunde ID')
    validateUUID(supplierProductId, 'leverandørprodukt ID')

    const supabase = await createClient()

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
      console.error('Database error upserting customer product price:', error)
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
    await requireAuth()
    validateUUID(customerId, 'kunde ID')
    validateUUID(supplierProductId, 'leverandørprodukt ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .rpc('get_customer_product_price', {
        p_customer_id: customerId,
        p_supplier_product_id: supplierProductId,
      })

    if (error) {
      console.error('Database error getting effective price:', error)
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
    await requireAuth()
    validateUUID(customerId, 'kunde ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .rpc('get_best_price_for_customer', {
        p_customer_id: customerId,
        p_product_sku: productSku,
      })

    if (error) {
      console.error('Database error getting best price:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke finde bedste pris') }
  }
}
