'use server'

/**
 * "Mine timer" — den indloggede medarbejders egne timer for en uge (dansk
 * kalender). Kun egne rækker: medarbejderen findes via employees.profile_id,
 * og RLS (time_logs_select_by_scope, 00161) begrænser yderligere.
 */

import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { copenhagenLocalToIso } from '@/lib/utils/copenhagen-time'
import { danishWeekStart, summarizeWeekHours, type WeekHours } from '@/lib/time/week-hours'

export type MyWeekHoursResult =
  | { ok: true; linked: true; employeeName: string | null; week: WeekHours }
  | { ok: true; linked: false }
  | { ok: false; message: string }

export async function getMyWeekHoursAction(weekOffset = 0): Promise<MyWeekHoursResult> {
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('time_logs.view.own')) {
    return { ok: false, message: 'Manglende tilladelse: time_logs.view.own' }
  }
  const offset = Number.isInteger(weekOffset) && Math.abs(weekOffset) <= 52 ? weekOffset : 0

  const { data: emp, error: empErr } = await supabase
    .from('employees')
    .select('id, name')
    .eq('profile_id', userId)
    .eq('active', true) // FW-15 (montør-review 2026-10-17): som getWorkOrderEmployeeScope — ikke en gammel inaktiv række
    .order('created_at', { ascending: true }) // montør-flow-audit 2026-10-27: ved to aktive rækker vinder den ældste (som scope-motoren)
    .limit(1)
    .maybeSingle()
  // Pilot-review 2026-10-29: en læsefejl er ikke "ingen medarbejderrække" (kortet forsvandt tavst)
  if (empErr) return { ok: false, message: 'Kunne ikke hente dine timer lige nu' }
  if (!emp) return { ok: true, linked: false }

  const weekStart = danishWeekStart(new Date(), offset)
  const next = new Date(`${weekStart}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 7)
  const fromIso = copenhagenLocalToIso(weekStart, '00:00')
  const toIso = copenhagenLocalToIso(next.toISOString().slice(0, 10), '00:00')

  const { data, error } = await supabase
    .from('time_logs')
    .select('id, start_time, end_time, hours, billable, description, approval_status, rejection_reason, work_order_id')
    .eq('employee_id', emp.id)
    .gte('start_time', fromIso)
    .lt('start_time', toIso)
    .order('start_time', { ascending: false })
    .limit(200)
  if (error) return { ok: false, message: 'Kunne ikke hente timer' }

  type Row = {
    id: string; start_time: string; end_time: string | null; hours: number | string | null; billable: boolean | null; description: string | null
    approval_status: string | null; rejection_reason: string | null; work_order_id: string | null
  }
  type WoRow = { id: string; title: string | null; case: { case_number: string | null; title: string | null } | Array<{ case_number: string | null; title: string | null }> | null }
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
  const rows = (data ?? []) as unknown as Row[]
  // 00242-forudsætning (O1, 2026-10-27): montøren ser kun egne arbejdsordrer, men kan have timer på en kollegas ordre
  // (to montører på samme job). Jobnavn/sagsnummer til brugerens EGNE timer slås op med admin-klienten (kun titel/nummer)
  const woIds = Array.from(new Set(rows.map((r) => r.work_order_id).filter((x): x is string => !!x)))
  const woById = new Map<string, WoRow>()
  if (woIds.length) {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { data: wos } = await createAdminClient().from('work_orders').select('id, title, case:service_cases(case_number, title)').in('id', woIds)
    for (const w of (wos ?? []) as unknown as WoRow[]) woById.set(w.id, w)
  }
  const logs = rows.map((r) => {
    const wo = r.work_order_id ? woById.get(r.work_order_id) ?? null : null
    const cs = one(wo?.case ?? null)
    return {
      id: r.id, start_time: r.start_time, end_time: r.end_time, hours: r.hours, billable: r.billable, description: r.description,
      approval_status: r.approval_status, rejection_reason: r.rejection_reason,
      work_order_title: wo?.title ?? null, case_number: cs?.case_number ?? null, case_title: cs?.title ?? null,
    }
  })
  return { ok: true, linked: true, employeeName: (emp.name as string | null) ?? null, week: summarizeWeekHours(logs, weekStart) }
}
