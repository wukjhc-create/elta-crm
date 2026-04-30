/**
 * Revenue forecast (Phase 9, §5).
 *
 *   pipelineValue           = sum of final_amount on offers in
 *                             ['draft','sent','viewed']
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
import type { RevenueForecast } from '@/types/ai-insights.types'

export async function forecastRevenue(days = 30): Promise<RevenueForecast> {
  const supabase = createAdminClient()
  const horizon = Math.max(1, Math.min(365, days))
  const nowIso = new Date().toISOString()
  const sinceWindowIso = new Date(Date.now() - horizon * 24 * 60 * 60 * 1000).toISOString()
  const since90Iso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [pipeline, recentAccepted, conv] = await Promise.all([
    supabase
      .from('offers')
      .select('final_amount')
      .in('status', ['draft', 'sent', 'viewed'])
      .then((r) => sum(r.data?.map((o) => Number(o.final_amount)))),
    supabase
      .from('offers')
      .select('final_amount')
      .eq('status', 'accepted')
      .gte('accepted_at', sinceWindowIso)
      .then((r) => sum(r.data?.map((o) => Number(o.final_amount)))),
    supabase
      .from('offers')
      .select('status')
      .in('status', ['accepted', 'rejected'])
      .gte('updated_at', since90Iso)
      .then((r) => {
        const rows = r.data ?? []
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
