/**
 * Material Catalog (Phase 4)
 *
 * Domain layer ON TOP of supplier_products. Each material defines
 * a logical item (panel/inverter/cable/etc) with default unit, default
 * quantity and offer section. Materials may pre-bind to a specific
 * supplier_product_id; otherwise they're resolved at draft-time via
 * search_terms / name fallback against supplier_products.
 *
 * Does NOT replace `supplier_products`, `kalkia_variant_materials`,
 * or any of the existing supplier engine — pure additive layer.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { getBestSupplierPrice, type BestSupplierPrice } from '@/lib/services/supplier-best-price'

export type StarterJobType =
  | 'solar'
  | 'service'
  | 'installation'
  | 'project'
  | 'general'

export interface MaterialRow {
  id: string
  slug: string | null
  name: string
  category: string
  section: string
  default_unit: string
  default_quantity: number
  search_terms: string[]
  supplier_product_id: string | null
  is_active: boolean
}

export interface ResolvedMaterial {
  material: MaterialRow
  supplier: BestSupplierPrice | null
  /** True when the supplier was resolved via the material's pre-bound FK. */
  fromBinding: boolean
}

// =====================================================
// Job-type → categories
// =====================================================

const CATEGORIES_BY_JOBTYPE: Record<StarterJobType, string[]> = {
  solar:        ['solar', 'inverter', 'mounting', 'cable'],
  installation: ['panel', 'breaker', 'rcd', 'cable'],
  project:      ['panel', 'breaker', 'cable'],
  service:      ['service'],
  general:      [],
}

export function categoriesForJobType(jobType: string | null | undefined): string[] {
  const key = (jobType as StarterJobType) in CATEGORIES_BY_JOBTYPE
    ? (jobType as StarterJobType)
    : 'general'
  return CATEGORIES_BY_JOBTYPE[key]
}

// =====================================================
// Lookups
// =====================================================

export async function findMaterialsByCategories(categories: string[]): Promise<MaterialRow[]> {
  if (categories.length === 0) return []
  const supabase = createAdminClient()
  try {
    const { data, error } = await supabase
      .from('materials')
      .select('id, slug, name, category, section, default_unit, default_quantity, search_terms, supplier_product_id, is_active')
      .in('category', categories)
      .eq('is_active', true)
      .order('category', { ascending: true })
    if (error) {
      logger.warn('findMaterialsByCategories failed', { metadata: { categories }, error })
      return []
    }
    return (data || []) as MaterialRow[]
  } catch (err) {
    logger.warn('findMaterialsByCategories threw', { error: err })
    return []
  }
}

export async function findMaterialByName(query: string): Promise<MaterialRow | null> {
  const trimmed = (query || '').trim()
  if (!trimmed) return null
  const supabase = createAdminClient()
  try {
    const safe = trimmed.replace(/[%,()]/g, ' ')
    const { data } = await supabase
      .from('materials')
      .select('id, slug, name, category, section, default_unit, default_quantity, search_terms, supplier_product_id, is_active')
      .ilike('name', `%${safe}%`)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    return (data as MaterialRow | null) ?? null
  } catch (err) {
    logger.warn('findMaterialByName threw', { error: err })
    return null
  }
}

// =====================================================
// Resolve material → supplier_product
// =====================================================

/**
 * Resolves a material to a concrete supplier price.
 *  1. If `material.supplier_product_id` is set, use it (cheap fast path).
 *  2. Otherwise try each entry in `material.search_terms`, in order.
 *  3. Last resort: search by `material.name`.
 *
 * Returns null when nothing in the local supplier_products mirror matches.
 */
export async function resolveMaterialSupplier(
  material: MaterialRow,
  options: { customerId?: string | null } = {}
): Promise<ResolvedMaterial> {
  const customerId = options.customerId ?? null

  // Fast path — pre-bound supplier product.
  // If a binding is set, we MUST use it (never search). Returns null supplier
  // if the bound row is missing/inactive — caller decides what to do, but we
  // never silently substitute a different product.
  if (material.supplier_product_id) {
    try {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('supplier_products')
        .select(
          'id, supplier_id, supplier_sku, supplier_name, cost_price, list_price, unit, is_available, image_url, suppliers!inner(code, name, is_active)'
        )
        .eq('id', material.supplier_product_id)
        .maybeSingle()

      if (!data) {
        logger.warn('Bound supplier_product not found for material', {
          metadata: { materialId: material.id, supplierProductId: material.supplier_product_id },
        })
        return { material, fromBinding: true, supplier: null }
      }

      const supplierJoin = (data as { suppliers?: { code?: string; name?: string; is_active?: boolean } }).suppliers || {}
      if (supplierJoin.is_active === false) {
        logger.warn('Bound supplier_product belongs to inactive supplier', {
          metadata: { materialId: material.id, supplierProductId: material.supplier_product_id },
        })
        return { material, fromBinding: true, supplier: null }
      }

      let costPrice = Number(data.cost_price ?? 0)
      if (customerId) {
        try {
          const { data: customerPrice } = await createAdminClient().rpc('get_best_price_for_customer', {
            p_customer_id: customerId,
            p_supplier_product_id: data.id,
          })
          if (typeof customerPrice === 'number' && customerPrice > 0) costPrice = customerPrice
        } catch {
          /* fall back silently to raw cost_price */
        }
      }

      return {
        material,
        fromBinding: true,
        supplier: {
          supplier_product_id: data.id,
          supplier_id: data.supplier_id,
          supplier_code: supplierJoin.code ?? null,
          supplier_name_at_creation: supplierJoin.name || data.supplier_name || '',
          supplier_sku: data.supplier_sku,
          product_name: data.supplier_name || '',
          cost_price: costPrice,
          list_price: data.list_price !== null ? Number(data.list_price) : null,
          unit: data.unit ?? null,
          is_available: !!data.is_available,
          image_url: data.image_url ?? null,
        },
      }
    } catch (err) {
      logger.warn('resolveMaterialSupplier binding lookup failed', {
        metadata: { materialId: material.id, supplierProductId: material.supplier_product_id },
        error: err,
      })
      return { material, fromBinding: true, supplier: null }
    }
  }

  // No binding → fallback search (search_terms first, then name)
  const terms = [...(material.search_terms || []), material.name].filter(
    (t) => typeof t === 'string' && t.trim().length >= 2
  )
  for (const term of terms) {
    const hit = await getBestSupplierPrice(term, { customerId })
    if (hit) {
      return { material, fromBinding: false, supplier: hit }
    }
  }

  return { material, fromBinding: false, supplier: null }
}
