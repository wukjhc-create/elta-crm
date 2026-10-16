/**
 * SEC-6 (permission-review 2026-10-16): audit-SKRIVNING som almindeligt server-modul (IKKE 'use server'). Før lå
 * createAuditLog/logCreate/… i den 'use server'-fil, audit-siden importerer — enhver indlogget kunne skrive vilkårlige
 * audit-poster om vilkårlige entiteter. Kaldes kun fra andre server-actions efter deres egen gate.
 * Må ALDRIG importeres i klientkode.
 */

import { headers } from 'next/headers'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import type { CreateAuditLogData, AuditEntityType } from '@/types/audit.types'
import type { ActionResult } from '@/types/common.types'

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
    const { supabase, userId } = await getAuthenticatedClient()

    // Get user profile info
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .maybeSingle()

    const userEmail = profile?.email || null
    const userName = profile?.full_name || null

    // Get client info
    const { ip, userAgent } = await getClientInfo()

    // Validate entity_id if provided
    if (data.entity_id) {
      validateUUID(data.entity_id, 'entity ID')
    }

    // Call the database function
    const { data: result, error } = await supabase.rpc('log_audit_event', {
      p_user_id: userId || null,
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
