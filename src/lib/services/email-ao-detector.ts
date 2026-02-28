/**
 * AO Product Touchpoint Detection
 *
 * Scans email body and subject for AO product numbers (varenumre).
 * When found, looks up current price and suggests Kalkia price updates.
 *
 * Integrates with existing ao-importer.ts via AOImporter.normalizeSku().
 */

import { createClient } from '@/lib/supabase/server'
import { AOImporter } from '@/lib/services/importers/ao-importer'
import { logger } from '@/lib/utils/logger'
import type { AOProductMatch } from '@/types/mail-bridge.types'

// =====================================================
// AO Product Number Patterns
// =====================================================

/**
 * AO SKU patterns found in emails.
 *
 * AO varenumre are typically:
 * - 5-8 digit numbers (e.g., 1234567)
 * - Prefixed with AO- (e.g., AO-1234567)
 * - Sometimes with dots/dashes (e.g., 123.456.7)
 *
 * We also detect common contexts like:
 * - "Varenr. 1234567" / "Varenr: 1234567"
 * - "Art.nr. 1234567"
 * - "AO 1234567"
 * - Price lists with SKU columns
 */
const AO_SKU_PATTERNS = [
  // "Varenr." / "Varenr:" / "Varenummer" followed by number
  /(?:varenr\.?|varenummer|art\.?\s*nr\.?|produkt\s*nr\.?)\s*[:.]?\s*(\d[\d.\-]{3,10}\d)/gi,
  // "AO-XXXXX" or "AO XXXXX" prefix
  /\bAO[\s\-](\d[\d.\-]{3,10}\d)\b/gi,
  // Standalone 6-8 digit numbers that look like SKUs (only when near price context)
  /(?:pris|kr\.?|DKK|stk\.?|enhed)\s*.*?\b(\d{6,8})\b/gi,
  /\b(\d{6,8})\b\s*.*?(?:pris|kr\.?|DKK|stk\.?|enhed)/gi,
]

/**
 * Extract potential AO product numbers from text.
 * Returns deduplicated list of normalized SKUs.
 */
export function extractAOSkus(text: string): string[] {
  const found = new Set<string>()

  for (const pattern of AO_SKU_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0

    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1]
      if (raw) {
        // Normalize: remove dots/dashes, strip leading zeros
        const normalized = AOImporter.normalizeSku(raw.replace(/[.\-\s]/g, ''))
        if (normalized.length >= 4 && normalized.length <= 10) {
          found.add(normalized)
        }
      }
    }
  }

  return Array.from(found)
}

/**
 * Strip HTML for plain text search
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// =====================================================
// Database lookup
// =====================================================

/**
 * Look up detected SKUs against supplier_products to confirm they are real AO products.
 * Returns matches with current price info.
 */
export async function lookupAOProducts(
  skus: string[]
): Promise<AOProductMatch[]> {
  if (skus.length === 0) return []

  const supabase = await createClient()

  // Query supplier_products for AO supplier
  const { data: aoSupplier } = await supabase
    .from('suppliers')
    .select('id')
    .eq('code', 'AO')
    .eq('is_active', true)
    .maybeSingle()

  if (!aoSupplier) {
    logger.warn('AO supplier not found in database')
    return []
  }

  // Search for all SKUs in one query
  const { data: products } = await supabase
    .from('supplier_products')
    .select('id, supplier_sku, supplier_name, cost_price')
    .eq('supplier_id', aoSupplier.id)
    .in('supplier_sku', skus)

  if (!products || products.length === 0) return []

  return products.map((p) => ({
    sku: p.supplier_sku,
    name: p.supplier_name,
    found_in: 'body' as const, // will be refined by caller
    current_price: p.cost_price,
    supplier_product_id: p.id,
  }))
}

// =====================================================
// Full detection pipeline
// =====================================================

/**
 * Scan an email for AO product references and return confirmed matches.
 */
export async function detectAOProducts(
  emailId: string,
  subject: string,
  bodyHtml: string | null,
  bodyText: string | null
): Promise<AOProductMatch[]> {
  const allMatches: AOProductMatch[] = []

  // 1. Scan subject
  const subjectSkus = extractAOSkus(subject)

  // 2. Scan body
  const plainBody = bodyText || stripHtml(bodyHtml || '')
  const bodySkus = extractAOSkus(plainBody)

  // 3. Deduplicate
  const allSkus = Array.from(new Set([...subjectSkus, ...bodySkus]))

  if (allSkus.length === 0) return []

  // 4. Look up against database
  const confirmedProducts = await lookupAOProducts(allSkus)

  // 5. Tag where they were found
  for (const product of confirmedProducts) {
    const inSubject = subjectSkus.includes(product.sku)
    allMatches.push({
      ...product,
      found_in: inSubject ? 'subject' : 'body',
    })
  }

  // 6. Update the email record
  if (allMatches.length > 0) {
    const supabase = await createClient()
    const { error } = await supabase
      .from('incoming_emails')
      .update({
        ao_product_matches: allMatches,
        has_ao_matches: true,
      })
      .eq('id', emailId)

    if (error) {
      logger.error('Failed to update AO matches on email', {
        entity: 'incoming_emails',
        entityId: emailId,
        error,
      })
    }

    logger.info('AO products detected in email', {
      entity: 'incoming_emails',
      entityId: emailId,
      metadata: {
        matchCount: allMatches.length,
        skus: allMatches.map((m) => m.sku),
      },
    })
  }

  return allMatches
}

// =====================================================
// Kalkia price update suggestion
// =====================================================

