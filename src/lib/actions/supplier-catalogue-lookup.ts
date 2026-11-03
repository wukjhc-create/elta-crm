'use server'

/**
 * Opslag i det kendte grossistkatalog. Ingen leverandørkald og ingen ordre.
 * Kost læses kun med materials.view.cost_prices, og kun kolonnerne id + cost_price.
 * En manglende pris er null — aldrig 0.
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { permissionDeniedText } from '@/lib/auth/permission-text'
import { escapeLike, pgQuote } from '@/lib/validations/postgrest-filter'
import { classifyCatalogueQuery, lookupKnownProducts, presentPurchasePrice } from '@/lib/suppliers/product-lookup'
import type { SupplierProductRef } from '@/lib/pricing/supplier-compare'

const PUBLIC_COLUMNS = 'id, supplier_id, supplier_sku, supplier_name, unit, ean, is_available, last_synced_at'
const PRICE_PERMISSION = 'materials.view.cost_prices' as const

export interface CatalogueHit {
  id: string
  sku: string
  productName: string
  ean: string | null
  unit: string
  supplierName: string | null
  available: boolean
  purchasePrice: number | null
  priceKnown: boolean
  syncedAt: string | null
}

export interface CatalogueLookup {
  ok: boolean
  error?: string
  /** hidden = rollen må ikke se kost. unreadable = kost-læsningen fejlede. */
  priceVisibility: 'hidden' | 'visible' | 'unreadable'
  rows: CatalogueHit[]
  lowestKnownLabel: string | null
  unknownPriceCount: number
}

function empty(error: string, priceVisibility: CatalogueLookup['priceVisibility'] = 'hidden'): CatalogueLookup {
  return { ok: false, error, priceVisibility, rows: [], lowestKnownLabel: null, unknownPriceCount: 0 }
}

export async function findVisibleCaseByNumber(caseNumber: string): Promise<{ state: 'empty' | 'none' | 'one' | 'many' | 'error'; id?: string; label?: string }> {
  const number = caseNumber.trim()
  if (!number) return { state: 'empty' }
  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('materials.add_to_case')) return { state: 'none' }
  const { data, error } = await ctx.supabase.from('service_cases').select('id, case_number, title').eq('case_number', number).eq('is_proposal', false).limit(5)
  if (error) return { state: 'error' }
  const rows = (data ?? []) as Array<{ id: string; case_number: string | null; title: string | null }>
  if (rows.length === 1) return { state: 'one', id: rows[0].id, label: `${rows[0].case_number ?? number} ${rows[0].title ?? ''}`.trim() }
  if (rows.length > 1) return { state: 'many' }
  return { state: 'none' }
}

export async function searchKnownCatalogue(mode: 'sku' | 'ean' | 'name', raw: string): Promise<CatalogueLookup> {
  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('materials.view')) return empty(permissionDeniedText('materials.view'))
  const showPrice = ctx.hasPermission(PRICE_PERMISSION)
  const query = classifyCatalogueQuery(raw, mode)
  if (!query.ok) {
    return { ok: true, priceVisibility: showPrice ? 'visible' : 'hidden', rows: [], lowestKnownLabel: null, unknownPriceCount: 0, error: query.reason }
  }

  let request = ctx.supabase.from('supplier_products').select(PUBLIC_COLUMNS).limit(query.mode === 'name' ? 25 : 40)
  if (query.mode === 'sku') request = request.ilike('supplier_sku', escapeLike(query.value))
  else if (query.mode === 'name') request = request.ilike('supplier_name', `%${escapeLike(query.value)}%`)
  else {
    const digits = raw.replace(/\D/g, '')
    const variants = [...new Set([query.value, digits].filter((v) => v.length >= 7))]
    request = request.or(variants.map((v) => `ean.ilike.${pgQuote(escapeLike(v))}`).join(','))
  }

  const { data, error } = await request
  if (error) return empty('Kataloget kunne ikke læses. Det betyder ikke, at varen mangler.', showPrice ? 'unreadable' : 'hidden')
  const products = (data ?? []) as Array<{
    id: string
    supplier_id: string
    supplier_sku: string | null
    supplier_name: string | null
    unit: string | null
    ean: string | null
    is_available: boolean | null
    last_synced_at: string | null
  }>
  const supplierIds = [...new Set(products.map((p) => p.supplier_id))]
  let supplierNames = new Map<string, string>()
  let supplierFailed = false
  if (supplierIds.length) {
    const names = await ctx.supabase.from('suppliers').select('id, name').in('id', supplierIds)
    if (names.error) supplierFailed = true
    else supplierNames = new Map(((names.data ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]))
  }

  const prices = new Map<string, number | null>()
  let priceVisibility: CatalogueLookup['priceVisibility'] = showPrice ? 'visible' : 'hidden'
  if (showPrice && products.length) {
    const cost = await createAdminClient().from('supplier_products').select('id, cost_price').in('id', products.map((p) => p.id))
    if (cost.error) priceVisibility = 'unreadable'
    else {
      for (const row of (cost.data ?? []) as Array<{ id: string; cost_price: unknown }>) {
        prices.set(row.id, presentPurchasePrice(row.cost_price))
      }
    }
  }

  const refs: SupplierProductRef[] = products.map((p) => ({
    id: p.id,
    supplierId: p.supplier_id,
    supplierName: supplierNames.get(p.supplier_id) ?? '',
    sku: p.supplier_sku ?? '',
    name: p.supplier_name ?? '',
    ean: p.ean,
    costPrice: priceVisibility === 'visible' ? (prices.get(p.id) ?? null) : null,
  }))
  const compared = lookupKnownProducts(refs, query.mode === 'ean' ? { ean: query.value } : query.mode === 'sku' ? { sku: query.value } : {})
  const rows: CatalogueHit[] = products.map((p) => {
    const price = priceVisibility === 'visible' ? (prices.get(p.id) ?? null) : null
    return {
      id: p.id,
      sku: p.supplier_sku ?? '',
      productName: p.supplier_name ?? 'Uden navn',
      ean: p.ean,
      unit: p.unit || 'stk',
      supplierName: supplierFailed ? null : (supplierNames.get(p.supplier_id) ?? null),
      available: p.is_available !== false,
      purchasePrice: price,
      priceKnown: price != null,
      syncedAt: p.last_synced_at,
    }
  })
  const lowest = priceVisibility === 'visible' ? compared.lowestKnown : null
  const unknownPriceCount = priceVisibility === 'visible' ? rows.filter((r) => !r.priceKnown).length : 0
  return {
    ok: true,
    priceVisibility,
    rows,
    lowestKnownLabel: lowest?.purchasePrice != null ? `${lowest.supplierName || 'Leverandør'} har den laveste kendte pris` : null,
    unknownPriceCount,
    error: supplierFailed ? 'Leverandørnavne kunne ikke læses. Varerne vises alligevel.' : undefined,
  }
}
