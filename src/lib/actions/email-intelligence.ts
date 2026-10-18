'use server'

/**
 * Email intelligence dashboard server actions.
 */

import { copenhagenParts, copenhagenLocalToIso } from '@/lib/utils/copenhagen-time'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

export interface TodaysIntelligenceCounts {
  customers_created: number
  customers_matched: number
  skipped: number
  newsletters_ignored: number
}

export async function getTodaysIntelligenceCounts(): Promise<TodaysIntelligenceCounts> {
  const supabase = await createClient()
  // DB-9 (dashboard-review 2026-10-18): dansk døgnstart — serveren kører i UTC (før startede "i dag" kl. 01/02)
  const since = copenhagenLocalToIso(copenhagenParts(new Date()).date, '00:00')

  try {
    const [created, matched, skipped, newsletters] = await Promise.all([
      supabase
        .from('email_intelligence_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'created')
        .gte('created_at', since),
      supabase
        .from('email_intelligence_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'matched')
        .gte('created_at', since),
      supabase
        .from('email_intelligence_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'skipped')
        .gte('created_at', since),
      supabase
        .from('email_intelligence_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'ignored')
        .eq('classification', 'newsletter')
        .gte('created_at', since),
    ])

    return {
      customers_created: created.count || 0,
      customers_matched: matched.count || 0,
      skipped: skipped.count || 0,
      newsletters_ignored: newsletters.count || 0,
    }
  } catch (error) {
    logger.error('getTodaysIntelligenceCounts failed', { error })
    return { customers_created: 0, customers_matched: 0, skipped: 0, newsletters_ignored: 0 }
  }
}
