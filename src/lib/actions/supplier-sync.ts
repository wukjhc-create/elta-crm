'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validateUUID } from '@/lib/validations/common'
import { SupplierAPIClientFactory, type ProductPrice } from '@/lib/services/supplier-api-client'
import type { ActionResult } from '@/types/common.types'
import { requireAuth, formatError } from '@/lib/actions/action-helpers'

// =====================================================
// Types
// =====================================================

export interface SyncResult {
  totalProducts: number
  newProducts: number
  updatedProducts: number
  priceChanges: number
  errors: string[]
  durationMs: number
}

export interface PriceSyncResult {
  sku: string
  name: string
  oldPrice: number | null
  newPrice: number
  changePercent: number
  changeType: 'new' | 'increase' | 'decrease' | 'unchanged'
}
// =====================================================
// Sync Product Prices
// =====================================================

/**
 * Sync prices for products from supplier API
 */
export async function syncSupplierPrices(
  supplierId: string,
  options?: { skus?: string[]; batchSize?: number }
): Promise<ActionResult<SyncResult>> {
  const startTime = Date.now()

  try {
    const userId = await requireAuth()
    validateUUID(supplierId, 'leverandør ID')

    const supabase = await createClient()

    // Get supplier info
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('id, code, name')
      .eq('id', supplierId)
      .single()

    if (supplierError || !supplier) {
      return { success: false, error: 'Leverandør ikke fundet' }
    }

    // Get API client for this supplier
    const client = await SupplierAPIClientFactory.getClient(supplierId, supplier.code || '')
    if (!client) {
      return { success: false, error: `API integration ikke tilgængelig for ${supplier.name}` }
    }

    // Get products to sync
    let skusToSync = options?.skus || []
    if (skusToSync.length === 0) {
      // Get all products for this supplier
      const { data: products } = await supabase
        .from('supplier_products')
        .select('supplier_sku')
        .eq('supplier_id', supplierId)

      skusToSync = products?.map((p) => p.supplier_sku) || []
    }

    if (skusToSync.length === 0) {
      return {
        success: true,
        data: {
          totalProducts: 0,
          newProducts: 0,
          updatedProducts: 0,
          priceChanges: 0,
          errors: [],
          durationMs: Date.now() - startTime,
        },
      }
    }

    // Sync in batches
    const batchSize = options?.batchSize || 50
    const errors: string[] = []
    let updatedProducts = 0
    let priceChanges = 0
    const priceChangeRecords: Array<{
      supplier_product_id: string
      old_cost_price: number | null
      new_cost_price: number
      old_list_price: number | null
      new_list_price: number | null
      change_percentage: number
      change_source: 'api_sync'
    }> = []

    for (let i = 0; i < skusToSync.length; i += batchSize) {
      const batch = skusToSync.slice(i, i + batchSize)

      try {
        const prices = await client.getProductPrices(batch)

        for (const [sku, price] of prices) {
          // Get existing product
          const { data: existingProduct } = await supabase
            .from('supplier_products')
            .select('id, cost_price, list_price')
            .eq('supplier_id', supplierId)
            .eq('supplier_sku', sku)
            .single()

          if (!existingProduct) continue

          const oldCostPrice = existingProduct.cost_price
          const newCostPrice = price.costPrice

          // Check if price changed
          if (oldCostPrice !== newCostPrice) {
            const changePercentage =
              oldCostPrice && oldCostPrice > 0
                ? ((newCostPrice - oldCostPrice) / oldCostPrice) * 100
                : 0

            // Update product
            await supabase
              .from('supplier_products')
              .update({
                cost_price: newCostPrice,
                list_price: price.listPrice,
                is_available: price.isAvailable,
                lead_time_days: price.leadTimeDays,
                last_synced_at: new Date().toISOString(),
              })
              .eq('id', existingProduct.id)

            priceChangeRecords.push({
              supplier_product_id: existingProduct.id,
              old_cost_price: oldCostPrice,
              new_cost_price: newCostPrice,
              old_list_price: existingProduct.list_price,
              new_list_price: price.listPrice,
              change_percentage: Math.round(changePercentage * 100) / 100,
              change_source: 'api_sync',
            })

            priceChanges++
          } else {
            // Just update availability and sync timestamp
            await supabase
              .from('supplier_products')
              .update({
                is_available: price.isAvailable,
                lead_time_days: price.leadTimeDays,
                last_synced_at: new Date().toISOString(),
              })
              .eq('id', existingProduct.id)
          }

          updatedProducts++
        }
      } catch (error) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error instanceof Error ? error.message : 'Ukendt fejl'}`)
      }
    }

    // Record price changes
    if (priceChangeRecords.length > 0) {
      await supabase.from('price_history').insert(priceChangeRecords)
    }

    // Create sync log entry
    await supabase.from('supplier_sync_logs').insert({
      supplier_id: supplierId,
      job_type: 'price_update',
      status: errors.length === 0 ? 'completed' : 'partial',
      trigger_type: 'manual',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      total_items: skusToSync.length,
      processed_items: updatedProducts,
      updated_items: updatedProducts,
      price_changes_count: priceChanges,
      error_message: errors.length > 0 ? errors.join('; ') : null,
      triggered_by: userId,
    })

    revalidatePath('/dashboard/settings/suppliers')

    return {
      success: true,
      data: {
        totalProducts: skusToSync.length,
        newProducts: 0,
        updatedProducts,
        priceChanges,
        errors,
        durationMs: Date.now() - startTime,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke synkronisere priser') }
  }
}

/**
 * Search for products in supplier API
 */
export async function searchSupplierAPI(
  supplierId: string,
  query: string,
  options?: { limit?: number }
): Promise<ActionResult<ProductPrice[]>> {
  try {
    await requireAuth()
    validateUUID(supplierId, 'leverandør ID')

    const supabase = await createClient()

    // Get supplier info
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('code, name')
      .eq('id', supplierId)
      .single()

    if (!supplier) {
      return { success: false, error: 'Leverandør ikke fundet' }
    }

    // Get API client
    const client = await SupplierAPIClientFactory.getClient(supplierId, supplier.code || '')
    if (!client) {
      return { success: false, error: `API integration ikke tilgængelig for ${supplier.name}` }
    }

    // Search products
    const result = await client.searchProducts({
      query,
      limit: options?.limit || 20,
    })

    return { success: true, data: result.products }
  } catch (err) {
    return { success: false, error: formatError(err, 'Søgefejl') }
  }
}

/**
 * Get live price for a single product
 */
export async function getLiveProductPrice(
  supplierId: string,
  sku: string
): Promise<ActionResult<ProductPrice>> {
  try {
    await requireAuth()
    validateUUID(supplierId, 'leverandør ID')

    const supabase = await createClient()

    // Get supplier info
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('code, name')
      .eq('id', supplierId)
      .single()

    if (!supplier) {
      return { success: false, error: 'Leverandør ikke fundet' }
    }

    // Get API client
    const client = await SupplierAPIClientFactory.getClient(supplierId, supplier.code || '')
    if (!client) {
      return { success: false, error: `API integration ikke tilgængelig` }
    }

    // Get price
    const price = await client.getProductPrice(sku)
    if (!price) {
      return { success: false, error: 'Produkt ikke fundet' }
    }

    return { success: true, data: price }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente pris') }
  }
}

/**
 * Test supplier API connection
 */
export async function testSupplierAPIConnection(
  supplierId: string
): Promise<ActionResult<{ success: boolean; message: string }>> {
  try {
    await requireAuth()
    validateUUID(supplierId, 'leverandør ID')

    const supabase = await createClient()

    // Get supplier info
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('code, name')
      .eq('id', supplierId)
      .single()

    if (!supplier) {
      return { success: false, error: 'Leverandør ikke fundet' }
    }

    // Get API client
    const client = await SupplierAPIClientFactory.getClient(supplierId, supplier.code || '')
    if (!client) {
      return {
        success: true,
        data: { success: false, message: `API integration ikke konfigureret for ${supplier.name}` },
      }
    }

    // Test connection
    const result = await client.testConnection()

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Forbindelsestest fejlede') }
  }
}

/**
 * Import new products from supplier API search
 */
export async function importProductsFromAPI(
  supplierId: string,
  products: ProductPrice[]
): Promise<ActionResult<{ imported: number; updated: number }>> {
  try {
    const userId = await requireAuth()
    validateUUID(supplierId, 'leverandør ID')

    const supabase = await createClient()
    let imported = 0
    let updated = 0

    for (const product of products) {
      // Check if product exists
      const { data: existing } = await supabase
        .from('supplier_products')
        .select('id')
        .eq('supplier_id', supplierId)
        .eq('supplier_sku', product.sku)
        .single()

      if (existing) {
        // Update existing
        await supabase
          .from('supplier_products')
          .update({
            supplier_name: product.name,
            cost_price: product.costPrice,
            list_price: product.listPrice,
            unit: product.unit,
            is_available: product.isAvailable,
            lead_time_days: product.leadTimeDays,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        updated++
      } else {
        // Insert new
        await supabase.from('supplier_products').insert({
          supplier_id: supplierId,
          supplier_sku: product.sku,
          supplier_name: product.name,
          cost_price: product.costPrice,
          list_price: product.listPrice,
          unit: product.unit,
          is_available: product.isAvailable,
          lead_time_days: product.leadTimeDays,
          last_synced_at: new Date().toISOString(),
          created_by: userId,
        })
        imported++
      }
    }

    revalidatePath('/dashboard/settings/suppliers')

    return { success: true, data: { imported, updated } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke importere produkter') }
  }
}

/**
 * Get price comparison for a product across all suppliers
 */
export async function getProductPriceComparison(
  productName: string
): Promise<ActionResult<Array<{ supplierId: string; supplierName: string; supplierCode: string; price: ProductPrice }>>> {
  try {
    await requireAuth()

    const supabase = await createClient()

    // Get all active suppliers with API credentials
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select(`
        id,
        name,
        code,
        supplier_credentials!inner (
          id,
          is_active,
          credential_type
        )
      `)
      .eq('is_active', true)
      .eq('supplier_credentials.is_active', true)
      .eq('supplier_credentials.credential_type', 'api')

    if (!suppliers || suppliers.length === 0) {
      return { success: true, data: [] }
    }

    const results: Array<{
      supplierId: string
      supplierName: string
      supplierCode: string
      price: ProductPrice
    }> = []

    // Search each supplier
    for (const supplier of suppliers) {
      try {
        const client = await SupplierAPIClientFactory.getClient(supplier.id, supplier.code || '')
        if (!client) continue

        const searchResult = await client.searchProducts({
          query: productName,
          limit: 1,
        })

        if (searchResult.products.length > 0) {
          results.push({
            supplierId: supplier.id,
            supplierName: supplier.name,
            supplierCode: supplier.code || '',
            price: searchResult.products[0],
          })
        }
      } catch {
        // Skip suppliers with errors
      }
    }

    // Sort by cost price
    results.sort((a, b) => a.price.costPrice - b.price.costPrice)

    return { success: true, data: results }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke sammenligne priser') }
  }
}
