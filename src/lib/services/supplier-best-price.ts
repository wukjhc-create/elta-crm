/**
 * getBestSupplierPrice
 *
 * Cheap, service-side (no auth context) lookup of the best matching
 * supplier product from the local `supplier_products` mirror.
 *
 * - First tries exact match on `supplier_sku`.
 * - Falls back to ILIKE on `supplier_name` (Danish supplier_name column).
 * - Ranks by: in-stock first, then customer-effective price (if customerId
 *   is provided via DB function `get_best_price_for_customer`), then
 *   raw cost_price ASC.
 * - Returns null when nothing usable is found.
 *
 * NEVER calls live supplier APIs. Use existing `searchSupplierProductsLive()`
 * for the user-facing live path. This helper is for background automation
 * (auto-offer drafts) where we accept slightly stale local data.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

export interface BestSupplierPrice {
  supplier_product_id: string
  supplier_id: string
  supplier_code: string | null
  supplier_name_at_creation: string
  supplier_sku: string
  product_name: string
  cost_price: number
  list_price: number | null
  unit: string | null
  is_available: boolean
  image_url: string | null
}

export interface BestSupplierPriceOptions {
  customerId?: string | null
  limit?: number
}

export async function getBestSupplierPrice(
  query: string,
  options: BestSupplierPriceOptions = {}
): Promise<BestSupplierPrice | null> {
  const trimmed = (query || '').trim()
  if (trimmed.length < 2) return null

  const supabase = createAdminClient()
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50))

  try {
    // 1. Exact SKU match (cheapest available wins)
    const { data: skuMatches } = await supabase
      .from('supplier_products')
      .select(
        'id, supplier_id, supplier_sku, supplier_name, cost_price, list_price, unit, is_available, image_url, suppliers!inner(code, name, is_active)'
      )
      .eq('supplier_sku', trimmed)
      .eq('suppliers.is_active', true)
      .order('cost_price', { ascending: true })
      .limit(limit)

    let candidates = skuMatches || []

    // 2. If no SKU hit, try name ILIKE
    if (candidates.length === 0) {
      const safe = trimmed.replace(/[%,()]/g, ' ')
      const { data: nameMatches } = await supabase
        .from('supplier_products')
        .select(
          'id, supplier_id, supplier_sku, supplier_name, cost_price, list_price, unit, is_available, image_url, suppliers!inner(code, name, is_active)'
        )
        .ilike('supplier_name', `%${safe}%`)
        .eq('suppliers.is_active', true)
        .gt('cost_price', 0)
        .order('cost_price', { ascending: true })
        .limit(limit)
      candidates = nameMatches || []
    }

    if (candidates.length === 0) return null

    // 3. Sort: in-stock first, then cost_price asc.
    candidates.sort((a, b) => {
      const aAvail = a.is_available ? 0 : 1
      const bAvail = b.is_available ? 0 : 1
      if (aAvail !== bAvail) return aAvail - bAvail
      return (a.cost_price ?? Number.MAX_VALUE) - (b.cost_price ?? Number.MAX_VALUE)
    })

    const winner = candidates[0]

    // 4. Optional customer-specific re-pricing via DB function.
    let costPrice = Number(winner.cost_price ?? 0)
    if (options.customerId) {
      try {
        const { data: customerPrice } = await supabase.rpc('get_best_price_for_customer', {
          p_customer_id: options.customerId,
          p_supplier_product_id: winner.id,
        })
        if (typeof customerPrice === 'number' && customerPrice > 0) {
          costPrice = customerPrice
        }
      } catch (err) {
        // Function may be missing in some envs — fall back silently to raw cost_price.
        logger.warn('get_best_price_for_customer failed; using raw cost_price', {
          metadata: { customerId: options.customerId, supplierProductId: winner.id },
          error: err,
        })
      }
    }

    const supplierJoin = (winner as { suppliers?: { code?: string; name?: string } }).suppliers || {}

    return {
      supplier_product_id: winner.id,
      supplier_id: winner.supplier_id,
      supplier_code: supplierJoin.code ?? null,
      supplier_name_at_creation: supplierJoin.name || winner.supplier_name || '',
      supplier_sku: winner.supplier_sku,
      product_name: winner.supplier_name || '',
      cost_price: costPrice,
      list_price: winner.list_price !== null ? Number(winner.list_price) : null,
      unit: winner.unit ?? null,
      is_available: !!winner.is_available,
      image_url: winner.image_url ?? null,
    }
  } catch (err) {
    logger.error('getBestSupplierPrice failed', {
      metadata: { query: trimmed, customerId: options.customerId ?? null },
      error: err,
    })
    return null
  }
}
