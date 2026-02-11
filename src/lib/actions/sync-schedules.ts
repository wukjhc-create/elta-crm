'use server'

import { revalidatePath } from 'next/cache'
import { validateUUID } from '@/lib/validations/common'
import type { ActionResult } from '@/types/common.types'
import type {
  SupplierSyncSchedule,
  CreateSyncScheduleData,
  SyncType,
  ScheduleRunStatus,
} from '@/types/suppliers.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
// =====================================================
// Sync Schedule CRUD
// =====================================================

/**
 * Get all sync schedules for a supplier
 */
export async function getSupplierSyncSchedules(
  supplierId: string
): Promise<ActionResult<SupplierSyncSchedule[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(supplierId, 'leverandør ID')

    const { data, error } = await supabase
      .from('supplier_sync_schedules')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('sync_type')

    if (error) {
      logger.error('Database error fetching schedules', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as SupplierSyncSchedule[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente synkroniseringsplaner') }
  }
}

/**
 * Create a new sync schedule
 */
export async function createSyncSchedule(
  data: CreateSyncScheduleData
): Promise<ActionResult<SupplierSyncSchedule>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(data.supplier_id, 'leverandør ID')

    // Calculate next run time
    const nextRunAt = calculateNextRun(data.cron_expression)

    const { data: result, error } = await supabase
      .from('supplier_sync_schedules')
      .insert({
        supplier_id: data.supplier_id,
        schedule_name: data.schedule_name,
        sync_type: data.sync_type,
        cron_expression: data.cron_expression,
        timezone: data.timezone || 'Europe/Copenhagen',
        is_enabled: true,
        max_duration_minutes: data.max_duration_minutes || 60,
        retry_on_failure: data.retry_on_failure ?? true,
        max_retries: data.max_retries || 3,
        retry_delay_minutes: data.retry_delay_minutes || 15,
        notify_on_failure: data.notify_on_failure ?? true,
        notify_email: data.notify_email || null,
        next_run_at: nextRunAt,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'En plan af denne type eksisterer allerede for denne leverandør' }
      }
      logger.error('Database error creating schedule', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')

    return { success: true, data: result as SupplierSyncSchedule }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette synkroniseringsplan') }
  }
}

/**
 * Update a sync schedule
 */
export async function updateSyncSchedule(
  id: string,
  data: Partial<{
    schedule_name: string
    cron_expression: string
    is_enabled: boolean
    max_duration_minutes: number
    retry_on_failure: boolean
    max_retries: number
    retry_delay_minutes: number
    notify_on_failure: boolean
    notify_email: string
  }>
): Promise<ActionResult<SupplierSyncSchedule>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'plan ID')

    const updateData: Record<string, unknown> = {}

    if (data.schedule_name !== undefined) updateData.schedule_name = data.schedule_name
    if (data.cron_expression !== undefined) {
      updateData.cron_expression = data.cron_expression
      updateData.next_run_at = calculateNextRun(data.cron_expression)
    }
    if (data.is_enabled !== undefined) updateData.is_enabled = data.is_enabled
    if (data.max_duration_minutes !== undefined) updateData.max_duration_minutes = data.max_duration_minutes
    if (data.retry_on_failure !== undefined) updateData.retry_on_failure = data.retry_on_failure
    if (data.max_retries !== undefined) updateData.max_retries = data.max_retries
    if (data.retry_delay_minutes !== undefined) updateData.retry_delay_minutes = data.retry_delay_minutes
    if (data.notify_on_failure !== undefined) updateData.notify_on_failure = data.notify_on_failure
    if (data.notify_email !== undefined) updateData.notify_email = data.notify_email || null

    const { data: result, error } = await supabase
      .from('supplier_sync_schedules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Synkroniseringsplan ikke fundet' }
      }
      logger.error('Database error updating schedule', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')

    return { success: true, data: result as SupplierSyncSchedule }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere synkroniseringsplan') }
  }
}

/**
 * Delete a sync schedule
 */
export async function deleteSyncSchedule(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'plan ID')

    const { error } = await supabase
      .from('supplier_sync_schedules')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting schedule', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')

    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette synkroniseringsplan') }
  }
}

