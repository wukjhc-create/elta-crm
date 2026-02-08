'use server'

import { createClient } from '@/lib/supabase/server'
import { validateUUID } from '@/lib/validations/common'
import type { ActionResult } from '@/types/common.types'
import { requireAuth, formatError } from '@/lib/actions/action-helpers'

// =====================================================
// Types
// =====================================================

export interface PriceChangeAlert {
  id: string
  supplier_product_id: string
  product_name: string
  supplier_name: string
  supplier_sku: string
  old_price: number
  new_price: number
  change_percentage: number
  change_direction: 'increase' | 'decrease'
  changed_at: string
  affects_offers: number
  affects_calculations: number
}

export interface PriceTrend {
  supplier_product_id: string
  product_name: string
  supplier_name: string
  current_price: number
  price_30_days_ago: number | null
  price_90_days_ago: number | null
  trend_30_days: number | null
  trend_90_days: number | null
  volatility: 'stable' | 'moderate' | 'high'
  change_count_30_days: number
}

export interface AffectedOffer {
  offer_id: string
  offer_number: string
  offer_title: string
  customer_name: string
  status: string
  total_amount: number
  affected_items: number
  potential_loss: number
  created_at: string
}

export interface SupplierPriceStats {
  supplier_id: string
  supplier_name: string
  total_products: number
  products_with_price_changes: number
  average_price_increase: number
  average_price_decrease: number
  last_sync_at: string | null
  stale_products: number
}
// =====================================================
// Price Change Alerts
// =====================================================

/**
 * Get recent price change alerts (significant changes)
 */
