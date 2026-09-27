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
import { timingSafeEqual } from 'crypto'
import { collectFeedbackFromProjects, autoCalibrate } from '@/lib/ai/learningEngine'
import { logger } from '@/lib/utils/logger'
import { withCronRun } from '@/lib/services/cron-run'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

async function handleCron(request: Request): Promise<Response> {
  try {
    // Verify cron secret - fail-secure when not configured
    const authHeader = request.headers.get('authorization')
    const expected = `Bearer ${CRON_SECRET}`
    if (
      !CRON_SECRET ||
      !authHeader ||
      authHeader.length !== expected.length ||
      !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
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
    })
  } catch (error) {
    logger.error('Learning feedback cron error', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// P1 #9: hver autoriseret koersel registreres i system_health_log (service='cron').
export const GET = withCronRun('learning-feedback', handleCron)
