/**
 * GET /api/email-intelligence/stats
 *
 * Returns aggregate counts from email_intelligence_logs.
 * Optional ?days=N (default 7) to scope the window.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const days = Math.min(parseInt(url.searchParams.get('days') || '7', 10) || 7, 90)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const supabase = createAdminClient()

    const [total, created, matched, lowConfidence, newslettersIgnored, suppliersParsed, byDay] = await Promise.all([
      supabase
        .from('email_intelligence_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since),
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
        .ilike('reason', 'Low confidence%')
        .gte('created_at', since),
      supabase
        .from('email_intelligence_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'ignored')
        .eq('classification', 'newsletter')
        .gte('created_at', since),
      supabase
        .from('email_intelligence_logs')
        .select('id', { count: 'exact', head: true })
        .eq('classification', 'supplier')
        .gte('created_at', since),
      supabase
        .from('email_intelligence_daily_summary')
        .select('*')
        .gte('summary_date', since.substring(0, 10))
        .order('summary_date', { ascending: false })
        .limit(days),
    ])

    return NextResponse.json({
      window_days: days,
      since,
      counts: {
        total: total.count || 0,
        customers_created: created.count || 0,
        customers_matched: matched.count || 0,
        low_confidence_skipped: lowConfidence.count || 0,
        newsletters_ignored: newslettersIgnored.count || 0,
        suppliers_parsed: suppliersParsed.count || 0,
      },
      daily_summaries: byDay.data || [],
    })
  } catch (error) {
    logger.error('email-intelligence stats failed', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
