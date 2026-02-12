'use server'

import type { ActionResult } from '@/types/common.types'
import {
  calculatePrice,
  compareSupplierPrices,
  analyzeMargins,
  suggestPrice,
  getVolumeDiscount,
  CUSTOMER_TIERS,
  DEFAULT_VOLUME_BRACKETS,
  type CustomerTier,
  type PriceCalculationInput,
  type PriceCalculationResult,
  type PriceComparisonResult,
  type MarginAnalysis,
  type PriceSuggestion,
  type SupplierProductForComparison,
  type TierConfig,
  type VolumeBracket,
} from '@/lib/services/price-engine'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Price Calculation
// =====================================================

/**
 * Calculate price with full tier, volume, and margin logic.
 */
export async function calculateProductPrice(
  input: PriceCalculationInput
): Promise<ActionResult<PriceCalculationResult>> {
  try {
    await getAuthenticatedClient()

    if (input.cost_price < 0) {
      return { success: false, error: 'Kostpris kan ikke være negativ' }
    }
    if (input.quantity <= 0) {
      return { success: false, error: 'Antal skal være større end 0' }
    }

    const result = calculatePrice(input)
    return { success: true, data: result }
  } catch (err) {
    logger.error('Price calculation failed', { error: err, action: 'calculateProductPrice' })
    return { success: false, error: formatError(err, 'Kunne ikke beregne pris') }
  }
}

// =====================================================
// Multi-Supplier Comparison
// =====================================================

/**
 * Compare prices for a product across all suppliers.
 * Looks up all suppliers that carry a product matching the search term.
 */
export async function compareProductPrices(
  searchTerm: string,
  quantity: number = 1,
  marginPercent: number = 25,
  customerId?: string
): Promise<ActionResult<PriceComparisonResult>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    if (customerId) {
      validateUUID(customerId, 'customerId')
    }

    // Search for matching products across suppliers
    const { data: products, error } = await supabase
      .from('supplier_products')
      .select(`
        id,
        supplier_id,
        supplier_sku,
        name,
        cost_price,
        list_price,
        is_available,
        lead_time_days,
        last_synced_at,
        suppliers!inner (
          id,
          name
        )
      `)
      .or(`name.ilike.%${searchTerm}%,supplier_sku.ilike.%${searchTerm}%`)
      .eq('is_active', true)
      .limit(50)

    if (error) {
      logger.error('Supplier product search failed', { error, action: 'compareProductPrices' })
      return { success: false, error: 'Kunne ikke søge produkter' }
    }

    if (!products || products.length === 0) {
      return { success: true, data: {
        product_description: searchTerm,
        quantity,
        suppliers: [],
        cheapest_supplier: '',
        most_expensive_supplier: '',
        price_spread_percent: 0,
      }}
    }

    // Determine customer tier
    let customerTier: CustomerTier = 'standard'
    if (customerId) {
      const { data: customer } = await supabase
        .from('customers')
        .select('metadata')
        .eq('id', customerId)
        .maybeSingle()

      const metadata = customer?.metadata as Record<string, unknown> | null
      if (metadata?.pricing_tier && typeof metadata.pricing_tier === 'string') {
        customerTier = metadata.pricing_tier as CustomerTier
      }
    }

    // Build comparison input
    const comparisonProducts: SupplierProductForComparison[] = products.map(p => {
      const supplier = Array.isArray(p.suppliers) ? p.suppliers[0] : p.suppliers
      return {
        supplier_id: p.supplier_id,
        supplier_name: supplier?.name ?? 'Ukendt',
        supplier_product_id: p.id,
        sku: p.supplier_sku,
        product_name: p.name,
        cost_price: p.cost_price ?? 0,
        list_price: p.list_price,
        is_available: p.is_available ?? true,
        lead_time_days: p.lead_time_days,
        last_synced_at: p.last_synced_at,
      }
    })

    const result = compareSupplierPrices(comparisonProducts, quantity, marginPercent, customerTier)

    return { success: true, data: result }
  } catch (err) {
    logger.error('Price comparison failed', { error: err, action: 'compareProductPrices' })
    return { success: false, error: formatError(err, 'Kunne ikke sammenligne priser') }
  }
}

// =====================================================
// Margin Analysis
// =====================================================

/**
 * Analyze margins for an offer's line items.
 */