export async function getPriceChangeAlerts(options?: {
  supplierId?: string
  threshold?: number // Minimum change percentage to include
  limit?: number
  daysBack?: number
}): Promise<ActionResult<PriceChangeAlert[]>> {
  try {
    await requireAuth()

    const supabase = await createClient()
    const threshold = options?.threshold || 5 // Default 5% change
    const daysBack = options?.daysBack || 7
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysBack)

    let query = supabase
      .from('price_history')
      .select(`
        id,
        supplier_product_id,
        old_cost_price,
        new_cost_price,
        change_percentage,
        created_at,
        supplier_products!inner (
          supplier_name,
          supplier_sku,
          supplier_id,
          suppliers!inner (
            name
          )
        )
      `)
      .gte('created_at', cutoffDate.toISOString())
      .or(`change_percentage.gte.${threshold},change_percentage.lte.-${threshold}`)
      .order('created_at', { ascending: false })
      .limit(options?.limit || 50)

    if (options?.supplierId) {
      validateUUID(options.supplierId, 'leverandør ID')
      query = query.eq('supplier_products.supplier_id', options.supplierId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Database error fetching price alerts:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Get affected offers and calculations counts
    const alerts: PriceChangeAlert[] = []

    for (const row of data || []) {
      const sp = Array.isArray(row.supplier_products) ? row.supplier_products[0] : row.supplier_products
      const supplier = sp?.suppliers ? (Array.isArray(sp.suppliers) ? sp.suppliers[0] : sp.suppliers) : null

      // Count affected offers (line items with this supplier product)
      const { count: offerCount } = await supabase
        .from('offer_line_items')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_product_id', row.supplier_product_id)

      // Count affected calculations (materials linked to this product)
      const { count: calcCount } = await supabase
        .from('kalkia_variant_materials')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_product_id', row.supplier_product_id)

      alerts.push({
        id: row.id,
        supplier_product_id: row.supplier_product_id,
        product_name: sp?.supplier_name || '',
        supplier_name: supplier?.name || '',
        supplier_sku: sp?.supplier_sku || '',
        old_price: row.old_cost_price || 0,
        new_price: row.new_cost_price,
        change_percentage: row.change_percentage,
        change_direction: row.change_percentage > 0 ? 'increase' : 'decrease',
        changed_at: row.created_at,
        affects_offers: offerCount || 0,
        affects_calculations: calcCount || 0,
      })
    }

    return { success: true, data: alerts }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente prisadvarsler') }
  }
}

/**
 * Get offers affected by recent price changes
 */
export async function getAffectedOffers(
  supplierProductId?: string,
  options?: { daysBack?: number }
): Promise<ActionResult<AffectedOffer[]>> {
  try {
    await requireAuth()

    const supabase = await createClient()
    const daysBack = options?.daysBack || 30
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysBack)

    // Get recent price changes
    let priceChangesQuery = supabase
      .from('price_history')
      .select('supplier_product_id, old_cost_price, new_cost_price')
      .gte('created_at', cutoffDate.toISOString())

    if (supplierProductId) {
      validateUUID(supplierProductId, 'produkt ID')
      priceChangesQuery = priceChangesQuery.eq('supplier_product_id', supplierProductId)
    }

    const { data: priceChanges } = await priceChangesQuery

    if (!priceChanges || priceChanges.length === 0) {
      return { success: true, data: [] }
    }

    const changedProductIds = [...new Set(priceChanges.map((pc) => pc.supplier_product_id))]

    // Get affected offers
    const { data: lineItems, error: liError } = await supabase
      .from('offer_line_items')
      .select(`
        id,
        offer_id,
        quantity,
        unit_price,
        supplier_product_id,
        supplier_cost_price_at_creation,
        offers!inner (
          id,
          offer_number,
          title,
          status,
          total_amount,
          created_at,
          customers (
            company_name
          )
        )
      `)
      .in('supplier_product_id', changedProductIds)
      .in('offers.status', ['draft', 'sent', 'pending'])

    if (liError) {
      console.error('Database error fetching affected offers:', liError)
      throw new Error('DATABASE_ERROR')
    }

    // Build price change map
    const priceChangeMap = new Map<string, { old: number; new: number }>()
    for (const pc of priceChanges) {
      const existing = priceChangeMap.get(pc.supplier_product_id)
      if (!existing || pc.new_cost_price > existing.new) {
        priceChangeMap.set(pc.supplier_product_id, {
          old: pc.old_cost_price || 0,
          new: pc.new_cost_price,
        })
      }
    }

    // Group by offer
    type OfferData = {
      id: string
      offer_number: string
      title: string
      status: string
      total_amount: number | null
      created_at: string
      customers: { company_name: string } | { company_name: string }[] | null
    }
    const offerMap = new Map<string, {
      offer: OfferData
      items: typeof lineItems
      potentialLoss: number
    }>()

    for (const li of lineItems || []) {
      const rawOffer = Array.isArray(li.offers) ? li.offers[0] : li.offers
      if (!rawOffer) continue
      const offer = rawOffer as OfferData

      const priceChange = priceChangeMap.get(li.supplier_product_id!)
      const potentialLoss = priceChange
        ? (priceChange.new - (li.supplier_cost_price_at_creation || priceChange.old)) * li.quantity
        : 0

      if (!offerMap.has(offer.id)) {
        offerMap.set(offer.id, {
          offer,
          items: [],
          potentialLoss: 0,
        })
      }

      const entry = offerMap.get(offer.id)!
      entry.items.push(li)
      entry.potentialLoss += potentialLoss
    }

    // Transform to result
    const affectedOffers: AffectedOffer[] = []
    for (const [offerId, { offer, items, potentialLoss }] of offerMap) {
      const customer = offer.customers
        ? (Array.isArray(offer.customers) ? offer.customers[0] : offer.customers)
        : null

      affectedOffers.push({
        offer_id: offerId,
        offer_number: offer.offer_number,
        offer_title: offer.title,
        customer_name: customer?.company_name || 'Ukendt',
        status: offer.status,
        total_amount: offer.total_amount || 0,
        affected_items: items.length,
        potential_loss: Math.round(potentialLoss * 100) / 100,
        created_at: offer.created_at,
      })
    }

    // Sort by potential loss
    affectedOffers.sort((a, b) => b.potential_loss - a.potential_loss)

    return { success: true, data: affectedOffers }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente påvirkede tilbud') }
  }
}

// =====================================================
// Price Trends
// =====================================================

/**
 * Get price trends for supplier products
 */
