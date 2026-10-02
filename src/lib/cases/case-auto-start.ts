/**
 * N23: sag "new" → "in_progress" når arbejdet begynder. Kaldes EFTER en allerede gatet handling (job-status, tid).
 * Service-role (montør har ikke cases.edit/UPDATE på service_cases), atomisk: opdaterer kun hvis sagen stadig er "new".
 * Kaster aldrig — en fejl her må ikke vælte jobstart/tidsregistrering.
 */
import { revalidatePath } from 'next/cache'
import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { logger } from '@/lib/utils/logger'
import { WORK_START_LABELS, type WorkStartTrigger } from '@/lib/cases/case-progress'

export async function autoStartCaseOnWork(caseId: string | null | undefined, trigger: WorkStartTrigger, userId: string): Promise<boolean> {
  if (!caseId) return false
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { data, error } = await createAdminClient()
      .from('service_cases')
      .update({ status: 'in_progress' })
      .eq('id', caseId)
      .eq('status', 'new')
      .select('id, case_number')
    if (error) { logger.warn('autoStartCaseOnWork fejlede', { error, entityId: caseId }); return false }
    const row = (data ?? [])[0] as { id: string; case_number: string | null } | undefined
    if (!row) return false
    await insertAuditRow({
      user_id: userId, entity_type: 'service_case', entity_id: caseId, entity_name: row.case_number,
      action: 'case_auto_in_progress', action_description: `Sag sat i gang automatisk (${WORK_START_LABELS[trigger]})`,
      changes: { status: { old: 'new', new: 'in_progress' } }, metadata: { trigger },
    })
    revalidatePath(`/dashboard/orders/${caseId}`)
    revalidatePath('/dashboard/orders')
    return true
  } catch (err) {
    logger.warn('autoStartCaseOnWork kastede', { error: err, entityId: caseId })
    return false
  }
}
