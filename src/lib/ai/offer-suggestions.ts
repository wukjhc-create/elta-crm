/**
 * Smart offer suggestions (Phase 9, §3).
 *
 * Inspects an existing draft offer and returns soft recommendations:
 *   - "price_low": current sale price is below the historical median
 *     for similar jobs.
 *   - "add_material": commonly-included material categories (cable / RCD)
 *     are missing from the offer.
 *   - "upsell": service plan, battery, maintenance not present yet.
 *
 * Suggestions are advisory only — the offer is never modified.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logAiSuggestion } from '@/lib/ai/suggestion-log'
import { suggestOptimalPrice } from '@/lib/ai/pricing-optimization'
import type { OfferImprovement } from '@/types/ai-insights.types'

const COMMON_CATEGORY_ALIASES: Record<string, string[]> = {
  // Solar packages usually need all four
  solar: ['panel', 'inverter', 'mounting', 'cable'],
  installation: ['breaker', 'cable', 'rcd'],
  service: ['service'],
}

const UPSELL_HINTS: Array<{ key: string; label: string; for?: string[] }> = [
  { key: 'service plan', label: 'Servicepakke (årlig)' },
  { key: 'battery',       label: 'Batterilager', for: ['solar'] },
  { key: 'maintenance',   label: 'Vedligeholdelsesaftale' },
]

export async function suggestOfferImprovements(offerId: string): Promise<OfferImprovement[]> {
  const supabase = createAdminClient()
  const out: OfferImprovement[] = []

  const { data: offer } = await supabase
    .from('offers')
    .select('id, title, total_amount, final_amount, customer_id, scope, description')
    .eq('id', offerId)
    .maybeSingle()
  if (!offer) return out

  const { data: lines } = await supabase
    .from('offer_line_items')
    .select('description, quantity, sale_price, unit_price, cost_price, section, material_id')
    .eq('offer_id', offerId)
  const lineList = lines ?? []

  // ---- Job type detection (best-effort) ----
  const text = `${offer.title} ${offer.description ?? ''} ${offer.scope ?? ''}`.toLowerCase()
  let jobType: string = 'general'
  if (/solcell|solar|panel|inverter/.test(text)) jobType = 'solar'
  else if (/service|fejls|defekt|reparation/.test(text)) jobType = 'service'
  else if (/install|tavle|el-installat/.test(text)) jobType = 'installation'

  // ---- 1. price_low check ----
  const materialCost = lineList.reduce(
    (s, l) => s + Number(l.cost_price ?? 0) * Number(l.quantity ?? 0),
    0
  )
  const laborHours = 4   // conservative fallback when no time logs yet
  const totalNow = Number(offer.total_amount) || lineList.reduce(
    (s, l) => s + Number(l.sale_price ?? l.unit_price ?? 0) * Number(l.quantity ?? 0),
    0
  )

  if (materialCost > 0 || lineList.length > 0) {
    try {
      const pricing = await suggestOptimalPrice({
        jobType,
        materialCost,
        laborHours,
      })
      if (pricing.recommendedPrice > totalNow * 1.05 && pricing.confidenceScore > 0.5) {
        const diff = pricing.recommendedPrice - totalNow
        out.push({
          type: 'price_low',
          description: `Tilbud kan optimeres: anbefalet pris ${pricing.recommendedPrice.toFixed(0)} kr (+${diff.toFixed(0)} kr, margin ${pricing.recommendedMargin} %).`,
          payload: { current: totalNow, recommended: pricing.recommendedPrice, margin: pricing.recommendedMargin },
        })
      }
    } catch { /* ignore — pricing is best-effort */ }
  }

  // ---- 2. add_material checks ----
  const haveTokens = lineList
    .map((l) => `${l.description ?? ''}`.toLowerCase())
    .join(' ')
  const expected = COMMON_CATEGORY_ALIASES[jobType] ?? []
  for (const cat of expected) {
    const hit = lineList.some((l) =>
      `${l.description ?? ''} ${l.section ?? ''}`.toLowerCase().includes(cat)
    )
    if (!hit) {
      out.push({
        type: 'add_material',
        description: `Mangler typisk materiale for ${jobType}: ${cat}`,
        payload: { category: cat, jobType },
      })
    }
  }

  // ---- 3. upsell hints ----
  for (const u of UPSELL_HINTS) {
    if (u.for && !u.for.includes(jobType)) continue
    if (haveTokens.includes(u.key)) continue
    out.push({
      type: 'upsell',
      description: `Foreslå upsell: ${u.label}`,
      payload: { upsell: u.key },
    })
  }

  if (out.length > 0) {
    await logAiSuggestion({
      type: 'offer_suggestion',
      entityType: 'offer',
      entityId: offerId,
      confidence: 0.6,
      message: `${out.length} forslag til tilbud (${jobType})`,
      payload: { jobType, suggestions: out },
    })
  }

  return out
}
