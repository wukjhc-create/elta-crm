'use server'

/**
 * Sprint Ø2 ERP — medarbejder-revisionsspor (employee_events).
 * logEmployeeEvent() kaldes fra andre (allerede-gated) actions; listen er
 * read-only til medarbejderkortet.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'
import type { EmployeeEvent } from '@/types/employees.types'

export async function logEmployeeEvent(input: {
  employeeId: string
  eventType: string
  title: string
  description?: string | null
  metadata?: Record<string, unknown>
  createdBy?: string | null
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('employee_events').insert({
      employee_id: input.employeeId,
      event_type: input.eventType,
      title: input.title,
      description: input.description ?? null,
      metadata: input.metadata ?? {},
      created_by: input.createdBy ?? null,
    })
  } catch (e) {
    // Revisionsspor må aldrig vælte hovedhandlingen.
    logger.error('logEmployeeEvent failed', { error: e, entityId: input.employeeId })
  }
}

export async function listEmployeeEvents(
  employeeId: string,
  limit = 50
): Promise<ActionResult<EmployeeEvent[]>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.view')) {
      return { success: false, error: 'Manglende tilladelse: employees.view' }
    }
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('employee_events')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return { success: false, error: 'Kunne ikke hente historik' }
    return { success: true, data: (data ?? []) as EmployeeEvent[] }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke hente historik') }
  }
}
