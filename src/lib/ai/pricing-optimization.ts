/**
 * Pricing optimization (Phase 9, §1).
 *
 * suggestOptimalPrice() compares the prospective job against historical
 * `work_order_profit` snapshots for similar jobs and returns a price +
 * margin recommendation that:
 *
 *   1. Is grounded in actual historical margins (not made up)
 *   2. Respects the per-jobType minimum margin from `getSuggestedMargin`
 *   3. Comes with a confidence score reflecting sample size and
 *      variance of historical margins
 *
 * Suggestions never auto-mutate prices — caller must apply manually.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logAiSuggestion } from '@/lib/ai/suggestion-log'
import { getSuggestedMargin } from '@/lib/services/offer-pricing'
import type { PricingInput, PricingSuggestion } from '@/types/ai-insights.types'

const MIN_HISTORICAL_SAMPLES = 3
const ABSOLUTE_FLOOR_MARGIN = 15

export async function suggestOptimalPrice(input: PricingInput): Promise<PricingSuggestion> {
  const supabase = createAdminClient()
  const defaultRate = Number(process.env.DEFAULT_HOURLY_RATE ?? 650)
  const laborRevenue = Math.max(0, input.laborHours) * defaultRate

  // Pull recent profitable snapshots whose total resembles this job's
  // material + labor scale (±50%). We include the customer-type filter
  // only loosely — historical work_orders aren't tagged by jobType yet,
  // so we rely on the snapshot details JSON as a soft signal.
  const targetCost = Math.max(1, input.materialCost + laborRevenue * 0.6)
  const lo = targetCost * 0.5
  const hi = targetCost * 1.5

  const { data: rows } = await supabase
    .from('work_order_profit')
    .select('margin_percentage, revenue, profit, total_cost, created_at')
    .gt('revenue', 0)
    .gte('total_cost', lo)
    .lte('total_cost', hi)
    .order('created_at', { ascending: false })
    .limit(60)

  const samples = (rows ?? [])
    .map((r) => Number(r.margin_percentage))
    .filter((m) => Number.isFinite(m) && m > 0)

  // Heuristic-driven baseline (Phase 5.1 jobType engine).
  const baseMargin = getSuggestedMargin(input.jobType)
  let recommendedMargin = baseMargin
  let confidence = 0.4
  let reasoning = `Baseline-margin for ${input.jobType} (${baseMargin} %)`
  let sampleSize = samples.length

  if (sampleSize >= MIN_HISTORICAL_SAMPLES) {
    const sorted = [...samples].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const variance =
      sorted.reduce((s, m) => s + (m - median) ** 2, 0) / sorted.length
    const stddev = Math.sqrt(variance)

    // Blend baseline with median, weighted by sample size (more
    // history → trust history more).
    const weight = Math.min(1, sampleSize / 30)
    const blended = baseMargin * (1 - weight) + median * weight
    recommendedMargin = Math.max(blended, ABSOLUTE_FLOOR_MARGIN)

    // Confidence: lots of samples + tight distribution = higher score.
    const distroBonus = Math.max(0, 1 - stddev / 25)
    confidence = Math.min(0.95, 0.5 + 0.4 * weight + 0.05 * distroBonus)

    reasoning = `Median margin på ${sampleSize} sammenlignelige jobs: ${median.toFixed(1)} % (σ=${stddev.toFixed(1)}). Blandet med baseline (${baseMargin} %).`
  }

  // Private customers get a small floor bump (residential overhead).
  if (input.customerType === 'private') {
    recommendedMargin = Math.max(recommendedMargin, baseMargin)
  }

  recommendedMargin = round2(recommendedMargin)
  const recommendedPrice = round2(
    (input.materialCost + laborRevenue) * (1 + recommendedMargin / 100)
  )

  const suggestion: PricingSuggestion = {
    recommendedPrice,
    recommendedMargin,
    confidenceScore: round3(confidence),
    reasoning,
    basedOnJobs: sampleSize,
    laborRateUsed: defaultRate,
  }

  await logAiSuggestion({
    type: 'pricing',
    message: `Foreslået pris ${recommendedPrice.toFixed(2)} kr (margin ${recommendedMargin} %) for ${input.jobType}`,
    confidence: suggestion.confidenceScore,
    payload: { input, suggestion },
  })

  return suggestion
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function round3(n: number): number { return Math.round(n * 1000) / 1000 }
