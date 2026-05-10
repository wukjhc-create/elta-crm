/**
 * Cron Job: Auto-tasks for unanswered customer emails
 *
 * Sprint 8E-1B
 * - Finds customer mail threads with no response in 24+ hours.
 * - Creates one customer_task per conversation (DB-level dedup via
 *   unique partial indexes on (auto_rule, source_conversation_id) and
 *   (auto_rule, source_email_id) when conversation_id is missing).
 * - Auto-closes existing auto-tasks where the conversation no longer
 *   requires a response.
 * - Ignored/noise mails are excluded by getRequiresResponseEmailIds.
 *
 * Schedule: every 4 hours (configurable in vercel.json).
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import {
  createAutoTasksForUnansweredEmails,
  autoCloseRespondedTasks,
} from '@/lib/actions/auto-tasks'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  const startedAt = Date.now()

  // Auth: timingSafeEqual + fail-secure when secret missing
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

  try {
    // Step 1: close tasks where the conversation has been answered
    const closedCount = await autoCloseRespondedTasks()

    // Step 2: create new auto-tasks for unanswered conversations
    const result = await createAutoTasksForUnansweredEmails()
    result.tasks_auto_closed = closedCount
    result.duration_ms = Date.now() - startedAt

    logger.info('Unanswered-mails cron completed', {
      duration: result.duration_ms,
      metadata: {
        checked: result.checked,
        tasks_created: result.tasks_created,
        tasks_auto_closed: result.tasks_auto_closed,
        skipped_existing: result.skipped_existing,
        skipped_too_recent: result.skipped_too_recent,
        unassigned_count: result.unassigned_count,
        errors_count: result.errors.length,
      },
    })

    return NextResponse.json({
      message: 'Unanswered-mails check completed',
      timestamp: new Date().toISOString(),
      ...result,
    })
  } catch (err) {
    logger.error('Unanswered-mails cron error', { error: err })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
