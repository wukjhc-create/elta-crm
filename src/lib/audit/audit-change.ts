/**
 * EM-6 (review 2026-10-17): revisionsspor for følsomme pris-/sats-/loginændringer (avanceregler, overtidssatser,
 * leverandørlogins). Kaldes EFTER en lykket skrivning fra gatede actions. Hemmeligheder må aldrig sendes med i
 * `changes` — kun felt-navne/"ændret". Fejler aldrig kalderen. Bevidst IKKE 'use server'.
 */
import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'

export async function auditChange(input: {
  action: string
  entityType: string
  entityId?: string | null
  entityName?: string | null
  description: string
  changes?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const { userId } = await getAuthenticatedClientWithRole()
    await insertAuditRow({
      user_id: userId,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      entity_name: input.entityName ?? null,
      action: input.action,
      action_description: input.description,
      changes: input.changes ?? null,
      metadata: null,
    })
  } catch (err) {
    logger.warn('auditChange fejlede', { error: err, metadata: { action: input.action } })
  }
}