export async function analyzeOfferMargins(
  offerId: string
): Promise<ActionResult<MarginAnalysis>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(offerId, 'offerId')

    const { data: lineItems, error } = await supabase
      .from('offer_line_items')
      .select('description, unit_cost, unit_price, quantity')
      .eq('offer_id', offerId)
      .order('position')

    if (error) {
      return { success: false, error: 'Kunne ikke hente tilbudslinjer' }
    }

    if (!lineItems || lineItems.length === 0) {
      return { success: false, error: 'Ingen linjer fundet i tilbuddet' }
    }

    const items = lineItems.map(li => ({
      description: li.description || 'Unavngiven',
      cost: (li.unit_cost ?? 0) * (li.quantity ?? 1),
      sale: (li.unit_price ?? 0) * (li.quantity ?? 1),
    }))

    const result = analyzeMargins(items)

    return { success: true, data: result }
  } catch (err) {
    logger.error('Margin analysis failed', { error: err, action: 'analyzeOfferMargins' })
    return { success: false, error: formatError(err, 'Kunne ikke analysere marginer') }
  }
}

// =====================================================
// Price Suggestions
// =====================================================

/**
 * Get price suggestions for a product/service.
 */
export async function getProductPriceSuggestions(
  costPrice: number,
  targetMargin: number = 25,
  productId?: string
): Promise<ActionResult<PriceSuggestion[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let historicalPrices: number[] = []

    // Get historical prices from accepted offers
    if (productId) {
      validateUUID(productId, 'productId')

      const { data: history } = await supabase
        .from('offer_line_items')
        .select(`
          unit_price,
          offers!inner (status)
        `)
        .eq('supplier_product_id', productId)
        .eq('offers.status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(20)

      if (history) {
        historicalPrices = history
          .map(h => h.unit_price)
          .filter((p): p is number => p !== null && p > 0)
      }
    }

    const suggestions = suggestPrice(costPrice, targetMargin, historicalPrices)

    return { success: true, data: suggestions }
  } catch (err) {
    logger.error('Price suggestion failed', { error: err, action: 'getProductPriceSuggestions' })
    return { success: false, error: formatError(err, 'Kunne ikke generere prisforslag') }
  }
}

// =====================================================
// Customer Tier Management
// =====================================================

/**
 * Get customer's pricing tier.
 */
export async function getCustomerTier(
  customerId: string
): Promise<ActionResult<{ tier: CustomerTier; config: TierConfig }>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(customerId, 'customerId')

    const { data: customer } = await supabase
      .from('customers')
      .select('metadata')
      .eq('id', customerId)
      .maybeSingle()

    if (!customer) {
      return { success: false, error: 'Kunde ikke fundet' }
    }

    const metadata = customer.metadata as Record<string, unknown> | null
    const tier = (metadata?.pricing_tier as CustomerTier) || 'standard'

    return {
      success: true,
      data: { tier, config: CUSTOMER_TIERS[tier] },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kundetrin') }
  }
}

/**
 * Set customer's pricing tier.
 */
export async function setCustomerTier(
  customerId: string,
  tier: CustomerTier
): Promise<ActionResult<{ tier: CustomerTier }>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(customerId, 'customerId')

    if (!CUSTOMER_TIERS[tier]) {
      return { success: false, error: 'Ugyldigt kundetrin' }
    }

    // Get current metadata
    const { data: customer } = await supabase
      .from('customers')
      .select('metadata')
      .eq('id', customerId)
      .maybeSingle()

    if (!customer) {
      return { success: false, error: 'Kunde ikke fundet' }
    }

    const currentMetadata = (customer.metadata as Record<string, unknown>) || {}
    const updatedMetadata = { ...currentMetadata, pricing_tier: tier }

    const { error } = await supabase
      .from('customers')
      .update({ metadata: updatedMetadata })
      .eq('id', customerId)

    if (error) {
      return { success: false, error: 'Kunne ikke opdatere kundetrin' }
    }

    logger.info('Customer tier updated', {
      action: 'setCustomerTier',
      entityId: customerId,
      metadata: { tier },
    })

    return { success: true, data: { tier } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke sætte kundetrin') }
  }
}

/**
 * Get all available tiers and volume brackets.
 */
export async function getPricingConfig(): Promise<
  ActionResult<{
    tiers: Record<CustomerTier, TierConfig>
    volume_brackets: VolumeBracket[]
  }>
> {
  try {
    await getAuthenticatedClient()

    return {
      success: true,
      data: {
        tiers: { ...CUSTOMER_TIERS },
        volume_brackets: [...DEFAULT_VOLUME_BRACKETS],
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente priskonfiguration') }
  }
}

/**
 * Get volume discount for a quantity.
 */
export async function getVolumeDiscountForQuantity(
  quantity: number
): Promise<ActionResult<{ discount_percent: number; bracket_label: string }>> {
  try {
    await getAuthenticatedClient()

    const result = getVolumeDiscount(quantity)
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke beregne mængderabat') }
  }
}