export async function getPriceTrends(
  supplierId: string,
  options?: { limit?: number }
): Promise<ActionResult<PriceTrend[]>> {
  try {
    await requireAuth()
    validateUUID(supplierId, 'leverandør ID')

    const supabase = await createClient()
    const now = new Date()
    const date30DaysAgo = new Date(now)
    date30DaysAgo.setDate(date30DaysAgo.getDate() - 30)
    const date90DaysAgo = new Date(now)
    date90DaysAgo.setDate(date90DaysAgo.getDate() - 90)

    // Get products with price history
    const { data: products, error: prodError } = await supabase
      .from('supplier_products')
      .select(`
        id,
        supplier_name,
        cost_price,
        suppliers!inner (
          name
        )
      `)
      .eq('supplier_id', supplierId)
      .not('cost_price', 'is', null)
      .limit(options?.limit || 100)

    if (prodError) {
      console.error('Database error fetching products:', prodError)
      throw new Error('DATABASE_ERROR')
    }

    const trends: PriceTrend[] = []

    for (const product of products || []) {
      const supplier = Array.isArray(product.suppliers) ? product.suppliers[0] : product.suppliers

      // Get price history
      const { data: history } = await supabase
        .from('price_history')
        .select('old_cost_price, new_cost_price, created_at')
        .eq('supplier_product_id', product.id)
        .order('created_at', { ascending: true })

      // Calculate trends
      let price30DaysAgo: number | null = null
      let price90DaysAgo: number | null = null
      let changeCount30Days = 0

      for (const h of history || []) {
        const changeDate = new Date(h.created_at)

        if (changeDate <= date30DaysAgo && changeDate > date90DaysAgo) {
          price30DaysAgo = h.old_cost_price
        }
        if (changeDate <= date90DaysAgo) {
          price90DaysAgo = h.old_cost_price
        }
        if (changeDate >= date30DaysAgo) {
          changeCount30Days++
        }
      }

      // Calculate percentage trends
      const currentPrice = product.cost_price
      const trend30Days = price30DaysAgo && currentPrice
        ? ((currentPrice - price30DaysAgo) / price30DaysAgo) * 100
        : null
      const trend90Days = price90DaysAgo && currentPrice
        ? ((currentPrice - price90DaysAgo) / price90DaysAgo) * 100
        : null

      // Determine volatility
      let volatility: 'stable' | 'moderate' | 'high' = 'stable'
      if (changeCount30Days >= 5) {
        volatility = 'high'
      } else if (changeCount30Days >= 2) {
        volatility = 'moderate'
      }

      trends.push({
        supplier_product_id: product.id,
        product_name: product.supplier_name,
        supplier_name: supplier?.name || '',
        current_price: currentPrice,
        price_30_days_ago: price30DaysAgo,
        price_90_days_ago: price90DaysAgo,
        trend_30_days: trend30Days ? Math.round(trend30Days * 100) / 100 : null,
        trend_90_days: trend90Days ? Math.round(trend90Days * 100) / 100 : null,
        volatility,
        change_count_30_days: changeCount30Days,
      })
    }

    return { success: true, data: trends }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente pristendenser') }
  }
}

// =====================================================
// Supplier Statistics
// =====================================================

/**
 * Get price statistics for all suppliers
 */
