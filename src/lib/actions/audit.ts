'use server'

import { headers } from 'next/headers'
import { getAuthenticatedClient, getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import type {
  AuditLogEntry,
  CreateAuditLogData,
  AuditLogFilters,
  AuditEntityType,
  AuditAction,
} from '@/types/audit.types'
import type { ActionResult, PaginatedResponse } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'
/**
 * C-F1 (cost-review 2026-10-17): ældre audit-rækker ("Tilbud sendt med lav DB (X% < Y%)", metadata db_percentage) lod
 * salg regne kostprisen ud af egne rækker. Uden offers.view.cost_prices fjernes procenterne ved visning.
 */
async function stripCostFromAudit(rows: AuditLogEntry[]): Promise<AuditLogEntry[]> {
  const ctx = await getAuthenticatedClientWithRole()
  if (ctx.hasPermission('offers.view.cost_prices')) return rows
  return rows.map((r) => {
    const meta = (r.metadata ?? null) as Record<string, unknown> | null
    const cleanMeta = meta ? Object.fromEntries(Object.entries(meta).filter(([k]) => !/^(db_|threshold$|margin)/.test(k))) : meta
    const desc = typeof r.action_description === 'string' ? r.action_description.replace(/\s*\(\s*-?[\d.,]+\s*%\s*<\s*-?[\d.,]+\s*%\s*\)/g, '') : r.action_description
    return { ...r, metadata: cleanMeta, action_description: desc } as AuditLogEntry
  })
}

// =====================================================
// Query Functions
// =====================================================

/**
 * Get audit logs for an entity
 */
export async function getEntityAuditLogs(
  entityType: AuditEntityType,
  entityId: string
): Promise<ActionResult<AuditLogEntry[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(entityId, 'entity ID')

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      logger.error('Error fetching entity audit logs', { error: error })
      return { success: false, error: 'Kunne ikke hente audit logs' }
    }

    return { success: true, data: await stripCostFromAudit(data as AuditLogEntry[]) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente audit logs') }
  }
}

/**
 * Get audit logs with filters
 */
export async function getAuditLogs(
  filters?: AuditLogFilters
): Promise<ActionResult<PaginatedResponse<AuditLogEntry>>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Validate optional UUIDs
    if (filters?.entity_id) {
      validateUUID(filters.entity_id, 'entity ID')
    }
    if (filters?.user_id) {
      validateUUID(filters.user_id, 'user ID')
    }
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Build count query
    let countQuery = supabase
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })

    // Build data query
    let dataQuery = supabase.from('audit_logs').select('*')

    // Apply filters
    if (filters?.entity_type) {
      countQuery = countQuery.eq('entity_type', filters.entity_type)
      dataQuery = dataQuery.eq('entity_type', filters.entity_type)
    }

    if (filters?.entity_id) {
      countQuery = countQuery.eq('entity_id', filters.entity_id)
      dataQuery = dataQuery.eq('entity_id', filters.entity_id)
    }

    if (filters?.user_id) {
      countQuery = countQuery.eq('user_id', filters.user_id)
      dataQuery = dataQuery.eq('user_id', filters.user_id)
    }

    if (filters?.action) {
      countQuery = countQuery.eq('action', filters.action)
      dataQuery = dataQuery.eq('action', filters.action)
    }

    if (filters?.from_date) {
      countQuery = countQuery.gte('created_at', filters.from_date)
      dataQuery = dataQuery.gte('created_at', filters.from_date)
    }

    if (filters?.to_date) {
      countQuery = countQuery.lte('created_at', filters.to_date)
      dataQuery = dataQuery.lte('created_at', filters.to_date)
    }

    // Apply sorting and pagination
    dataQuery = dataQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    // Execute both queries
    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

    if (countResult.error) {
      logger.error('Error counting audit logs', { error: countResult.error })
      return { success: false, error: 'Kunne ikke hente audit logs' }
    }

    if (dataResult.error) {
      logger.error('Error fetching audit logs', { error: dataResult.error })
      return { success: false, error: 'Kunne ikke hente audit logs' }
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: await stripCostFromAudit(dataResult.data as AuditLogEntry[]),
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente audit logs') }
  }
}

/**
 * Get recent activity for dashboard
 */
export async function getRecentAuditActivity(
  limit: number = 10
): Promise<ActionResult<AuditLogEntry[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('v_recent_audit_logs')
      .select('*')
      .limit(limit)

    if (error) {
      logger.error('Error fetching recent audit activity', { error: error })
      return { success: false, error: 'Kunne ikke hente seneste aktivitet' }
    }

    return { success: true, data: await stripCostFromAudit(data as AuditLogEntry[]) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente seneste aktivitet') }
  }
}
