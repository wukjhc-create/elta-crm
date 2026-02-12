'use server'

import { revalidatePath } from 'next/cache'
import { validateUUID } from '@/lib/validations/common'
import type { ActionResult, PaginatedResponse } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'
import type {
  SupplierSyncJob,
  SupplierSyncJobWithSupplier,
  SupplierSyncLog,
  CreateSyncJobData,
  UpdateSyncJobData,
  SyncLogFilters,
} from '@/types/suppliers.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
// =====================================================
// Sync Job CRUD
// =====================================================

export async function getSyncJobs(
  supplierId?: string
): Promise<ActionResult<SupplierSyncJobWithSupplier[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('v_supplier_sync_jobs')
      .select('*')
      .order('created_at', { ascending: false })

    if (supplierId) {
      validateUUID(supplierId, 'leverandør ID')
      query = query.eq('supplier_id', supplierId)
    }

    query = query.limit(200)

    const { data, error } = await query

    if (error) {
      logger.error('Database error fetching sync jobs', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as SupplierSyncJobWithSupplier[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente sync-jobs') }
  }
}

export async function getSyncJob(
  id: string
): Promise<ActionResult<SupplierSyncJobWithSupplier>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'sync job ID')

    const { data, error } = await supabase
      .from('v_supplier_sync_jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      logger.error('Database error fetching sync job', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!data) {
      return { success: false, error: 'Sync job ikke fundet' }
    }

    return { success: true, data: data as SupplierSyncJobWithSupplier }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente sync job') }
  }
}

export async function createSyncJob(
  data: CreateSyncJobData
): Promise<ActionResult<SupplierSyncJob>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(data.supplier_id, 'leverandør ID')

    const { data: job, error } = await supabase
      .from('supplier_sync_jobs')
      .insert({
        ...data,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      logger.error('Database error creating sync job', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')
    return { success: true, data: job as SupplierSyncJob }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette sync job') }
  }
}

export async function updateSyncJob(
  id: string,
  data: UpdateSyncJobData
): Promise<ActionResult<SupplierSyncJob>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'sync job ID')

    const { data: job, error } = await supabase
      .from('supplier_sync_jobs')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Sync job ikke fundet' }
      }
      logger.error('Database error updating sync job', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')
    return { success: true, data: job as SupplierSyncJob }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere sync job') }
  }
}

export async function deleteSyncJob(
  id: string
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'sync job ID')

    const { error } = await supabase
      .from('supplier_sync_jobs')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting sync job', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette sync job') }
  }
}

// =====================================================
// Sync Execution
// =====================================================

async function startSyncLog(
  supplierId: string,
  jobType: string,
  triggerType: 'manual' | 'scheduled' | 'webhook' | 'api',
  syncJobId?: string
): Promise<ActionResult<SupplierSyncLog>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(supplierId, 'leverandør ID')

    const { data, error } = await supabase
      .from('supplier_sync_logs')
      .insert({
        supplier_id: supplierId,
        sync_job_id: syncJobId || null,
        job_type: jobType,
        status: 'started',
        trigger_type: triggerType,
        started_at: new Date().toISOString(),
        triggered_by: userId,
      })
      .select()
      .single()

    if (error) {
      logger.error('Database error creating sync log', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as SupplierSyncLog }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke starte sync') }
  }
}

export async function updateSyncLog(
  logId: string,
  updates: Partial<Pick<SupplierSyncLog,
    'status' | 'completed_at' | 'duration_ms' | 'total_items' |
    'processed_items' | 'new_items' | 'updated_items' | 'failed_items' |
    'skipped_items' | 'price_changes_count' | 'error_message' | 'error_stack' |
    'details' | 'import_batch_id'
  >>
): Promise<ActionResult<SupplierSyncLog>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(logId, 'sync log ID')

    const { data, error } = await supabase
      .from('supplier_sync_logs')
      .update(updates)
      .eq('id', logId)
      .select()
      .single()

    if (error) {
      logger.error('Database error updating sync log', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as SupplierSyncLog }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere sync log') }
  }
}

async function completeSyncLog(
  logId: string,
  result: {
    status: 'completed' | 'failed'
    totalItems: number
    processedItems: number
    newItems: number
    updatedItems: number
    failedItems: number
    skippedItems: number
    priceChangesCount: number
    errorMessage?: string
    details?: Record<string, unknown>
    importBatchId?: string
  }
): Promise<ActionResult<SupplierSyncLog>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(logId, 'sync log ID')

    const { data: logData } = await supabase
      .from('supplier_sync_logs')
      .select('started_at')
      .eq('id', logId)
      .maybeSingle()

    const durationMs = logData?.started_at
      ? Date.now() - new Date(logData.started_at).getTime()
      : null

    const { data, error } = await supabase
      .from('supplier_sync_logs')
      .update({
        status: result.status,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        total_items: result.totalItems,
        processed_items: result.processedItems,
        new_items: result.newItems,
        updated_items: result.updatedItems,
        failed_items: result.failedItems,
        skipped_items: result.skippedItems,
        price_changes_count: result.priceChangesCount,
        error_message: result.errorMessage || null,
        details: result.details || {},
        import_batch_id: result.importBatchId || null,
      })
      .eq('id', logId)
      .select()
      .single()

    if (error) {
      logger.error('Database error completing sync log', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Update sync job last_run_at if linked
    if (data.sync_job_id) {
      await supabase
        .from('supplier_sync_jobs')
        .update({
          last_run_at: new Date().toISOString(),
          last_status: result.status === 'completed' ? 'success' : 'failed',
        })
        .eq('id', data.sync_job_id)
    }

    revalidatePath('/dashboard/settings/suppliers')
    return { success: true, data: data as SupplierSyncLog }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke afslutte sync') }
  }
}

// =====================================================
// Sync Logs History
// =====================================================

export async function getSyncLogs(
  filters?: SyncLogFilters
): Promise<ActionResult<PaginatedResponse<SupplierSyncLog>>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    let countQuery = supabase
      .from('supplier_sync_logs')
      .select('*', { count: 'exact', head: true })

    let dataQuery = supabase
      .from('supplier_sync_logs')
      .select('*')

    if (filters?.supplier_id) {
      validateUUID(filters.supplier_id, 'leverandør ID')
      countQuery = countQuery.eq('supplier_id', filters.supplier_id)
      dataQuery = dataQuery.eq('supplier_id', filters.supplier_id)
    }

    if (filters?.sync_job_id) {
      validateUUID(filters.sync_job_id, 'sync job ID')
      countQuery = countQuery.eq('sync_job_id', filters.sync_job_id)
      dataQuery = dataQuery.eq('sync_job_id', filters.sync_job_id)
    }

    if (filters?.status) {
      countQuery = countQuery.eq('status', filters.status)
      dataQuery = dataQuery.eq('status', filters.status)
    }

    if (filters?.job_type) {
      countQuery = countQuery.eq('job_type', filters.job_type)
      dataQuery = dataQuery.eq('job_type', filters.job_type)
    }

    const sortBy = filters?.sortBy || 'started_at'
    const sortOrder = filters?.sortOrder || 'desc'
    dataQuery = dataQuery.order(sortBy, { ascending: sortOrder === 'asc' })
    dataQuery = dataQuery.range(offset, offset + pageSize - 1)

    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

    if (countResult.error || dataResult.error) {
      logger.error('Database error fetching sync logs', { error: countResult.error || dataResult.error })
      throw new Error('DATABASE_ERROR')
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: (dataResult.data || []) as SupplierSyncLog[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente sync historik') }
  }
}
