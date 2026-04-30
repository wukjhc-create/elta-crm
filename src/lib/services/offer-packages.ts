/**
 * Offer Packages
 *
 * Reusable bundles of materials applied automatically when an offer
 * draft is created and a job type is detected.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { resolveMaterialSupplier, type MaterialRow } from '@/lib/services/material-catalog'
import { type MarginContext } from '@/lib/services/offer-pricing'

export interface PackageItemRow {
  id: string
  package_id: string
  material_id: string
  quantity_multiplier: number
  position: number
  material: MaterialRow
}

export interface PackageRow {
  id: string
  slug: string
  name: string
  job_type: string
  description: string | null
  items: PackageItemRow[]
}

export async function getPackageForJobType(jobType: string | null | undefined): Promise<PackageRow | null> {
  if (!jobType) return null
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('offer_packages')
    .select(
      `id, slug, name, job_type, description, is_active,
       offer_package_items (
         id, package_id, material_id, quantity_multiplier, position,
         materials:material_id (
           id, slug, name, category, section, default_unit, default_quantity,
           search_terms, supplier_product_id, is_active
         )
       )`
    )
    .eq('job_type', jobType)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) logger.warn('getPackageForJobType failed', { metadata: { jobType }, error })
    return null
  }

  const items = ((data as unknown as { offer_package_items?: Array<{
    id: string
    package_id: string
    material_id: string
    quantity_multiplier: number
    position: number
    materials: MaterialRow
  }> }).offer_package_items || [])
    .filter((pi) => pi.materials?.is_active !== false)
    .sort((a, b) => a.position - b.position)
    .map<PackageItemRow>((pi) => ({
      id: pi.id,
      package_id: pi.package_id,
      material_id: pi.material_id,
      quantity_multiplier: Number(pi.quantity_multiplier ?? 1),
      position: pi.position,
      material: pi.materials,
    }))

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    job_type: data.job_type,
    description: data.description ?? null,
    items,
  }
}

export interface ApplyPackageInput {
  offerId: string
  customerId: string | null
  jobType: string | null | undefined
  marginContext: MarginContext
}

export interface ApplyPackageResult {
  packageSlug: string
  added: number
  skipped: number
}

/**
 * Apply the matching package's items to an offer as line items.
 *
 * Production-safe contract:
 *   - Single DB transaction (RPC apply_package_to_offer).
 *   - Batch insert — one round-trip, not N inserts.
 *   - Pricing via calculate_sale_price() + get_effective_margin() — no
 *     hardcoded margin multipliers anywhere on the path.
 *   - All-or-nothing: if any line fails, the whole call rolls back.
 *
 * Returns null if no active package exists for the job type, or if no
 * material in the package could be resolved to a supplier (nothing to
 * insert). Throws on RPC failure so callers see real errors.
 */
export async function applyPackageToOffer(
  input: ApplyPackageInput
): Promise<ApplyPackageResult | null> {
  const pkg = await getPackageForJobType(input.jobType ?? null)
  if (!pkg || pkg.items.length === 0) return null

  const supabase = createAdminClient()

  // Resolve every item to a concrete supplier row in parallel. Items
  // without a supplier match are dropped (skipped).
  const resolvedItems = await Promise.all(
    pkg.items.map(async (item) => {
      const resolved = await resolveMaterialSupplier(item.material, {
        customerId: input.customerId,
      })
      return { item, resolved }
    })
  )

  const lines: Array<{
    material_id: string
    supplier_id: string | null
    supplier_product_id: string | null
    supplier_name: string | null
    category: string | null
    sub_category: string | null
    section: string | null
    description: string
    unit: string
    quantity: number
    cost_price: number
    notes: string
  }> = []
  let skipped = 0

  for (const { item, resolved } of resolvedItems) {
    const material = item.material
    if (!resolved.supplier) {
      skipped++
      continue
    }
    const s = resolved.supplier
    const quantity = Number(material.default_quantity ?? 0) * Number(item.quantity_multiplier ?? 1)
    if (!(quantity > 0)) {
      skipped++
      continue
    }
    lines.push({
      material_id: material.id,
      supplier_id: s.supplier_id ?? null,
      supplier_product_id: s.supplier_product_id ?? null,
      supplier_name: s.supplier_name_at_creation ?? null,
      category: material.category ?? null,
      sub_category: null,
      section: material.section ?? null,
      description: material.name,
      unit: material.default_unit || s.unit || 'stk',
      quantity,
      cost_price: Number(s.cost_price ?? 0),
      notes: `Package: ${pkg.slug} · ${material.slug ?? material.name}${
        resolved.fromBinding ? ' (bundet)' : ' (auto-match)'
      }`,
    })
  }

  if (lines.length === 0) {
    logger.warn('applyPackageToOffer: no resolvable lines', {
      metadata: { packageSlug: pkg.slug, offerId: input.offerId, skipped },
    })
    return { packageSlug: pkg.slug, added: 0, skipped }
  }

  const { data: inserted, error } = await supabase.rpc('apply_package_to_offer', {
    p_offer_id: input.offerId,
    p_package_id: pkg.id,
    p_customer_id: input.customerId,
    p_lines: lines,
  })

  if (error) {
    logger.error('applyPackageToOffer RPC failed', {
      entity: 'offers',
      entityId: input.offerId,
      metadata: { packageSlug: pkg.slug, lineCount: lines.length },
      error,
    })
    throw new Error(`apply_package_to_offer failed: ${error.message}`)
  }

  return { packageSlug: pkg.slug, added: Number(inserted ?? 0), skipped }
}
