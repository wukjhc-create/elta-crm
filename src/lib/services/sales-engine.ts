/**
 * Sales engine (Phase 12).
 *
 * Pulls editable package + option data from the DB and lets the offer
 * builder apply them to a draft offer in one shot:
 *
 *   1. base_price line (description from `standard_text`/name)
 *   2. material lines (existing applyPackageToOffer for the package's BOM)
 *   3. option lines (per ticked option — price + offer_text)
 *   4. text blocks (intro + package description + option summaries +
 *      closing) so the salesperson gets a ready-to-send write-up.
 *
 * Nothing in this module is hardcoded. base_price, options, prices and
 * texts are all DB-driven and admin-editable via /dashboard/settings/packages.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { resolveMaterialSupplier, type MaterialRow } from '@/lib/services/material-catalog'
import { recomputeOfferTotals } from '@/lib/services/offer-pricing'
import type {
  ApplyPackageWithOptionsInput,
  ApplyPackageWithOptionsResult,
  BuildOfferTextInput,
  OfferTextResult,
  PackageOptionRow,
  SalesPackageRow,
  SalesPackageWithOptions,
  SalesTextBlockRow,
} from '@/types/sales-engine.types'

// =====================================================
// Reads
// =====================================================

export async function listActivePackages(): Promise<SalesPackageRow[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('offer_packages')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  return (data ?? []) as SalesPackageRow[]
}

export async function getPackageWithOptions(packageId: string): Promise<SalesPackageWithOptions | null> {
  const supabase = createAdminClient()
  const [{ data: pkg }, { data: opts }] = await Promise.all([
    supabase.from('offer_packages').select('*').eq('id', packageId).maybeSingle(),
    supabase
      .from('package_options')
      .select('*')
      .eq('package_id', packageId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ])
  if (!pkg) return null
  return { ...(pkg as SalesPackageRow), options: (opts ?? []) as PackageOptionRow[] }
}

export async function getTextBlock(slug: string): Promise<SalesTextBlockRow | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('sales_text_blocks')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  return (data as SalesTextBlockRow | null) ?? null
}

// =====================================================
// Text builder
// =====================================================

export async function buildOfferText(input: BuildOfferTextInput): Promise<OfferTextResult> {
  const pkg = await getPackageWithOptions(input.packageId)
  if (!pkg) {
    return {
      intro: '',
      packageDescription: '',
      optionLines: [],
      closing: '',
      full: '',
    }
  }

  const introSlug = input.introBlockSlug ?? 'offer_intro_default'
  const closingSlug = input.closingBlockSlug ?? 'offer_closing_default'
  const [introBlock, closingBlock] = await Promise.all([
    getTextBlock(introSlug),
    getTextBlock(closingSlug),
  ])

  let intro = introBlock?.content ?? ''
  if (input.customerName && intro) {
    intro = intro.replace(/\{customerName\}/g, input.customerName)
  } else if (input.customerName && !intro) {
    intro = `Kære ${input.customerName},`
  }

  const packageDescription = pkg.standard_text || pkg.description || ''

  const selectedOptions = pkg.options.filter((o) => input.optionIds.includes(o.id))
  const optionLines = selectedOptions.map((o) => {
    const text = o.offer_text || o.description || o.name
    return `• ${text}`
  })

  const closing = closingBlock?.content ?? ''

  const sections: string[] = []
  if (intro)              sections.push(intro)
  if (packageDescription) sections.push(packageDescription)
  if (optionLines.length) sections.push(['Valgte tilvalg:', ...optionLines].join('\n'))
  if (closing)            sections.push(closing)

  return {
    intro,
    packageDescription,
    optionLines,
    closing,
    full: sections.join('\n\n'),
  }
}

// =====================================================
// Apply package + options to a draft offer
// =====================================================

export async function applyPackageWithOptionsToOffer(
  input: ApplyPackageWithOptionsInput
): Promise<ApplyPackageWithOptionsResult> {
  const supabase = createAdminClient()
  const pkg = await getPackageWithOptions(input.packageId)
  if (!pkg) throw new Error(`applyPackageWithOptions: package ${input.packageId} not found`)

  const result: ApplyPackageWithOptionsResult = {
    packageId: pkg.id,
    basePriceLineId: null,
    materialLinesAdded: 0,
    materialLinesSkipped: 0,
    optionLinesAdded: 0,
    totalAdded: 0,
  }

  // Determine starting position so we coexist with existing edits.
  const { data: lastLine } = await supabase
    .from('offer_line_items')
    .select('position')
    .eq('offer_id', input.offerId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  let position = (lastLine?.position ?? 0) + 1

  // ---- 1. base price line (sale-side, no cost — that's the BOM below) ----
  if (Number(pkg.base_price) > 0) {
    const { data: ins, error } = await supabase
      .from('offer_line_items')
      .insert({
        offer_id: input.offerId,
        position,
        line_type: 'service',
        section: 'Pakke',
        description: `${pkg.name} (basispris)`,
        quantity: 1,
        unit: 'stk',
        cost_price: 0,
        margin_percentage: 0,
        sale_price: Number(pkg.base_price),
        unit_price: Number(pkg.base_price),
        discount_percentage: 0,
        total: Number(pkg.base_price),
        notes: `Package base: ${pkg.slug}`,
      })
      .select('id')
      .single()
    if (!error && ins) {
      result.basePriceLineId = ins.id
      result.totalAdded++
      position++
    } else if (error) {
      logger.warn('sales-engine: base price insert failed', { metadata: { packageId: pkg.id }, error })
    }
  }

  // ---- 2. material BOM via apply_package_to_offer RPC ----
  // Pulls the package's items and resolves each material to a supplier,
  // then calls the centralised RPC for batch insert + margin pricing.
  try {
    const { data: rawItems } = await supabase
      .from('offer_package_items')
      .select(`
        quantity_multiplier, position,
        materials:material_id (
          id, slug, name, category, section, default_unit, default_quantity,
          search_terms, supplier_product_id, is_active
        )
      `)
      .eq('package_id', pkg.id)
      .order('position', { ascending: true })

    const items = (rawItems ?? [])
      .map((row) => {
        const materialAny = (row as unknown as { materials: MaterialRow | MaterialRow[] }).materials
        const material = Array.isArray(materialAny) ? materialAny[0] : materialAny
        return material ? { material, quantity_multiplier: Number(row.quantity_multiplier ?? 1) } : null
      })
      .filter((x): x is { material: MaterialRow; quantity_multiplier: number } =>
        Boolean(x) && x!.material.is_active !== false
      )

    const lines: Array<Record<string, unknown>> = []
    for (const it of items) {
      const resolved = await resolveMaterialSupplier(it.material, { customerId: input.customerId })
      if (!resolved.supplier) { result.materialLinesSkipped++; continue }
      const s = resolved.supplier
      const quantity = Number(it.material.default_quantity ?? 0) * it.quantity_multiplier
      if (!(quantity > 0)) { result.materialLinesSkipped++; continue }
      lines.push({
        material_id: it.material.id,
        supplier_id: s.supplier_id ?? null,
        supplier_product_id: s.supplier_product_id ?? null,
        supplier_name: s.supplier_name_at_creation ?? null,
        category: it.material.category ?? null,
        sub_category: null,
        section: it.material.section ?? null,
        description: it.material.name,
        unit: it.material.default_unit || s.unit || 'stk',
        quantity,
        cost_price: Number(s.cost_price ?? 0),
        notes: `Package: ${pkg.slug} · ${it.material.slug ?? it.material.name}`,
      })
    }

    if (lines.length > 0) {
      const { data: inserted, error } = await supabase.rpc('apply_package_to_offer', {
        p_offer_id: input.offerId,
        p_package_id: pkg.id,
        p_customer_id: input.customerId,
        p_lines: lines,
      })
      if (error) throw error
      result.materialLinesAdded = Number(inserted ?? 0)
      result.totalAdded += result.materialLinesAdded

      const { data: tail } = await supabase
        .from('offer_line_items')
        .select('position')
        .eq('offer_id', input.offerId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()
      position = (tail?.position ?? position - 1) + 1
    }
  } catch (err) {
    logger.warn('sales-engine: material apply failed (non-critical)', {
      metadata: { packageId: pkg.id }, error: err,
    })
  }

  // ---- 3. option lines ----
  for (const option of pkg.options.filter((o) => input.optionIds.includes(o.id))) {
    try {
      const { error } = await supabase
        .from('offer_line_items')
        .insert({
          offer_id: input.offerId,
          position,
          line_type: 'service',
          section: 'Tilvalg',
          description: option.name,
          quantity: 1,
          unit: 'stk',
          cost_price: 0,
          margin_percentage: 0,
          sale_price: Number(option.price),
          unit_price: Number(option.price),
          discount_percentage: 0,
          total: Number(option.price),
          notes: `Package option: ${option.id}`,
        })
      if (!error) {
        result.optionLinesAdded++
        result.totalAdded++
        position++
      }
    } catch (err) {
      logger.warn('sales-engine: option line insert failed', {
        metadata: { optionId: option.id }, error: err,
      })
    }
  }

  // Recompute offer header totals now that lines have changed.
  await recomputeOfferTotals(input.offerId)

  console.log(
    'SALES ENGINE APPLIED:',
    pkg.slug,
    'base=' + (result.basePriceLineId ? '1' : '0'),
    `mat=${result.materialLinesAdded}`,
    `opt=${result.optionLinesAdded}`
  )
  return result
}
