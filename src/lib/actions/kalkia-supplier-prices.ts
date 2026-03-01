'use server'

import { revalidatePath } from 'next/cache'
import { validateUUID, sanitizeSearchTerm } from '@/lib/validations/common'
import type { KalkiaVariantMaterial } from '@/types/kalkia.types'
import type { ActionResult } from '@/types/common.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { CALC_DEFAULTS, BATCH_CONFIG, MONITORING_CONFIG } from '@/lib/constants'
import { calculateSalePrice } from '@/lib/logic/pricing'
import { logger } from '@/lib/utils/logger'

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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(materialId, 'materiale ID')
    validateUUID(supplierProductId, 'leverandørprodukt ID')

    // Get supplier product to verify it exists and get prices
    const { data: supplierProduct, error: spError } = await supabase
      .from('supplier_products')
      .select('id, cost_price, list_price, supplier_name')
      .eq('id', supplierProductId)
      .maybeSingle()

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
      logger.error('Database error linking material to supplier product', { error: error })
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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(materialId, 'materiale ID')

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
      logger.error('Database error unlinking material from supplier product', { error: error })
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
    const { supabase } = await getAuthenticatedClient()

    const sanitized = sanitizeSearchTerm(materialName)
    if (!sanitized || sanitized.length < 2) {
      return { success: true, data: [] }
    }

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
      logger.error('Database error fetching supplier options', { error: error })
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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(variantId, 'variant ID')

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
      logger.error('Database error fetching materials', { error: materialsError })
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
      logger.error('Database error fetching supplier products', { error: spError })
      throw new Error('DATABASE_ERROR')
    }

    const spMap = new Map(
      (supplierProducts || []).map((sp) => [sp.id, sp])
    )

    // Collect updates to execute in parallel
    const toUpdate: Array<{ id: string; cost_price: number; sale_price: number | null }> = []
    let skipped = 0

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

      if (sp.cost_price === material.cost_price && sp.list_price === material.sale_price) {
        skipped++
        continue
      }

      toUpdate.push({ id: material.id, cost_price: sp.cost_price, sale_price: sp.list_price })
    }

    // Execute all updates in parallel (batches of 10 to avoid overwhelming DB)
    let updated = 0
    const BATCH_SIZE = BATCH_CONFIG.MATERIAL_UPDATE_BATCH_SIZE
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map((item) =>
          supabase
            .from('kalkia_variant_materials')
            .update({ cost_price: item.cost_price, sale_price: item.sale_price })
            .eq('id', item.id)
        )
      )
      updated += results.filter((r) => r.status === 'fulfilled' && !(r.value as { error: unknown }).error).length
      skipped += results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && (r.value as { error: unknown }).error)).length
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
    const { supabase } = await getAuthenticatedClient()

    // Call the database function to sync all materials
    const { data, error } = await supabase
      .rpc('sync_all_material_prices_from_suppliers')

    if (error) {
      // If the function doesn't exist, do it manually
      logger.warn('RPC sync_all_material_prices_from_suppliers not available, syncing manually')

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

      // Collect updates to execute in parallel
      const toUpdate: Array<{ id: string; cost_price: number; sale_price: number | null }> = []
      let skipped = 0

      for (const material of materials) {
        const sp = spMap.get(material.supplier_product_id)
        if (!sp) {
          skipped++
          continue
        }

        if (sp.cost_price === material.cost_price && sp.list_price === material.sale_price) {
          skipped++
          continue
        }

        toUpdate.push({ id: material.id, cost_price: sp.cost_price, sale_price: sp.list_price })
      }

      // Execute all updates in parallel (batches of 10)
      let updated = 0
      const BATCH_SIZE = BATCH_CONFIG.MATERIAL_UPDATE_BATCH_SIZE
      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = toUpdate.slice(i, i + BATCH_SIZE)
        const results = await Promise.allSettled(
          batch.map((item) =>
            supabase
              .from('kalkia_variant_materials')
              .update({ cost_price: item.cost_price, sale_price: item.sale_price })
              .eq('id', item.id)
          )
        )
        updated += results.filter((r) => r.status === 'fulfilled' && !(r.value as { error: unknown }).error).length
        skipped += results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && (r.value as { error: unknown }).error)).length
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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(variantId, 'variant ID')

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
      logger.error('Database error loading materials', { error: materialsError })
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
      logger.error('Database error loading supplier products', { error: spError })
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

      // Parallelize customer pricing queries
      const [{ data: customerSupplierPrices }, { data: customerProductPrices }] = await Promise.all([
        supabase
          .from('customer_supplier_prices')
          .select('supplier_id, discount_percentage, custom_margin_percentage')
          .eq('customer_id', customerId)
          .eq('is_active', true),
        supabase
          .from('customer_product_prices')
          .select('supplier_product_id, custom_cost_price, custom_list_price, custom_discount_percentage')
          .eq('customer_id', customerId)
          .eq('is_active', true)
          .in('supplier_product_id', supplierProductIds),
      ])

      if (customerSupplierPrices) {
        customerDiscountMap = new Map(
          customerSupplierPrices.map((csp) => [
            csp.supplier_id,
            { discount: csp.discount_percentage || 0, margin: csp.custom_margin_percentage }
          ])
        )
      }

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
      let margin = sp.margin_percentage || sp.default_margin_percentage || CALC_DEFAULTS.MARGINS.MATERIALS
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

      const effectiveSale = calculateSalePrice(effectiveCost, margin)

      // Check if price is stale (not synced in 7+ days)
      const lastSynced = sp.last_synced_at ? new Date(sp.last_synced_at) : null
      const isStale = !lastSynced || (Date.now() - lastSynced.getTime() > MONITORING_CONFIG.SYNC_STALE_WARNING_DAYS * 24 * 60 * 60 * 1000)

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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(calculationId, 'kalkulation ID')

    // Get all rows in the calculation to find variant IDs
    const { data: rows, error: rowsError } = await supabase
      .from('kalkia_calculation_rows')
      .select('variant_id')
      .eq('calculation_id', calculationId)
      .not('variant_id', 'is', null)

    if (rowsError) {
      logger.error('Database error loading calculation rows', { error: rowsError })
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

    const priceResults = await Promise.allSettled(
      variantIds.map((variantId) => loadSupplierPricesForVariant(variantId, customerId))
    )

    for (const result of priceResults) {
      if (result.status !== 'fulfilled' || !result.value.success || !result.value.data) continue
      for (const [key, value] of result.value.data.entries()) {
        allPrices.set(key, value)
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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(calculationId, 'kalkulation ID')

    // Get all variants in calculation
    const { data: rows, error: rowsError } = await supabase
      .from('kalkia_calculation_rows')
      .select('variant_id')
      .eq('calculation_id', calculationId)
      .not('variant_id', 'is', null)

    if (rowsError) {
      logger.error('Database error fetching calculation rows', { error: rowsError })
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
      logger.error('Database error loading materials', { error: materialsError })
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

    // Refresh prices from each supplier in parallel
    const supplierResults = await Promise.allSettled(
      Array.from(materialsBySupplier.entries()).map(async ([key, supplierMaterials]) => {
        const [supplierId, supplierCode] = key.split(':')
        let refreshed = 0
        let failed = 0
        let changes = 0

        const client = await SupplierAPIClientFactory.getClient(supplierId, supplierCode)
        if (!client) {
          return { refreshed: 0, failed: supplierMaterials.length, changes: 0 }
        }

        const skus = supplierMaterials.map((m) => m.sku)
        const prices = await client.getProductPrices(skus)
        const now = new Date().toISOString()

        // Collect updates and history records
        const productUpdates: Array<() => Promise<unknown>> = []
        const historyRecords: Array<Record<string, unknown>> = []

        for (const material of supplierMaterials) {
          const newPrice = prices.get(material.sku)
          if (!newPrice) {
            failed++
            continue
          }

          if (material.oldPrice !== newPrice.costPrice) {
            productUpdates.push(async () => {
              await supabase
                .from('supplier_products')
                .update({
                  cost_price: newPrice.costPrice,
                  list_price: newPrice.listPrice,
                  is_available: newPrice.isAvailable,
                  lead_time_days: newPrice.leadTimeDays,
                  last_synced_at: now,
                })
                .eq('id', material.supplierProductId)
            })

            if (material.oldPrice) {
              const changePercent = ((newPrice.costPrice - material.oldPrice) / material.oldPrice) * 100
              historyRecords.push({
                supplier_product_id: material.supplierProductId,
                old_cost_price: material.oldPrice,
                new_cost_price: newPrice.costPrice,
                change_percentage: Math.round(changePercent * 100) / 100,
                change_source: 'api_sync',
              })
              changes++
            }
          }
          refreshed++
        }

        // Execute product updates in parallel + batch insert history
        await Promise.all([
          ...productUpdates.map((fn) => fn()),
          historyRecords.length > 0
            ? supabase.from('price_history').insert(historyRecords)
            : Promise.resolve(),
        ])

        return { refreshed, failed, changes }
      })
    )

    for (const result of supplierResults) {
      if (result.status === 'fulfilled') {
        refreshedCount += result.value.refreshed
        failedCount += result.value.failed
        priceChanges += result.value.changes
      } else {
        // Count entire supplier batch as failed
        failedCount++
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
