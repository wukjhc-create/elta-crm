'use server'

/**
 * N2 (Henrik 2026-10-02): godkendelse af timer — montør registrerer → serviceleder/admin godkender.
 * Kun status + hvem/hvornår (00185). INGEN løn-, fakturerings- eller e-conomic-effekt endnu.
 * Godkend/afvis skrives med service-role EFTER tilladelsestjek (time_logs.approve); DB-triggeren
 * (time_logs_approval_guard) afviser ændring af godkendelsesfelter fra bruger-sessioner.
 * Ingen selv-godkendelse: man kan ikke godkende/afvise sine egne timer (heller ikke admin).
 */

import { revalidatePath } from 'next/cache'
import { formatError, getAuthenticatedClientWithRole, permissionDenied } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'

export type TimeApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ApprovalTimeLog {
  id: string
  employee_id: string
  /** TT-8: arbejdsordren godkenderen så (flyttes rækken, godkendes den ikke usét) */
  work_order_id: string | null
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
  /** PL-2: satstype (overtid m.m.) og evt. særlig sats — godkenderen skal se dem */
  pay_rate_type: string
  employee_rate_id: string | null
  /** Egne timer kan ikke godkendes af en selv. */
  is_own: boolean
  /** P-7 (pilot-review 2026-10-16): faktureret → kan ikke afvises (UI viser "Faktureret" i stedet for Afvis) */
  invoiced: boolean
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
      .select(`id, employee_id, work_order_id, start_time, end_time, hours, description, billable, approval_status, approved_at, rejection_reason, pay_rate_type, employee_rate_id, invoice_line_id,
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
      id: string; employee_id: string; work_order_id: string | null; start_time: string; end_time: string | null; hours: number | string | null
      description: string | null; billable: boolean | null; approval_status: TimeApprovalStatus; approved_at: string | null
      rejection_reason: string | null
      pay_rate_type: string | null; employee_rate_id: string | null; invoice_line_id: string | null
      employee: { name: string | null; profile_id: string | null } | Array<{ name: string | null; profile_id: string | null }> | null
      approver: { full_name: string | null } | Array<{ full_name: string | null }> | null
      work_order: { title: string | null; case: unknown } | Array<{ title: string | null; case: unknown }> | null
    }
    const rows = ((data ?? []) as unknown as Row[]).map((r): ApprovalTimeLog => {
      const emp = one(r.employee)
      const wo = one(r.work_order)
      const cs = one(wo?.case as { id: string; case_number: string | null; title: string | null } | null)
      return {
        id: r.id, employee_id: r.employee_id, work_order_id: r.work_order_id ?? null, employee_name: emp?.name ?? null, start_time: r.start_time, end_time: r.end_time,
        hours: r.hours === null ? null : Number(r.hours), description: r.description, billable: r.billable !== false,
        approval_status: r.approval_status, approved_at: r.approved_at, approved_by_name: one(r.approver)?.full_name ?? null,
        rejection_reason: r.rejection_reason, case_id: cs?.id ?? null, case_number: cs?.case_number ?? null,
        case_title: cs?.title ?? null, work_order_title: wo?.title ?? null,
        pay_rate_type: r.pay_rate_type ?? 'normal', employee_rate_id: r.employee_rate_id ?? null, is_own: !!emp?.profile_id && emp.profile_id === userId,
        invoiced: !!r.invoice_line_id,
      }
    })
    return { success: true, data: rows }
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return new Date(a).getTime() === new Date(b).getTime()
}

/** Det godkenderen så pr. id (start/slut) — godkendes kun hvis registreringen ikke er ændret siden */
export type SeenTimes = Record<string, { start_time: string; end_time: string | null; pay_rate_type?: string; employee_rate_id?: string | null; billable?: boolean; work_order_id?: string | null }>

/** T-11 (review 2026-10-16): hvorfor registreringer blev sprunget over (før kun et samlet tal uden årsag) */
export interface SkipReasons { own: number; running: number; already: number; invoiced: number; changed: number; hidden: number; overlap: number; closed: number }

async function decide(ids: string[], decision: 'approved' | 'rejected', reason: string | null, seen?: SeenTimes): Promise<ActionResult<{ updated: number; skipped: number; reasons?: SkipReasons }>> {
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('time_logs.approve')) return { success: false, error: 'Manglende tilladelse: time_logs.approve' }
  const unique = [...new Set(ids)]
  if (unique.length === 0 || unique.length > 200) return { success: false, error: 'Vælg 1–200 registreringer' }
  for (const id of unique) validateUUID(id, 'tidsregistrering')

  // Læs med brugerens session (RLS-scope) — kun rækker brugeren må se, kan besluttes
  const { data: visible, error: readErr } = await supabase
    .from('time_logs')
    .select('id, employee_id, work_order_id, billable, start_time, end_time, approval_status, invoice_line_id, pay_rate_type, employee_rate_id, employee:employees(profile_id), work_order:work_orders(case:service_cases(status))')
    .in('id', unique)
  if (readErr) return { success: false, error: 'Kunne ikke hente timer' }
  type V = { id: string; employee_id: string; work_order_id: string | null; billable: boolean | null; start_time: string; end_time: string | null; approval_status: TimeApprovalStatus; invoice_line_id: string | null; pay_rate_type: string | null; employee_rate_id: string | null; employee: { profile_id: string | null } | Array<{ profile_id: string | null }> | null; work_order: { case: unknown } | Array<{ case: unknown }> | null }
  // TT-11 (timer-review 2026-10-18): en lukket sags kost/avance må ikke ændres af en senere godkendelse/afvisning
  const caseClosed = (v: V) => (one(one(v.work_order)?.case as { status?: string } | Array<{ status?: string }> | null)?.status ?? null) === 'closed'
  const eligible = ((visible ?? []) as unknown as V[]).filter((v) =>
    v.end_time !== null && v.approval_status !== decision && one(v.employee)?.profile_id !== userId
    // HR-review 2026-10-08 (#4): fakturerede timer kan ikke afvises (de forsvandt fra kost/avance, men stod på fakturaen)
    && !(decision === 'rejected' && v.invoice_line_id)
    // HR-review 2026-10-08 (#3): ændret efter godkenderen så den (fx 8 → 12 t) → springes over (godkendes ikke ubeset)
    && (!seen || !seen[v.id] || (sameInstant(seen[v.id].start_time, v.start_time) && sameInstant(seen[v.id].end_time, v.end_time)
      // PL-2: satstype/sats ændret efter godkenderen så den (fx normal → overtid 100 %) → springes over
      && (seen[v.id].pay_rate_type === undefined || seen[v.id].pay_rate_type === (v.pay_rate_type ?? 'normal'))
      && (seen[v.id].employee_rate_id === undefined || (seen[v.id].employee_rate_id ?? null) === (v.employee_rate_id ?? null))
      // TT-8: fakturerbar/arbejdsordre ændret efter godkenderen så den → springes over
      && (seen[v.id].billable === undefined || seen[v.id].billable === (v.billable !== false))
      && (seen[v.id].work_order_id === undefined || (seen[v.id].work_order_id ?? null) === (v.work_order_id ?? null))))
    && !caseClosed(v))
  let skipped = unique.length - eligible.length
  // T-11: årsag pr. sprunget-over række (første regel der fejler) — skjulte = ikke synlige for brugeren (RLS/scope)
  const visibleRows = (visible ?? []) as unknown as V[]
  const eligibleIds = new Set(eligible.map((e) => e.id))
  const reasons: SkipReasons = { own: 0, running: 0, already: 0, invoiced: 0, changed: 0, hidden: unique.length - visibleRows.length, overlap: 0, closed: 0 }
  for (const v of visibleRows) {
    if (eligibleIds.has(v.id)) continue
    if (v.end_time === null) reasons.running++
    else if (v.approval_status === decision) reasons.already++
    else if (one(v.employee)?.profile_id === userId) reasons.own++
    else if (decision === 'rejected' && v.invoice_line_id) reasons.invoiced++
    else if (caseClosed(v)) reasons.closed++
    else reasons.changed++
  }
  if (eligible.length === 0) {
    return { success: false, error: 'Ingen af de valgte registreringer kan behandles (egne timer, igangværende timer, allerede behandlet, allerede faktureret eller på en lukket sag)' }
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const now = new Date().toISOString()

  // TP-1 (review 2026-10-17): overlap-vagten ser bort fra afviste rækker (PL-1), så montøren kan registrere samme
  // tidsrum igen efter en afvisning. Godkendes den afviste række senere ("Godkend alle" på Afvist-fanen), blev samme
  // tidsrum talt to gange i kost/avance/fakturering. En afvist række godkendes derfor kun uden overlap.
  if (decision === 'approved') {
    const { findOverlappingTimeLog } = await import('@/lib/time-logs/guards')
    for (let k = eligible.length - 1; k >= 0; k--) {
      const v = eligible[k]
      if (v.approval_status !== 'rejected' || !v.end_time) continue
      const clash = await findOverlappingTimeLog(admin, v.employee_id, v.start_time, v.end_time, v.id)
      if (clash) { eligible.splice(k, 1); reasons.overlap++ }
    }
    skipped += reasons.overlap
    if (eligible.length === 0) {
      return { success: false, error: 'Registreringen overlapper en anden registrering i samme tidsrum — ret eller slet den ene først' }
    }
  }
  const patchRow = decision === 'approved'
    ? { approval_status: 'approved', approved_by: userId, approved_at: now, rejection_reason: null }
    : { approval_status: 'rejected', approved_by: userId, approved_at: now, rejection_reason: reason }
  // T-1 (review 2026-10-16): opdateringen er betinget af den række, der blev kontrolleret ovenfor — før kunne en
  // registrering faktureres (afvist alligevel → faktureret tid ude af kost/avance) eller ændres 8 → 12 t (godkendt
  // usét) mellem læsning og skrivning. Hver række opdateres kun, hvis tider/sats og fakturalås er som set.
  const updateOne = async (v: V) => {
    let q = admin.from('time_logs').update(patchRow).eq('id', v.id).neq('approval_status', decision)
      .eq('start_time', v.start_time)
    // fakturalåsen gælder kun afvisning (godkendelse af fakturerede timer er tilladt — samme regel som før)
    if (decision === 'rejected') q = q.is('invoice_line_id', null)
    q = v.end_time === null ? q.is('end_time', null) : q.eq('end_time', v.end_time)
    q = v.pay_rate_type === null ? q.is('pay_rate_type', null) : q.eq('pay_rate_type', v.pay_rate_type)
    q = v.employee_rate_id === null ? q.is('employee_rate_id', null) : q.eq('employee_rate_id', v.employee_rate_id)
    // TT-8: også fakturerbar/arbejdsordre som set
    if (v.billable !== null) q = q.eq('billable', v.billable)
    q = v.work_order_id === null ? q.is('work_order_id', null) : q.eq('work_order_id', v.work_order_id)
    return q.select('id')
  }
  const upd: Array<{ id: string }> = []
  for (let k = 0; k < eligible.length; k += 20) {
    const results = await Promise.all(eligible.slice(k, k + 20).map(updateOne))
    for (const { data, error } of results) {
      if (error) {
        logger.error('time approval update failed', { error })
        return { success: false, error: 'Kunne ikke gemme godkendelsen' }
      }
      upd.push(...((data ?? []) as Array<{ id: string }>))
    }
  }
  for (const r of upd) {
    await insertAuditRow({
      user_id: userId, entity_type: 'time_log', entity_id: r.id, entity_name: null,
      action: decision === 'approved' ? 'time_log_approved' : 'time_log_rejected',
      action_description: decision === 'approved' ? 'Timer godkendt' : `Timer afvist: ${reason ?? ''}`,
      changes: { approval_status: { new: decision } }, metadata: reason ? { reason } : null,
    })
  }
  revalidatePath('/dashboard/time-approval')
  // T-1: rækker ændret/faktureret mellem læsning og skrivning tæller som sprunget over
  reasons.changed += eligible.length - upd.length
  return { success: true, data: { updated: upd.length, skipped: skipped + (eligible.length - upd.length), reasons } }
}

export async function approveTimeLogsAction(ids: string[], seen?: SeenTimes): Promise<ActionResult<{ updated: number; skipped: number; reasons?: SkipReasons }>> {
  try {
    const denied = await permissionDenied('time_logs.approve') // eksplicit (decide() gater også)
    if (denied) return { success: false, error: denied }
    return await decide(ids, 'approved', null, seen)
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

export async function rejectTimeLogAction(id: string, reason: string): Promise<ActionResult<{ updated: number; skipped: number }>> {
  try {
    const denied = await permissionDenied('time_logs.approve') // eksplicit (decide() gater også)
    if (denied) return { success: false, error: denied }
    const r = (reason ?? '').trim()
    if (r.length < 3) return { success: false, error: 'Skriv en begrundelse til montøren' }
    return await decide([id], 'rejected', r.slice(0, 500))
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}
