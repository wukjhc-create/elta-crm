'use server'

import { headers } from 'next/headers'
import { createClient, getUser } from '@/lib/supabase/server'
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

// =====================================================
// Helper Functions
// =====================================================

async function requireAuth(): Promise<string> {
  const user = await getUser()
  if (!user) {
    throw new Error('AUTH_REQUIRED')
  }
  return user.id
}

function formatError(err: unknown, defaultMessage: string): string {
  if (err instanceof Error) {
    if (err.message === 'AUTH_REQUIRED') {
      return 'Du skal være logget ind'
    }
    if (err.message.startsWith('Ugyldig')) {
      return err.message
    }
  }
  console.error(`${defaultMessage}:`, err)
  return defaultMessage
}

async function getClientInfo(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const headersList = await headers()
    const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || null
    const userAgent = headersList.get('user-agent') || null
    return { ip, userAgent }
  } catch {
    return { ip: null, userAgent: null }
  }
}

// =====================================================
// Audit Log Functions
// =====================================================

/**
 * Create an audit log entry
 * This is the main function for logging actions in the system
 */
export async function createAuditLog(
  data: CreateAuditLogData
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient()

    // Get current user info
    const user = await getUser()
    let userEmail: string | null = null
    let userName: string | null = null

    if (user) {
      userEmail = user.email || null

      // Get user's profile for name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

      userName = profile?.full_name || null
    }

    // Get client info
    const { ip, userAgent } = await getClientInfo()

    // Validate entity_id if provided
    if (data.entity_id) {
      validateUUID(data.entity_id, 'entity ID')
    }

    // Call the database function
    const { data: result, error } = await supabase.rpc('log_audit_event', {
      p_user_id: user?.id || null,
      p_user_email: userEmail,
      p_user_name: userName,
      p_entity_type: data.entity_type,
      p_entity_id: data.entity_id || null,
      p_entity_name: data.entity_name || null,
      p_action: data.action,
      p_action_description: data.action_description || null,
      p_changes: data.changes || null,
      p_metadata: data.metadata || {},
      p_ip_address: ip,
      p_user_agent: userAgent,
    })

    if (error) {
      // Log error but don't fail the action - audit logging should be non-blocking
      logger.error('Failed to create audit log', {
        error,
        action: data.action,
        entity: data.entity_type,
        entityId: data.entity_id,
      })
      return { success: false, error: 'Kunne ikke oprette audit log' }
    }

    return { success: true, data: { id: result } }
  } catch (err) {
    // Log error but don't fail - audit logging should be non-blocking
    logger.error('Audit log error', { error: err })
    return { success: false, error: formatError(err, 'Audit log fejlede') }
  }
}

/**
 * Log a create action
 */
export async function logCreate(
  entityType: AuditEntityType,
  entityId: string,
  entityName: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    action: 'create',
    action_description: `Oprettet: ${entityName}`,
    metadata,
  })
}

/**
 * Log an update action with changes
 */
export async function logUpdate(
  entityType: AuditEntityType,
  entityId: string,
  entityName: string,
  changes: Record<string, { old: unknown; new: unknown }>,
  metadata?: Record<string, unknown>
): Promise<void> {
  const changedFields = Object.keys(changes)
  await createAuditLog({
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    action: 'update',
    action_description: `Opdateret: ${entityName} (${changedFields.join(', ')})`,
    changes,
    metadata,
  })
}

/**
 * Log a delete action
 */
export async function logDelete(
  entityType: AuditEntityType,
  entityId: string,
  entityName: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    action: 'delete',
    action_description: `Slettet: ${entityName}`,
    metadata,
  })
}

/**
 * Log a status change
 */
export async function logStatusChange(
  entityType: AuditEntityType,
  entityId: string,
  entityName: string,
  oldStatus: string,
  newStatus: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    action: 'status_change',
    action_description: `Status ændret: ${oldStatus} → ${newStatus}`,
    changes: { status: { old: oldStatus, new: newStatus } },
    metadata,
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
    await requireAuth()
    validateUUID(entityId, 'entity ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error fetching entity audit logs:', error)
      return { success: false, error: 'Kunne ikke hente audit logs' }
    }

    return { success: true, data: data as AuditLogEntry[] }
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
    await requireAuth()

    // Validate optional UUIDs
    if (filters?.entity_id) {
      validateUUID(filters.entity_id, 'entity ID')
    }
    if (filters?.user_id) {
      validateUUID(filters.user_id, 'user ID')
    }

    const supabase = await createClient()
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
      console.error('Error counting audit logs:', countResult.error)
      return { success: false, error: 'Kunne ikke hente audit logs' }
    }

    if (dataResult.error) {
      console.error('Error fetching audit logs:', dataResult.error)
      return { success: false, error: 'Kunne ikke hente audit logs' }
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: dataResult.data as AuditLogEntry[],
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
    await requireAuth()

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('v_recent_audit_logs')
      .select('*')
      .limit(limit)

    if (error) {
      console.error('Error fetching recent audit activity:', error)
      return { success: false, error: 'Kunne ikke hente seneste aktivitet' }
    }

    return { success: true, data: data as AuditLogEntry[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente seneste aktivitet') }
  }
}
