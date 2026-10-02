'use server'

/**
 * N2 (Henrik 2026-10-02): godkendelse af timer — montør registrerer → serviceleder/admin godkender.
 * Kun status + hvem/hvornår (00185). INGEN løn-, fakturerings- eller e-conomic-effekt endnu.
 * Godkend/afvis skrives med service-role EFTER tilladelsestjek (time_logs.approve); DB-triggeren
 * (time_logs_approval_guard) afviser ændring af godkendelsesfelter fra bruger-sessioner.
 * Ingen selv-godkendelse: man kan ikke godkende/afvise sine egne timer (heller ikke admin).
 */

import { revalidatePath } from 'next/cache'
import { formatError, getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'

export type TimeApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ApprovalTimeLog {
  id: string
  employee_id: string
  employee_name: string | null
  start_time: string
  end_time: string | null
  hours: number | null
  description: string | null
  billable: boolean
  approval_status: TimeApprovalStatus
  approved_at: string | null
  approved_by_name: string | null
  rejection_reason: string | null
  case_id: string | null
  case_number: string | null
  case_title: string | null
  work_order_title: string | null
  /** Egne timer kan ikke godkendes af en selv. */
  is_own: boolean
}

const STATUSES: TimeApprovalStatus[] = ['pending', 'approved', 'rejected']
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

export async function listTimeLogsForApprovalAction(status: TimeApprovalStatus = 'pending'): Promise<ActionResult<ApprovalTimeLog[]>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('time_logs.approve')) return { success: false, error: 'Manglende tilladelse: time_logs.approve' }
    const st = STATUSES.includes(status) ? status : 'pending'
    const { data, error } = await supabase
      .from('time_logs')
      .select(`id, employee_id, start_time, end_time, hours, description, billable, approval_status, approved_at, rejection_reason,
        employee:employees(name, profile_id), approver:profiles!time_logs_approved_by_fkey(full_name),
        work_order:work_orders(title, case:service_cases(id, case_number, title))`)
      .eq('approval_status', st)
      .order('start_time', { ascending: st === 'pending' })
      .limit(500)
    if (error) {
      logger.error('listTimeLogsForApproval failed', { error })
      return { success: false, error: 'Kunne ikke hente timer' }
    }
    type Row = {
      id: string; employee_id: string; start_time: string; end_time: string | null; hours: number | string | null
      description: string | null; billable: boolean | null; approval_status: TimeApprovalStatus; approved_at: string | null
      rejection_reason: string | null
      employee: { name: string | null; profile_id: string | null } | Array<{ name: string | null; profile_id: string | null }> | null
      approver: { full_name: string | null } | Array<{ full_name: string | null }> | null
      work_order: { title: string | null; case: unknown } | Array<{ title: string | null; case: unknown }> | null
    }
    const rows = ((data ?? []) as unknown as Row[]).map((r): ApprovalTimeLog => {
      const emp = one(r.employee)
      const wo = one(r.work_order)
      const cs = one(wo?.case as { id: string; case_number: string | null; title: string | null } | null)
      return {
        id: r.id, employee_id: r.employee_id, employee_name: emp?.name ?? null, start_time: r.start_time, end_time: r.end_time,
        hours: r.hours === null ? null : Number(r.hours), description: r.description, billable: r.billable !== false,
        approval_status: r.approval_status, approved_at: r.approved_at, approved_by_name: one(r.approver)?.full_name ?? null,
        rejection_reason: r.rejection_reason, case_id: cs?.id ?? null, case_number: cs?.case_number ?? null,
        case_title: cs?.title ?? null, work_order_title: wo?.title ?? null, is_own: !!emp?.profile_id && emp.profile_id === userId,
      }
    })
    return { success: true, data: rows }
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

async function decide(ids: string[], decision: 'approved' | 'rejected', reason: string | null): Promise<ActionResult<{ updated: number; skipped: number }>> {
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('time_logs.approve')) return { success: false, error: 'Manglende tilladelse: time_logs.approve' }
  const unique = [...new Set(ids)]
  if (unique.length === 0 || unique.length > 200) return { success: false, error: 'Vælg 1–200 registreringer' }
  for (const id of unique) validateUUID(id, 'tidsregistrering')

  // Læs med brugerens session (RLS-scope) — kun rækker brugeren må se, kan besluttes
  const { data: visible, error: readErr } = await supabase
    .from('time_logs')
    .select('id, end_time, approval_status, employee:employees(profile_id)')
    .in('id', unique)
  if (readErr) return { success: false, error: 'Kunne ikke hente timer' }
  type V = { id: string; end_time: string | null; approval_status: TimeApprovalStatus; employee: { profile_id: string | null } | Array<{ profile_id: string | null }> | null }
  const eligible = ((visible ?? []) as unknown as V[]).filter((v) =>
    v.end_time !== null && v.approval_status !== decision && one(v.employee)?.profile_id !== userId)
  const skipped = unique.length - eligible.length
  if (eligible.length === 0) {
    return { success: false, error: 'Ingen af de valgte registreringer kan behandles (egne timer, igangværende timer eller allerede behandlet)' }
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const now = new Date().toISOString()
  const { data: upd, error } = await createAdminClient()
    .from('time_logs')
    .update(decision === 'approved'
      ? { approval_status: 'approved', approved_by: userId, approved_at: now, rejection_reason: null }
      : { approval_status: 'rejected', approved_by: userId, approved_at: now, rejection_reason: reason })
    .in('id', eligible.map((e) => e.id))
    .neq('approval_status', decision)
    .select('id')
  if (error) {
    logger.error('time approval update failed', { error })
    return { success: false, error: 'Kunne ikke gemme godkendelsen' }
  }
  for (const r of (upd ?? []) as Array<{ id: string }>) {
    await insertAuditRow({
      user_id: userId, entity_type: 'time_log', entity_id: r.id, entity_name: null,
      action: decision === 'approved' ? 'time_log_approved' : 'time_log_rejected',
      action_description: decision === 'approved' ? 'Timer godkendt' : `Timer afvist: ${reason ?? ''}`,
      changes: { approval_status: { new: decision } }, metadata: reason ? { reason } : null,
    })
  }
  revalidatePath('/dashboard/time-approval')
  return { success: true, data: { updated: (upd ?? []).length, skipped } }
}

export async function approveTimeLogsAction(ids: string[]): Promise<ActionResult<{ updated: number; skipped: number }>> {
  try {
    return await decide(ids, 'approved', null)
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

export async function rejectTimeLogAction(id: string, reason: string): Promise<ActionResult<{ updated: number; skipped: number }>> {
  try {
    const r = (reason ?? '').trim()
    if (r.length < 3) return { success: false, error: 'Skriv en begrundelse til montøren' }
    return await decide([id], 'rejected', r.slice(0, 500))
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}