/**
 * Toggle sync schedule enabled/disabled
 */
export async function toggleSyncSchedule(id: string): Promise<ActionResult<SupplierSyncSchedule>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'plan ID')

    // Get current state
    const { data: current, error: fetchError } = await supabase
      .from('supplier_sync_schedules')
      .select('is_enabled, cron_expression')
      .eq('id', id)
      .single()

    if (fetchError || !current) {
      return { success: false, error: 'Synkroniseringsplan ikke fundet' }
    }

    // Toggle and update next run
    const newEnabled = !current.is_enabled
    const updateData: Record<string, unknown> = {
      is_enabled: newEnabled,
    }

    if (newEnabled) {
      updateData.next_run_at = calculateNextRun(current.cron_expression)
    }

    const { data: result, error } = await supabase
      .from('supplier_sync_schedules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Database error toggling schedule', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')

    return { success: true, data: result as SupplierSyncSchedule }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke ændre synkroniseringsplan') }
  }
}

/**
 * Run a sync schedule manually
 */
export async function runSyncNow(scheduleId: string): Promise<ActionResult<{ message: string }>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(scheduleId, 'plan ID')

    // Get schedule info
    const { data: schedule, error: scheduleError } = await supabase
      .from('supplier_sync_schedules')
      .select(`
        id,
        supplier_id,
        sync_type,
        suppliers!inner (
          id,
          name,
          code
        )
      `)
      .eq('id', scheduleId)
      .single()

    if (scheduleError || !schedule) {
      return { success: false, error: 'Synkroniseringsplan ikke fundet' }
    }

    // Import sync function dynamically to avoid circular dependency
    const { syncSupplierPrices } = await import('./supplier-sync')

    // Run sync
    const result = await syncSupplierPrices(schedule.supplier_id)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      data: {
        message: `Synkronisering afsluttet: ${result.data?.updatedProducts} produkter opdateret, ${result.data?.priceChanges} prisændringer`,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke starte synkronisering') }
  }
}

/**
 * Get sync history for a supplier
 */
export async function getSyncHistory(
  supplierId: string,
  options?: { limit?: number }
): Promise<ActionResult<Array<{
  id: string
  sync_type: string
  status: string
  trigger_type: string
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  processed_items: number
  price_changes_count: number
  error_message: string | null
}>>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(supplierId, 'leverandør ID')

    const { data, error } = await supabase
      .from('supplier_sync_logs')
      .select(`
        id,
        job_type,
        status,
        trigger_type,
        started_at,
        completed_at,
        duration_ms,
        processed_items,
        price_changes_count,
        error_message
      `)
      .eq('supplier_id', supplierId)
      .order('started_at', { ascending: false })
      .limit(options?.limit || 20)

    if (error) {
      logger.error('Database error fetching sync history', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return {
      success: true,
      data: (data || []).map((row) => ({
        id: row.id,
        sync_type: row.job_type,
        status: row.status,
        trigger_type: row.trigger_type || 'manual',
        started_at: row.started_at,
        completed_at: row.completed_at,
        duration_ms: row.duration_ms,
        processed_items: row.processed_items || 0,
        price_changes_count: row.price_changes_count || 0,
        error_message: row.error_message,
      })),
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente synkroniseringshistorik') }
  }
}
/**
 * Calculate next run time from cron expression
 * Simple implementation - handles common cases
 */
function calculateNextRun(cronExpression: string): string {
  const now = new Date()
  const parts = cronExpression.split(' ')

  if (parts.length !== 5) {
    // Invalid cron, default to tomorrow 3 AM
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(3, 0, 0, 0)
    return tomorrow.toISOString()
  }

  const [minute, hour] = parts

  // Parse hour and minute (handle wildcards)
  const targetHour = hour === '*' ? 0 : parseInt(hour)
  const targetMinute = minute === '*' ? 0 : parseInt(minute)

  // Calculate next occurrence
  const nextRun = new Date(now)
  nextRun.setHours(targetHour, targetMinute, 0, 0)

  // If time has passed today, move to tomorrow
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1)
  }

  return nextRun.toISOString()
}

// UI Helper Constants moved to client components (sync-schedules-manager.tsx)
// 'use server' files can only export async functions