export interface KalkiaPriceUpdateSuggestion {
  sku: string
  productName: string | null
  currentSupplierPrice: number | null
  kalkiaPrice: number | null
  priceDifference: number | null
  supplierProductId: string | null
  materialId: string | null
  autoUpdated: boolean
}

/**
 * Check if any detected AO product has a price change
 * compared to what's currently used in active Kalkia calculations.
 * Returns products where a price update is recommended.
 */
export async function getKalkiaPriceUpdateSuggestions(
  matches: AOProductMatch[]
): Promise<KalkiaPriceUpdateSuggestion[]> {
  if (matches.length === 0) return []

  const supabase = await createClient()
  const suggestions: KalkiaPriceUpdateSuggestion[] = []

  // Get supplier_product_ids that are referenced in kalkia_variant_materials
  const supplierProductIds = matches
    .map((m) => m.supplier_product_id)
    .filter((id): id is string => id !== null)

  if (supplierProductIds.length === 0) return []

  const { data: materials } = await supabase
    .from('kalkia_variant_materials')
    .select('id, supplier_product_id, cost_price, sale_price, material_name, auto_update_price')
    .in('supplier_product_id', supplierProductIds)

  if (!materials || materials.length === 0) return []

  for (const material of materials) {
    const match = matches.find((m) => m.supplier_product_id === material.supplier_product_id)
    if (!match) continue

    const supplierPrice = match.current_price
    const kalkiaPrice = material.cost_price

    // Flag if prices differ
    if (supplierPrice !== null && kalkiaPrice !== null && supplierPrice !== kalkiaPrice) {
      suggestions.push({
        sku: match.sku,
        productName: material.material_name || match.name,
        currentSupplierPrice: supplierPrice,
        kalkiaPrice,
        priceDifference: supplierPrice - kalkiaPrice,
        supplierProductId: match.supplier_product_id,
        materialId: material.id,
        autoUpdated: false,
      })
    }
  }

  return suggestions
}

// =====================================================
// Auto-apply Kalkia price updates
// =====================================================

/**
 * Automatically update Kalkia material prices when AO price differences
 * are detected in incoming emails.
 *
 * Only updates materials that have `auto_update_price = true`.
 * Records price changes in price_history for audit trail.
 * Returns the list of suggestions with autoUpdated flag set.
 */
export async function applyKalkiaPriceUpdates(
  matches: AOProductMatch[]
): Promise<{
  suggestions: KalkiaPriceUpdateSuggestion[]
  autoUpdatedCount: number
  manualReviewCount: number
}> {
  const suggestions = await getKalkiaPriceUpdateSuggestions(matches)

  if (suggestions.length === 0) {
    return { suggestions, autoUpdatedCount: 0, manualReviewCount: 0 }
  }

  const supabase = await createClient()
  let autoUpdatedCount = 0
  let manualReviewCount = 0

  // Get supplier product IDs for auto-update eligible materials
  const supplierProductIds = suggestions
    .map((s) => s.supplierProductId)
    .filter((id): id is string => id !== null)

  // Fetch materials with auto_update_price flag
  const { data: materials } = await supabase
    .from('kalkia_variant_materials')
    .select('id, supplier_product_id, cost_price, auto_update_price')
    .in('supplier_product_id', supplierProductIds)

  const autoUpdateMap = new Map(
    (materials || []).map((m) => [m.supplier_product_id, m])
  )

  for (const suggestion of suggestions) {
    if (!suggestion.supplierProductId || suggestion.currentSupplierPrice === null) {
      manualReviewCount++
      continue
    }

    const material = autoUpdateMap.get(suggestion.supplierProductId)
    if (!material || !material.auto_update_price) {
      manualReviewCount++
      continue
    }

    // Auto-update the material cost_price
    const { error: updateError } = await supabase
      .from('kalkia_variant_materials')
      .update({ cost_price: suggestion.currentSupplierPrice })
      .eq('id', material.id)

    if (updateError) {
      logger.error('Failed to auto-update Kalkia material price', {
        entity: 'kalkia_variant_materials',
        entityId: material.id,
        error: updateError,
      })
      manualReviewCount++
      continue
    }

    // Record price change in price_history
    const changePercent = material.cost_price && material.cost_price > 0
      ? ((suggestion.currentSupplierPrice - material.cost_price) / material.cost_price) * 100
      : 0

    const { error: historyError } = await supabase.from('price_history').insert({
      supplier_product_id: suggestion.supplierProductId,
      old_cost_price: material.cost_price,
      new_cost_price: suggestion.currentSupplierPrice,
      change_percentage: Math.round(changePercent * 100) / 100,
      change_source: 'email_detection',
    })

    if (historyError) {
      // Non-critical: log but don't fail
      logger.warn('Could not record price change in price_history', {
        entity: 'price_history',
        metadata: { supplierProductId: suggestion.supplierProductId },
      })
    }

    suggestion.autoUpdated = true
    autoUpdatedCount++

    logger.info('Auto-updated Kalkia material price from email detection', {
      entity: 'kalkia_variant_materials',
      entityId: material.id,
      metadata: {
        sku: suggestion.sku,
        oldPrice: material.cost_price,
        newPrice: suggestion.currentSupplierPrice,
        changePercent: Math.round(changePercent * 100) / 100,
      },
    })
  }

  if (autoUpdatedCount > 0) {
    logger.info('Kalkia price auto-update summary from email', {
      metadata: {
        autoUpdated: autoUpdatedCount,
        manualReview: manualReviewCount,
        totalSuggestions: suggestions.length,
      },
    })
  }

  return { suggestions, autoUpdatedCount, manualReviewCount }
}
