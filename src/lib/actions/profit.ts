'use server'

/**
 * Lønsomhedsanalyse af et tilbud (Profit Engine i brug). Kun LÆSNING. Kræver offers.view.cost_prices (kostpriser
 * vises) — samme roller som ser DB/kost i tilbudsvisningen (admin, serviceleder, bogholderi).
 * Timekost følger firmaets kostbasis (company_settings.time_cost_basis):
 *   fixed_standard_rate -> time_cost_rate · real_hourly_cost / internal_cost_rate -> gennemsnit over aktive
 *   medarbejdere (aggregeret med service-role; ingen individuelle lønoplysninger forlader serveren).
 */
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { analyzeOfferProfit, type OfferProfitAnalysis } from '@/lib/profit/offer-analysis'
import type { ActionResult } from '@/types/common.types'

export interface OfferProfitResult extends OfferProfitAnalysis {
  hourlyCost: number | null
  hourlyCostSource: string
  minimumDbPct: number | null
  targetDbPct: number | null
}

async function resolveHourlyCost(supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase']): Promise<{ cost: number | null; source: string }> {
  const { data: cs } = await supabase.from('company_settings').select('time_cost_basis, time_cost_rate').maybeSingle()
  const basis = (cs?.time_cost_basis as string | null) ?? 'real_hourly_cost'
  if (basis === 'fixed_standard_rate') {
    const rate = Number(cs?.time_cost_rate ?? 0)
    return rate > 0 ? { cost: rate, source: 'firma-standard' } : { cost: null, source: 'firma-standard ikke sat' }
  }
  // Aggregat over aktive medarbejdere — service-role (employee_compensation er admin-only), kun gennemsnittet returneres.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const col = basis === 'internal_cost_rate' ? 'internal_cost_rate' : 'real_hourly_cost'
  const { data } = await createAdminClient().from('employee_compensation').select(`${col}, employees!inner(active)`).eq('employees.active', true)
  const values = ((data ?? []) as Array<Record<string, unknown>>).map((r) => Number(r[col] ?? 0)).filter((v) => v > 0)
  if (!values.length) return { cost: null, source: basis === 'internal_cost_rate' ? 'intern kostpris ikke sat' : 'reel timekost ikke sat' }
  const avg = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
  return { cost: avg, source: `${basis === 'internal_cost_rate' ? 'intern kostpris' : 'reel timekost'} (gns. af ${values.length} medarbejdere)` }
}

async function settingPct(supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase'], key: string): Promise<number | null> {
  const { data } = await supabase.from('calculation_settings').select('setting_value').eq('setting_key', key).maybeSingle()
  const v = (data?.setting_value as { percentage?: number } | null)?.percentage
  return typeof v === 'number' ? v : null
}

export async function getOfferProfitAnalysis(offerId: string): Promise<ActionResult<OfferProfitResult>> {
  try {
    validateUUID(offerId, 'tilbud-ID')
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('offers.view.cost_prices')) return { success: false, error: 'Manglende tilladelse: offers.view.cost_prices' }
    const { supabase } = ctx

    const { data: offer, error: offerErr } = await supabase.from('offers').select('id, discount_percentage').eq('id', offerId).maybeSingle()
    if (offerErr || !offer) return { success: false, error: 'Tilbud ikke fundet' }
    const { data: items, error: itemsErr } = await supabase.from('offer_line_items')
      .select('description, quantity, unit, total, cost_price, supplier_cost_price_at_creation').eq('offer_id', offerId).order('position')
    if (itemsErr) return { success: false, error: 'Kunne ikke hente tilbudslinjer' }

    const [hourly, minimumDbPct, targetDbPct] = await Promise.all([resolveHourlyCost(supabase), settingPct(supabase, 'minimum_db'), settingPct(supabase, 'default_db_target')])
    const analysis = analyzeOfferProfit({
      lines: (items ?? []).map((i) => ({
        description: String(i.description ?? ''), quantity: Number(i.quantity ?? 0), unit: (i.unit as string | null) ?? null, total: Number(i.total ?? 0),
        unitCost: Number(i.cost_price ?? 0) > 0 ? Number(i.cost_price) : Number(i.supplier_cost_price_at_creation ?? 0) > 0 ? Number(i.supplier_cost_price_at_creation) : null,
      })),
      offerDiscountPct: Number(offer.discount_percentage ?? 0),
      hourlyCost: hourly.cost, minimumDbPct, targetDbPct,
    })
    return { success: true, data: { ...analysis, hourlyCost: hourly.cost, hourlyCostSource: hourly.source, minimumDbPct, targetDbPct } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke beregne lønsomhed') }
  }
}

/**
 * Billigere leverandør pr. tilbudslinje (samme EAN hos en anden grossist). Kun LÆSNING; samme gate som lønsomhed
 * (kostpriser vises). Kun linjer der stammer fra en leverandørvare (supplier_product_id).
 */
export async function getCheaperAlternativesForOffer(offerId: string): Promise<ActionResult<import('@/lib/pricing/supplier-compare').CheaperAlternative[]>> {
  try {
    validateUUID(offerId, 'tilbud-ID')
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('offers.view.cost_prices')) return { success: false, error: 'Manglende tilladelse: offers.view.cost_prices' }
    const { supabase } = ctx
    const { findCheaperAlternatives, normalizeEan } = await import('@/lib/pricing/supplier-compare')

    const { data: items } = await supabase.from('offer_line_items')
      .select('id, description, quantity, supplier_product_id, supplier_cost_price_at_creation, cost_price')
      .eq('offer_id', offerId).not('supplier_product_id', 'is', null)
    const lines = (items ?? []).map((i) => ({ lineId: i.id as string, description: String(i.description ?? ''), quantity: Number(i.quantity ?? 0),
      supplierProductId: i.supplier_product_id as string,
      unitCost: Number(i.supplier_cost_price_at_creation ?? 0) > 0 ? Number(i.supplier_cost_price_at_creation) : Number(i.cost_price ?? 0) > 0 ? Number(i.cost_price) : null }))
    if (!lines.length) return { success: true, data: [] }

    const cols = 'id, supplier_id, supplier_sku, supplier_name, ean, cost_price, supplier:suppliers(name)'
    const toRef = (p: Record<string, unknown>) => ({ id: p.id as string, supplierId: p.supplier_id as string,
      supplierName: ((p.supplier as { name?: string } | null)?.name) ?? '', sku: String(p.supplier_sku ?? ''), name: String(p.supplier_name ?? ''),
      ean: (p.ean as string | null) ?? null, costPrice: p.cost_price != null ? Number(p.cost_price) : null })
    const { data: own } = await supabase.from('supplier_products').select(cols).in('id', [...new Set(lines.map((l) => l.supplierProductId))])
    const eans = [...new Set(((own ?? []) as Array<Record<string, unknown>>).map((p) => normalizeEan(p.ean as string | null)).filter(Boolean) as string[])]
    if (!eans.length) return { success: true, data: [] }
    // EAN-13 og GTIN-14 (foranstillet 0) gemmes forskelligt hos grossisterne -> slå begge former op
    const variants = [...new Set(eans.flatMap((e) => [e, `0${e}`]))]
    const { data: alts } = await supabase.from('supplier_products').select(cols).in('ean', variants).gt('cost_price', 0)
    const products = [...((own ?? []) as Array<Record<string, unknown>>), ...((alts ?? []) as Array<Record<string, unknown>>)].map(toRef)
    return { success: true, data: findCheaperAlternatives(lines, products) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke sammenligne leverandørpriser') }
  }
}