export async function getSupplierPriceStats(): Promise<ActionResult<SupplierPriceStats[]>> {
  try {
    await requireAuth()

    const supabase = await createClient()
    const now = new Date()
    const date30DaysAgo = new Date(now)
    date30DaysAgo.setDate(date30DaysAgo.getDate() - 30)
    const staleThreshold = new Date(now)
    staleThreshold.setDate(staleThreshold.getDate() - 7)

    // Get all active suppliers
    const { data: suppliers, error: supplierError } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('is_active', true)

    if (supplierError) {
      console.error('Database error fetching suppliers:', supplierError)
      throw new Error('DATABASE_ERROR')
    }

    const stats: SupplierPriceStats[] = []

    for (const supplier of suppliers || []) {
      // Get product counts
      const { count: totalProducts } = await supabase
        .from('supplier_products')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', supplier.id)

      // Get stale products
      const { count: staleProducts } = await supabase
        .from('supplier_products')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', supplier.id)
        .or(`last_synced_at.is.null,last_synced_at.lt.${staleThreshold.toISOString()}`)

      // Get price changes in last 30 days
      const { data: priceChanges } = await supabase
        .from('price_history')
        .select(`
          change_percentage,
          supplier_products!inner (
            supplier_id
          )
        `)
        .eq('supplier_products.supplier_id', supplier.id)
        .gte('created_at', date30DaysAgo.toISOString())

      const increases = priceChanges?.filter((pc) => pc.change_percentage > 0) || []
      const decreases = priceChanges?.filter((pc) => pc.change_percentage < 0) || []

      const avgIncrease = increases.length > 0
        ? increases.reduce((sum, pc) => sum + pc.change_percentage, 0) / increases.length
        : 0

      const avgDecrease = decreases.length > 0
        ? decreases.reduce((sum, pc) => sum + pc.change_percentage, 0) / decreases.length
        : 0

      // Get last sync
      const { data: lastSync } = await supabase
        .from('supplier_sync_logs')
        .select('started_at')
        .eq('supplier_id', supplier.id)
        .eq('status', 'completed')
        .order('started_at', { ascending: false })
        .limit(1)
        .single()

      stats.push({
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        total_products: totalProducts || 0,
        products_with_price_changes: priceChanges?.length || 0,
        average_price_increase: Math.round(avgIncrease * 100) / 100,
        average_price_decrease: Math.round(avgDecrease * 100) / 100,
        last_sync_at: lastSync?.started_at || null,
        stale_products: staleProducts || 0,
      })
    }

    return { success: true, data: stats }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandørstatistik') }
  }
}

// =====================================================
// Dashboard Widgets
// =====================================================

/**
 * Get price alert summary for dashboard
 */
export async function getPriceAlertSummary(): Promise<ActionResult<{
  totalAlerts: number
  priceIncreases: number
  priceDecreases: number
  affectedOffers: number
  criticalAlerts: number // Changes > 10%
}>> {
  try {
    await requireAuth()

    const supabase = await createClient()
    const now = new Date()
    const date7DaysAgo = new Date(now)
    date7DaysAgo.setDate(date7DaysAgo.getDate() - 7)

    // Get price changes in last 7 days
    const { data: priceChanges, count: totalAlerts } = await supabase
      .from('price_history')
      .select('change_percentage', { count: 'exact' })
      .gte('created_at', date7DaysAgo.toISOString())
      .or('change_percentage.gte.5,change_percentage.lte.-5')

    const changes = priceChanges || []
    const priceIncreases = changes.filter((pc) => pc.change_percentage > 0).length
    const priceDecreases = changes.filter((pc) => pc.change_percentage < 0).length
    const criticalAlerts = changes.filter((pc) => Math.abs(pc.change_percentage) > 10).length

    // Get affected offers count
    const affectedResult = await getAffectedOffers(undefined, { daysBack: 7 })
    const affectedOffers = affectedResult.success ? affectedResult.data?.length || 0 : 0

    return {
      success: true,
      data: {
        totalAlerts: totalAlerts || 0,
        priceIncreases,
        priceDecreases,
        affectedOffers,
        criticalAlerts,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente prisoversigt') }
  }
}

/**
 * Get product price history
 */
export async function getProductPriceHistory(
  supplierProductId: string,
  options?: { limit?: number }
): Promise<ActionResult<Array<{
  id: string
  old_price: number | null
  new_price: number
  change_percentage: number
  change_source: string
  created_at: string
}>>> {
  try {
    await requireAuth()
    validateUUID(supplierProductId, 'produkt ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('price_history')
      .select('id, old_cost_price, new_cost_price, change_percentage, change_source, created_at')
      .eq('supplier_product_id', supplierProductId)
      .order('created_at', { ascending: false })
      .limit(options?.limit || 50)

    if (error) {
      console.error('Database error fetching price history:', error)
      throw new Error('DATABASE_ERROR')
    }

    return {
      success: true,
      data: (data || []).map((row) => ({
        id: row.id,
        old_price: row.old_cost_price,
        new_price: row.new_cost_price,
        change_percentage: row.change_percentage,
        change_source: row.change_source,
        created_at: row.created_at,
      })),
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente prishistorik') }
  }
}
