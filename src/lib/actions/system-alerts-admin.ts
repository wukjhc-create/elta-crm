'use server'

/**
 * Admin-level system alert creation.
 * Used by portal actions and cron jobs that run without authenticated user context.
 */

import { logger } from '@/lib/utils/logger'
import type { AlertSeverity, AlertType } from '@/types/calculation-intelligence.types'

interface CreateAlertInput {
  alert_type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  details?: Record<string, unknown>
  entity_type?: string
  entity_id?: string
}

export async function createSystemAlertAdmin(input: CreateAlertInput): Promise<boolean> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('system_alerts')
      .insert({
        alert_type: input.alert_type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        details: input.details || {},
        entity_type: input.entity_type || null,
        entity_id: input.entity_id || null,
      })

    if (error) {
      logger.error('Failed to create system alert (admin)', { error, metadata: { alert_type: input.alert_type } })
      return false
    }
    return true
  } catch (err) {
    logger.error('Unexpected error in createSystemAlertAdmin', { error: err })
    return false
  }
}
