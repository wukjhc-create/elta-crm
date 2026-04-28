/**
 * Email Intelligence — Daily Summary
 *
 * Aggregates email_intelligence_logs over the last 24h, logs to console,
 * and upserts a row into email_intelligence_daily_summary.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

export interface DailySummary {
  date: string
  total_processed: number
  customers_created: number
  customers_matched: number
  newsletters_ignored: number
  low_confidence_skipped: number
  other_skipped: number
}

export async function runDailyEmailIntelligenceSummary(targetDate?: Date): Promise<DailySummary> {
  const supabase = createAdminClient()

  const day = targetDate || new Date()
  const dayStr = day.toISOString().substring(0, 10)
  const dayStart = new Date(`${dayStr}T00:00:00.000Z`).toISOString()
  const dayEnd = new Date(new Date(dayStart).getTime() + 24 * 60 * 60 * 1000).toISOString()

  const { data: rows, error } = await supabase
    .from('email_intelligence_logs')
    .select('action, reason, classification')
    .gte('created_at', dayStart)
    .lt('created_at', dayEnd)
    .limit(50000)

  if (error) {
    logger.error('Failed to load email_intelligence_logs for daily summary', { error })
    throw error
  }

  const summary: DailySummary = {
    date: dayStr,
    total_processed: rows?.length || 0,
    customers_created: 0,
    customers_matched: 0,
    newsletters_ignored: 0,
    low_confidence_skipped: 0,
    other_skipped: 0,
  }

  for (const r of rows || []) {
    if (r.action === 'created') summary.customers_created++
    else if (r.action === 'matched') summary.customers_matched++
    else if (r.action === 'ignored' && r.classification === 'newsletter') summary.newsletters_ignored++
    else if (r.action === 'skipped' && typeof r.reason === 'string' && r.reason.startsWith('Low confidence')) {
      summary.low_confidence_skipped++
    } else if (r.action === 'skipped') {
      summary.other_skipped++
    }
  }

  console.log('EMAIL INTELLIGENCE DAILY SUMMARY:', summary)

  // -------- Alerting --------
  const LOW_CONFIDENCE_THRESHOLD = 10
  if (summary.low_confidence_skipped > LOW_CONFIDENCE_THRESHOLD) {
    console.warn('HIGH LOW-CONFIDENCE RATE', {
      date: summary.date,
      low_confidence_skipped: summary.low_confidence_skipped,
      threshold: LOW_CONFIDENCE_THRESHOLD,
    })
  }

  // Spike detection: compare against the average of the previous 7 days.
  const sinceForBaseline = new Date(new Date(dayStart).getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .substring(0, 10)
  const { data: baseline } = await supabase
    .from('email_intelligence_daily_summary')
    .select('summary_date, customers_created')
    .lt('summary_date', summary.date)
    .gte('summary_date', sinceForBaseline)
    .order('summary_date', { ascending: false })
    .limit(7)

  const baselineRows = baseline || []
  const baselineAvg =
    baselineRows.length > 0
      ? baselineRows.reduce((s, r) => s + (r.customers_created || 0), 0) / baselineRows.length
      : 0
  const spikeFloor = 5 // ignore tiny baselines (e.g. 0 → 1 isn't a spike)
  const isSpike =
    summary.customers_created >= spikeFloor &&
    summary.customers_created > Math.max(spikeFloor * 2, baselineAvg * 2)

  if (isSpike) {
    console.warn('UNUSUAL CUSTOMER CREATION RATE', {
      date: summary.date,
      customers_created: summary.customers_created,
      baseline_avg_7d: Number(baselineAvg.toFixed(2)),
    })
  }

  const { error: upsertError } = await supabase
    .from('email_intelligence_daily_summary')
    .upsert(
      {
        summary_date: summary.date,
        total_processed: summary.total_processed,
        customers_created: summary.customers_created,
        customers_matched: summary.customers_matched,
        newsletters_ignored: summary.newsletters_ignored,
        low_confidence_skipped: summary.low_confidence_skipped,
        other_skipped: summary.other_skipped,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'summary_date' }
    )

  if (upsertError) {
    logger.error('Failed to upsert daily summary row', { error: upsertError })
    throw upsertError
  }

  logger.info('Daily email intelligence summary stored', { metadata: { ...summary } })
  return summary
}
