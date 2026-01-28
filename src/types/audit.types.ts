/**
 * Audit log types for tracking system changes
 */

export type AuditEntityType =
  | 'customer'
  | 'lead'
  | 'offer'
  | 'project'
  | 'calculation'
  | 'product'
  | 'package'
  | 'message'
  | 'settings'
  | 'user'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'view'
  | 'export'
  | 'import'
  | 'send'
  | 'accept'
  | 'reject'
  | 'archive'
  | 'restore'

export interface AuditLogEntry {
  id: string
  user_id: string | null
  user_email: string | null
  user_name: string | null
  entity_type: AuditEntityType
  entity_id: string | null
  entity_name: string | null
  action: AuditAction
  action_description: string | null
  changes: Record<string, { old: unknown; new: unknown }> | null
  metadata: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface CreateAuditLogData {
  entity_type: AuditEntityType
  entity_id?: string
  entity_name?: string
  action: AuditAction
  action_description?: string
  changes?: Record<string, { old: unknown; new: unknown }>
  metadata?: Record<string, unknown>
}

export interface AuditLogFilters {
  entity_type?: AuditEntityType
  entity_id?: string
  user_id?: string
  action?: AuditAction
  from_date?: string
  to_date?: string
  page?: number
  pageSize?: number
}
