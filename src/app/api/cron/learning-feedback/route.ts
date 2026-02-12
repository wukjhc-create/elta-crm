/**
 * Cron Job: Learning Feedback Collection
 *
 * Runs daily to:
 * 1. Collect feedback from completed projects (actual_hours → calculation_feedback)
 * 2. Optionally run auto-calibration for high-confidence adjustments
 *
 * Triggered by Vercel Cron at 4 AM Copenhagen time.
 */

import { NextResponse } from 'next/server'
import { collectFeedbackFromProjects, autoCalibrate } from '@/lib/ai/learningEngine'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  try {
    // Verify cron secret - fail-secure when not configured
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const startTime = Date.now()

    // Step 1: Collect feedback from completed projects
    const feedbackCreated = await collectFeedbackFromProjects()

    // Step 2: Analyze calibrations (report only, don't auto-apply from cron)
    const suggestedAdjustments = await autoCalibrate()

    const duration = Date.now() - startTime

    logger.info('Learning feedback cron completed', {
      duration,
      metadata: {
        feedback_created: feedbackCreated,
        calibrations_suggested: suggestedAdjustments.length,
      },
    })

    return NextResponse.json({
      message: 'Learning feedback collection completed',
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      feedback_created: feedbackCreated,
      calibrations_suggested: suggestedAdjustments.length,
      suggested_adjustments: suggestedAdjustments.map(a => ({
        component: a.component,
        type: a.type,
        old_value: a.old_value,
        new_value: a.new_value,
        reason: a.reason,
      })),
    })
  } catch (error) {
    logger.error('Learning feedback cron error', { error })
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
