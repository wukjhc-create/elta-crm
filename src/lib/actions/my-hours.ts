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

  const { data: emp } = await supabase
    .from('employees')
    .select('id, name')
    .eq('profile_id', userId)
    .limit(1)
    .maybeSingle()
  if (!emp) return { ok: true, linked: false }

  const weekStart = danishWeekStart(new Date(), offset)
  const next = new Date(`${weekStart}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 7)
  const fromIso = copenhagenLocalToIso(weekStart, '00:00')
  const toIso = copenhagenLocalToIso(next.toISOString().slice(0, 10), '00:00')

  const { data, error } = await supabase
    .from('time_logs')
    .select('id, start_time, end_time, hours, billable, description, work_order:work_orders(title, case:service_cases(case_number, title))')
    .eq('employee_id', emp.id)
    .gte('start_time', fromIso)
    .lt('start_time', toIso)
    .order('start_time', { ascending: false })
    .limit(200)
  if (error) return { ok: false, message: 'Kunne ikke hente timer' }

  type Row = {
    id: string; start_time: string; end_time: string | null; hours: number | string | null; billable: boolean | null; description: string | null
    work_order: { title: string | null; case: { case_number: string | null; title: string | null } | Array<{ case_number: string | null; title: string | null }> | null } |
      Array<{ title: string | null; case: { case_number: string | null; title: string | null } | Array<{ case_number: string | null; title: string | null }> | null }> | null
  }
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
  const logs = ((data ?? []) as unknown as Row[]).map((r) => {
    const wo = one(r.work_order)
    const cs = one(wo?.case ?? null)
    return {
      id: r.id, start_time: r.start_time, end_time: r.end_time, hours: r.hours, billable: r.billable, description: r.description,
      work_order_title: wo?.title ?? null, case_number: cs?.case_number ?? null, case_title: cs?.title ?? null,
    }
  })
  return { ok: true, linked: true, employeeName: (emp.name as string | null) ?? null, week: summarizeWeekHours(logs, weekStart) }
}
