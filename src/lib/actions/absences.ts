'use server'

/**
 * 00228 (Henrik 2026-10-15): fravær (type + periode). Læs: absences.view (admin/serviceleder/bogholderi) eller egne
 * (montør via calendar.view.own — RLS afgrænser til egne rækker). Skriv: absences.manage (admin/serviceleder) + audit.
 * Ingen fritekst gemmes (helbredsdetaljer).
 */
import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { validateUUID } from '@/lib/validations/common'
import { absenceLabel, absencePeriodText, validateAbsenceInput, type AbsenceRow } from '@/lib/planning/absence'
import type { ActionResult } from '@/types/common.types'

export interface AbsenceWithEmployee extends AbsenceRow { employee_name: string | null }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function listAbsencesAction(from: string, to: string): Promise<ActionResult<AbsenceWithEmployee[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('absences.view') && !hasPermission('calendar.view.own')) {
      return { success: false, error: 'Manglende tilladelse: absences.view' }
    }
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return { success: false, error: 'Ugyldig periode' }
    // RLS afgrænser: montør ser kun egne rækker
    const { data, error } = await supabase
      .from('employee_absences')
      .select('id, employee_id, kind, start_date, end_date, employee:employees(name)')
      .lte('start_date', to)
      .gte('end_date', from)
      .order('start_date')
      .limit(1000)
    if (error) throw error
    const rows = (data ?? []) as unknown as Array<AbsenceRow & { employee: { name: string | null } | Array<{ name: string | null }> | null }>
    const out = rows.map(({ employee, ...r }) => ({ ...r, employee_name: (Array.isArray(employee) ? employee[0] : employee)?.name ?? null }))
    // Bogholderi må se fravær men ikke læse medarbejdertabellen (RLS) — KUN navnet hentes server-side bag absences.view
    const missing = Array.from(new Set(out.filter((r) => !r.employee_name).map((r) => r.employee_id)))
    if (missing.length && hasPermission('absences.view')) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { data: names } = await createAdminClient().from('employees').select('id, name').in('id', missing.slice(0, 200))
      const byId = new Map(((names ?? []) as Array<{ id: string; name: string | null }>).map((n) => [n.id, n.name]))
      for (const r of out) if (!r.employee_name) r.employee_name = byId.get(r.employee_id) ?? null
    }
    return { success: true, data: out }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente fravær') }
  }
}

export async function createAbsenceAction(input: { employee_id: string; kind: string; start_date: string; end_date: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('absences.manage')) return { success: false, error: 'Manglende tilladelse: absences.manage' }
    validateUUID(input.employee_id, 'medarbejder-ID')
    const v = validateAbsenceInput(input)
    if (!v.ok) return { success: false, error: v.error }
    const { data: emp } = await supabase.from('employees').select('id, name').eq('id', input.employee_id).maybeSingle()
    if (!emp) return { success: false, error: 'Medarbejder ikke fundet' }
    const { data, error } = await supabase
      .from('employee_absences')
      .insert({ employee_id: input.employee_id, ...v.value, created_by: userId })
      .select('id')
      .single()
    if (error || !data) throw error ?? new Error('insert')
    await insertAuditRow({
      user_id: userId,
      entity_type: 'employee',
      entity_id: input.employee_id,
      entity_name: (emp as { name?: string | null }).name ?? 'Medarbejder',
      action: 'absence_created',
      action_description: `${absenceLabel(v.value.kind)} ${absencePeriodText(v.value)} registreret`,
      changes: { absence_id: (data as { id: string }).id, kind: v.value.kind, start_date: v.value.start_date, end_date: v.value.end_date },
    })
    revalidatePath('/dashboard/absences')
    revalidatePath('/dashboard/calendar')
    return { success: true, data: { id: (data as { id: string }).id } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke registrere fravær') }
  }
}

export async function deleteAbsenceAction(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('absences.manage')) return { success: false, error: 'Manglende tilladelse: absences.manage' }
    validateUUID(id, 'fravær-ID')
    const { data: cur } = await supabase.from('employee_absences').select('id, employee_id, kind, start_date, end_date').eq('id', id).maybeSingle()
    if (!cur) return { success: false, error: 'Fravær ikke fundet' }
    const { data: del, error } = await supabase.from('employee_absences').delete().eq('id', id).select('id')
    if (error) throw error
    if (!(del ?? []).length) return { success: false, error: 'Fraværet kunne ikke slettes' }
    const r = cur as AbsenceRow
    await insertAuditRow({
      user_id: userId,
      entity_type: 'employee',
      entity_id: r.employee_id,
      action: 'absence_deleted',
      action_description: `${absenceLabel(r.kind)} ${absencePeriodText(r)} slettet`,
      changes: { absence_id: id, kind: r.kind, start_date: r.start_date, end_date: r.end_date },
    })
    revalidatePath('/dashboard/absences')
    revalidatePath('/dashboard/calendar')
    return { success: true, data: null }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette fravær') }
  }
}
