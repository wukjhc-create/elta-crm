/**
 * Revenue forecast (Phase 9, §5).
 *
 *   pipelineValue           = sum of (final_amount − tax_amount) on SENT offers
 *                             ['sent','viewed'], is_proposal = false
 *   conversionRate          = accepted / (accepted + rejected) over the
 *                             trailing 90 days; 0.4 fallback when there's
 *                             no signal yet
 *   recentlyAccepted        = sum of final_amount accepted in the last
 *                             `days` window
 *   expectedRevenue (DKK)   = recentlyAccepted * (horizon / 30)
 *                             + pipelineValue * conversionRate * (horizon / 30)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logAiSuggestion } from '@/lib/ai/suggestion-log'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import type { RevenueForecast } from '@/types/ai-insights.types'

export async function forecastRevenue(days = 30): Promise<RevenueForecast> {
  const supabase = createAdminClient()
  const horizon = Math.max(1, Math.min(365, days))
  const nowIso = new Date().toISOString()
  const sinceWindowIso = new Date(Date.now() - horizon * 24 * 60 * 60 * 1000).toISOString()
  const since90Iso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  // Rapport-review 2026-10-09 (#4): kun SENDTE tilbud (ikke kladder/AI-forslag, is_proposal), alle rækker (PostgREST
  // giver højst 1.000), og beløb ekskl. moms (final − tax) som salgstragten
  type OfferAmt = { final_amount: number | string | null; tax_amount: number | string | null }
  const exVat = (rows: OfferAmt[]) => sum(rows.map((o) => Number(o.final_amount ?? 0) - Number(o.tax_amount ?? 0)))
  const [pipeline, recentAccepted, conv] = await Promise.all([
    fetchAllRows<OfferAmt>((f, t) =>
      supabase.from('offers').select('id, final_amount, tax_amount')
        .in('status', ['sent', 'viewed']).eq('is_proposal', false).order('id').range(f, t)
    ).then(exVat),
    fetchAllRows<OfferAmt>((f, t) =>
      supabase.from('offers').select('id, final_amount, tax_amount')
        .eq('status', 'accepted').eq('is_proposal', false).gte('accepted_at', sinceWindowIso).order('id').range(f, t)
    ).then(exVat),
    fetchAllRows<{ status: string }>((f, t) =>
      supabase.from('offers').select('id, status')
        .in('status', ['accepted', 'rejected']).eq('is_proposal', false).gte('updated_at', since90Iso).order('id').range(f, t)
    ).then((rows) => {
      const accepted = rows.filter((x) => x.status === 'accepted').length
      const rejected = rows.filter((x) => x.status === 'rejected').length
      const denom = accepted + rejected
      return denom > 0 ? accepted / denom : 0.4
    }),
  ])

  const expected =
    recentAccepted * (horizon / 30) +
    pipeline * conv * (horizon / 30)

  const forecast: RevenueForecast = {
    horizonDays: horizon,
    expectedRevenue: round2(expected),
    pipelineValue: round2(pipeline),
    conversionRate: round3(conv),
    recentlyAccepted: round2(recentAccepted),
    asOf: nowIso,
  }

  await logAiSuggestion({
    type: 'forecast',
    confidence: 0.6,
    message: `Forventet omsætning næste ${horizon} dage: ${forecast.expectedRevenue.toFixed(0)} kr (pipeline ${forecast.pipelineValue.toFixed(0)} × ${(conv * 100).toFixed(0)} % konvertering)`,
    payload: forecast as unknown as Record<string, unknown>,
  })

  return forecast
}

function sum(arr: (number | null | undefined)[] | undefined): number {
  if (!arr) return 0
  return arr.reduce<number>((s, v) => s + (Number(v) || 0), 0)
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function round3(n: number): number { return Math.round(n * 1000) / 1000 }
