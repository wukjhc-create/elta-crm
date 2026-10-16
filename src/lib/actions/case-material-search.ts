'use server'

/**
 * W-3 (pilot-review 2026-10-15): leverandørsøgning i "Tilføj materiale" på sagen — før kun manuel indtastning, så
 * montøren skrev fritekst uden varenr. og kontoret måtte slå prisen op bagefter. Gate: materials.add_to_case (samme som
 * at tilføje). Kost-/salgspris udleveres kun med materials.view.cost_prices (montøren får varenr./navn/enhed; serveren
 * gemmer alligevel 0 for montøren, og kontoret prissætter som før).
 */

import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { userCanViewCase } from '@/lib/auth/case-scope'
import { createAdminClient } from '@/lib/supabase/admin'
import { pgQuote } from '@/lib/validations/postgrest-filter'
import { validateUUID, sanitizeSearchTerm } from '@/lib/validations/common'
import { calculateSalePrice } from '@/lib/logic/pricing'
import { loadDefaultProductMargin } from '@/lib/settings/product-margin'
import { onlyValidAgreements } from '@/lib/pricing/agreement-validity'
import { rankBy, searchWords } from '@/lib/products/search-rank'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'

export interface CaseMaterialProductHit {
  supplier_product_id: string
  sku: string
  name: string
  supplier_name: string
  unit: string
  /** null = ingen kost-ret */
  unit_cost: number | null
  /** null = ingen kost-ret */
  unit_sales_price: number | null
}

/** Navngivet konstant (rls-matrix læser hasPermission-literaler som skrive-gates) */
const PRICE_VISIBILITY_PERMISSION = 'materials.view.cost_prices' as const

export async function searchProductsForCaseMaterialAction(
  caseId: string,
  query: string,
): Promise<ActionResult<CaseMaterialProductHit[]>> {
  try {
    validateUUID(caseId, 'case_id')
    const q = (query ?? '').trim()
    if (q.length < 2) return { success: true, data: [] }

    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('materials.add_to_case')) {
      return { success: false, error: 'Manglende tilladelse: materials.add_to_case' }
    }
    if (!(await userCanViewCase(caseId, { role, userId, supabase }))) {
      return { success: false, error: 'Sagen er ikke tildelt dig' }
    }
    const showPrices = hasPermission(PRICE_VISIBILITY_PERMISSION)

    const admin = createAdminClient()
    const baseQuery = () => admin
      .from('supplier_products')
      .select('id, supplier_id, supplier_sku, supplier_name, cost_price, margin_percentage, unit, ean, suppliers!inner (name, is_active)')
      .eq('suppliers.is_active', true)
      .gt('cost_price', 0)
    let dbQuery = baseQuery()
      .order('cost_price', { ascending: true })
      .limit(100)
    // R-1: præcist varenr./EAN hentes for sig (kan ellers falde uden for de 100 billigste)
    const exactQuery = baseQuery().or(`supplier_sku.eq.${pgQuote(sanitizeSearchTerm(q))},ean.eq.${pgQuote(sanitizeSearchTerm(q))}`).limit(10)
    const words = searchWords(q)
    for (const w of words.length ? words : [q]) {
      const term = pgQuote(`%${sanitizeSearchTerm(w)}%`)
      dbQuery = dbQuery.or(`supplier_sku.ilike.${term},supplier_name.ilike.${term},ean.ilike.${term}`)
    }
    const [mainRes, exactRes] = await Promise.all([dbQuery, exactQuery])
    const error = mainRes.error
    const seenIds = new Set<string>()
    const data = [...(exactRes.data ?? []), ...(mainRes.data ?? [])].filter((r) => (seenIds.has(r.id) ? false : (seenIds.add(r.id), true)))
    if (error) {
      logger.error('searchProductsForCaseMaterialAction failed', { error })
      return { success: false, error: 'Søgningen fejlede' }
    }

    type Row = { id: string; supplier_id: string; supplier_sku: string | null; supplier_name: string | null; cost_price: number | null
      margin_percentage: number | null; unit: string | null; ean: string | null; suppliers: { name: string | null } | { name: string | null }[] | null }
    const rows = rankBy((data ?? []) as unknown as Row[], q, (r) => ({ sku: r.supplier_sku, name: r.supplier_name, ean: r.ean, cost: r.cost_price })).slice(0, 15)

    // Salgspris som i tilbud: kundens gyldige leverandøraftale (rabat/avance), ellers varens/den globale avance
    let agreements = new Map<string, { discount: number; margin: number | null }>()
    let defaultMargin = 0
    if (showPrices && rows.length) {
      defaultMargin = await loadDefaultProductMargin()
      const { data: sc } = await admin.from('service_cases').select('customer_id').eq('id', caseId).maybeSingle()
      const customerId = (sc as { customer_id?: string | null } | null)?.customer_id
      if (customerId) {
        const { data: cp } = await onlyValidAgreements(admin
          .from('customer_supplier_prices')
          .select('supplier_id, discount_percentage, custom_margin_percentage')
          .eq('customer_id', customerId)
          .eq('is_active', true))
        agreements = new Map(((cp ?? []) as Array<{ supplier_id: string; discount_percentage: number | null; custom_margin_percentage: number | null }>)
          .map((a) => [a.supplier_id, { discount: a.discount_percentage || 0, margin: a.custom_margin_percentage }]))
      }
    }

    return {
      success: true,
      data: rows.map((r) => {
        const supplier = Array.isArray(r.suppliers) ? r.suppliers[0] : r.suppliers
        let unit_cost: number | null = null
        let unit_sales_price: number | null = null
        if (showPrices) {
          const a = agreements.get(r.supplier_id)
          const cost = (r.cost_price || 0) * (1 - (a?.discount ?? 0) / 100)
          const margin = a && a.margin !== null ? a.margin : (r.margin_percentage || defaultMargin)
          unit_cost = Math.round(cost * 100) / 100
          unit_sales_price = calculateSalePrice(cost, margin)
        }
        return {
          supplier_product_id: r.id,
          sku: r.supplier_sku ?? '',
          name: r.supplier_name ?? '',
          supplier_name: supplier?.name ?? '',
          unit: r.unit || 'stk',
          unit_cost,
          unit_sales_price,
        }
      }),
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Søgningen fejlede') }
  }
}
