'use server'

/**
 * Material → Supplier binding (Phase 4.1) + admin overview (Phase 4.2).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { revalidatePath } from 'next/cache'
import { validateUUID } from '@/lib/validations/common'

export interface BindMaterialResult {
  success: boolean
  error?: string
  bound?: {
    materialSlug: string
    materialId: string
    supplierProductId: string
    supplierSku: string
    supplierName: string
    supplierProductName: string
    matchedOn: string[]
  }
}

/**
 * Bind a material (by slug) to a supplier product (by id).
 *
 * Validates:
 *   - material exists and is active
 *   - supplier_product exists and is active
 *   - category match (at least one of material.[name, ...search_terms] appears
 *     in supplier_product.[supplier_name, category, sub_category])
 *
 * Pass `{ force: true }` to skip the category check (use sparingly).
 */
export async function bindMaterialToSupplier(
  materialSlug: string,
  supplierProductId: string,
  options: { force?: boolean } = {}
): Promise<BindMaterialResult> {
  if (!materialSlug || typeof materialSlug !== 'string') {
    return { success: false, error: 'materialSlug er påkrævet' }
  }
  try {
    validateUUID(supplierProductId, 'supplier_product_id')
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Ugyldigt supplier_product_id',
    }
  }

  const supabase = createAdminClient()

  // 1. Material lookup
  const { data: material, error: matErr } = await supabase
    .from('materials')
    .select('id, slug, name, category, search_terms, is_active, supplier_product_id')
    .eq('slug', materialSlug)
    .maybeSingle()

  if (matErr || !material) {
    return { success: false, error: `Material "${materialSlug}" findes ikke` }
  }
  if (!material.is_active) {
    return { success: false, error: `Material "${materialSlug}" er inaktivt` }
  }

  // 2. Supplier product lookup
  const { data: sp, error: spErr } = await supabase
    .from('supplier_products')
    .select(
      'id, supplier_id, supplier_sku, supplier_name, category, sub_category, is_available, suppliers!inner(name, is_active)'
    )
    .eq('id', supplierProductId)
    .maybeSingle()

  if (spErr || !sp) {
    return { success: false, error: 'supplier_product findes ikke' }
  }
  const supplierMeta = (sp as { suppliers?: { name?: string; is_active?: boolean } }).suppliers || {}
  if (supplierMeta.is_active === false) {
    return { success: false, error: 'Leverandøren er inaktiv' }
  }

  // 3. Category match (unless forced)
  const haystack = [
    sp.supplier_name || '',
    sp.category || '',
    sp.sub_category || '',
  ]
    .join(' ')
    .toLowerCase()
  const needles = [material.name, material.category, ...(material.search_terms || [])]
    .filter((t) => typeof t === 'string' && t.trim().length >= 2)
    .map((t) => t.toLowerCase())
  const matchedOn = needles.filter((n) => haystack.includes(n))

  if (matchedOn.length === 0 && !options.force) {
    return {
      success: false,
      error:
        'Kategori-match fejlede: ingen af material.name/category/search_terms findes i ' +
        'supplier_product.{supplier_name, category, sub_category}. Brug force=true for at overstyre.',
    }
  }

  // 4. Bind (set FK)
  const { error: updErr } = await supabase
    .from('materials')
    .update({
      supplier_product_id: supplierProductId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', material.id)

  if (updErr) {
    logger.error('bindMaterialToSupplier update failed', {
      entity: 'materials',
      entityId: material.id,
      error: updErr,
    })
    return { success: false, error: updErr.message }
  }

  console.log('MATERIAL BOUND:', material.slug, supplierProductId)

  revalidatePath('/dashboard/settings/suppliers')
  revalidatePath('/dashboard/offers')

  return {
    success: true,
    bound: {
      materialSlug: material.slug || materialSlug,
      materialId: material.id,
      supplierProductId,
      supplierSku: sp.supplier_sku,
      supplierName: supplierMeta.name || '',
      supplierProductName: sp.supplier_name || '',
      matchedOn: matchedOn.length > 0 ? matchedOn : ['(forced)'],
    },
  }
}

/**
 * Clear a binding so the material falls back to search-based resolution.
 */
export async function unbindMaterialSupplier(materialSlug: string): Promise<BindMaterialResult> {
  if (!materialSlug) return { success: false, error: 'materialSlug er påkrævet' }
  const supabase = createAdminClient()

  const { data: material } = await supabase
    .from('materials')
    .select('id, slug')
    .eq('slug', materialSlug)
    .maybeSingle()
  if (!material) return { success: false, error: `Material "${materialSlug}" findes ikke` }

  const { error } = await supabase
    .from('materials')
    .update({ supplier_product_id: null, updated_at: new Date().toISOString() })
    .eq('id', material.id)

  if (error) return { success: false, error: error.message }

  console.log('MATERIAL UNBOUND:', material.slug)
  revalidatePath('/dashboard/settings/suppliers')
  revalidatePath('/dashboard/settings/materials')
  return { success: true }
}

// =====================================================
// Phase 4.2 — Admin overview
// =====================================================

export interface MaterialAdminRow {
  id: string
  slug: string | null
  name: string
  category: string
  section: string
  default_unit: string
  default_quantity: number
  search_terms: string[]
  is_active: boolean
  supplier_product_id: string | null
  bound: boolean
  supplier_id: string | null
  supplier_name: string | null
  supplier_code: string | null
  supplier_sku: string | null
  supplier_product_name: string | null
  cost_price: number | null
  is_available: boolean | null
  usage_count: number
}

export interface ListMaterialsOptions {
  category?: string | null
  unboundOnly?: boolean
  search?: string | null
}

export async function listMaterialsForAdmin(
  options: ListMaterialsOptions = {}
): Promise<MaterialAdminRow[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('materials')
    .select(
      `id, slug, name, category, section, default_unit, default_quantity,
       search_terms, is_active, supplier_product_id,
       supplier_products:supplier_product_id (
         id, supplier_id, supplier_sku, supplier_name, cost_price, is_available,
         suppliers:supplier_id ( name, code )
       )`
    )
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (options.category) query = query.eq('category', options.category)
  if (options.unboundOnly) query = query.is('supplier_product_id', null)
  if (options.search && options.search.trim()) {
    const safe = options.search.trim().replace(/[%,()]/g, ' ')
    query = query.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`)
  }

  const { data, error } = await query.limit(500)
  if (error) {
    logger.error('listMaterialsForAdmin failed', { error })
    return []
  }
  if (!data) return []

  // Per-material usage counts via batched HEAD count (one round-trip per row).
  const ids = data.map((r) => r.id)
  const usage = await countOfferLineUsage(ids)

  return data.map((row) => {
    const sp = (row as { supplier_products?: {
      id?: string
      supplier_id?: string
      supplier_sku?: string
      supplier_name?: string
      cost_price?: number
      is_available?: boolean
      suppliers?: { name?: string; code?: string }
    } | null }).supplier_products
    const supplierMeta = sp?.suppliers
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      section: row.section,
      default_unit: row.default_unit,
      default_quantity: Number(row.default_quantity ?? 0),
      search_terms: (row.search_terms as string[]) || [],
      is_active: row.is_active,
      supplier_product_id: row.supplier_product_id ?? null,
      bound: !!row.supplier_product_id,
      supplier_id: sp?.supplier_id ?? null,
      supplier_name: supplierMeta?.name ?? null,
      supplier_code: supplierMeta?.code ?? null,
      supplier_sku: sp?.supplier_sku ?? null,
      supplier_product_name: sp?.supplier_name ?? null,
      cost_price: sp?.cost_price !== undefined && sp?.cost_price !== null ? Number(sp.cost_price) : null,
      is_available: sp?.is_available ?? null,
      usage_count: usage.get(row.id) ?? 0,
    }
  })
}

async function countOfferLineUsage(materialIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (materialIds.length === 0) return out
  const supabase = createAdminClient()

  // Primary path: COUNT(*) grouped by the structured FK material_id.
  // Pull all rows for the requested ids in one round-trip and aggregate in JS.
  try {
    const { data: rows } = await supabase
      .from('offer_line_items')
      .select('material_id')
      .in('material_id', materialIds)
      .limit(50000)
    if (rows) {
      for (const r of rows as Array<{ material_id: string | null }>) {
        if (!r.material_id) continue
        out.set(r.material_id, (out.get(r.material_id) ?? 0) + 1)
      }
    }
  } catch (err) {
    logger.warn('countOfferLineUsage by material_id failed', { error: err })
  }

  // Fallback ONLY for materials that returned 0 — pre-Phase-4.3 rows
  // wrote "Material: <slug>" into notes without a structured FK.
  const zeroMaterialIds = materialIds.filter((id) => !out.get(id))
  if (zeroMaterialIds.length === 0) return out

  const { data: materials } = await supabase
    .from('materials')
    .select('id, slug')
    .in('id', zeroMaterialIds)
  if (!materials) return out

  await Promise.all(
    materials.map(async (m) => {
      if (!m.slug) {
        out.set(m.id, out.get(m.id) ?? 0)
        return
      }
      const { count } = await supabase
        .from('offer_line_items')
        .select('id', { count: 'exact', head: true })
        .is('material_id', null)
        .ilike('notes', `Material: ${m.slug}%`)
      const existing = out.get(m.id) ?? 0
      out.set(m.id, existing + (count ?? 0))
    })
  )

  return out
}

export async function listMaterialCategories(): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('materials')
    .select('category')
    .eq('is_active', true)
    .order('category', { ascending: true })
  if (!data) return []
  return Array.from(new Set(data.map((r) => r.category as string)))
}

export interface SupplierProductPickerRow {
  id: string
  supplier_id: string
  supplier_sku: string
  supplier_name: string
  category: string | null
  sub_category: string | null
  cost_price: number
  is_available: boolean
  supplier_label: string
  supplier_code: string
}

/**
 * Search supplier_products for the admin "bind" dialog.
 * Local-only (no live API). Limit defaults to 25.
 */
export async function searchSupplierProductsForBinding(
  query: string,
  options: { supplierId?: string; limit?: number } = {}
): Promise<SupplierProductPickerRow[]> {
  const trimmed = (query || '').trim()
  if (trimmed.length < 2) return []

  const supabase = createAdminClient()
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100))
  const safe = trimmed.replace(/[%,()]/g, ' ')

  let q = supabase
    .from('supplier_products')
    .select(
      'id, supplier_id, supplier_sku, supplier_name, category, sub_category, cost_price, is_available, suppliers!inner(name, code, is_active)'
    )
    .eq('suppliers.is_active', true)
    .or(`supplier_name.ilike.%${safe}%,supplier_sku.ilike.%${safe}%`)
    .order('cost_price', { ascending: true })
    .limit(limit)

  if (options.supplierId) q = q.eq('supplier_id', options.supplierId)

  const { data, error } = await q
  if (error) {
    logger.warn('searchSupplierProductsForBinding failed', { error })
    return []
  }

  return (data || []).map((r) => {
    const supplierMeta = (r as { suppliers?: { name?: string; code?: string } }).suppliers || {}
    return {
      id: r.id,
      supplier_id: r.supplier_id,
      supplier_sku: r.supplier_sku,
      supplier_name: r.supplier_name,
      category: r.category ?? null,
      sub_category: r.sub_category ?? null,
      cost_price: Number(r.cost_price ?? 0),
      is_available: !!r.is_available,
      supplier_label: supplierMeta.name || '',
      supplier_code: supplierMeta.code || '',
    }
  })
}
