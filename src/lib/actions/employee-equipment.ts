'use server'

/**
 * Sprint Ø2 ERP — medarbejderudstyr (employee_equipment). CRUD + statusskift.
 * Read: employees.view. Write: employees.edit. Logger events.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { logEmployeeEvent } from '@/lib/actions/employee-events'
import { logger } from '@/lib/utils/logger'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types/common.types'
import type { EmployeeEquipment, EquipmentCategory, EquipmentStatus } from '@/types/employees.types'

export interface EquipmentInput {
  name: string
  category: EquipmentCategory
  serial_number?: string | null
  asset_number?: string | null
  status?: EquipmentStatus
  issued_date?: string | null
  returned_date?: string | null
  value_amount?: number | null
  next_service_date?: string | null
  note?: string | null
}

const clean = (v: string | null | undefined) => (v && v.length ? v : null)

export async function listEquipment(employeeId: string): Promise<ActionResult<EmployeeEquipment[]>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.view')) return { success: false, error: 'Manglende tilladelse' }
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('employee_equipment')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
    if (error) return { success: false, error: 'Kunne ikke hente udstyr' }
    return { success: true, data: (data ?? []) as EmployeeEquipment[] }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke hente udstyr') }
  }
}

export async function createEquipment(employeeId: string, input: EquipmentInput): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.edit')) return { success: false, error: 'Manglende tilladelse: employees.edit' }
    if (!input.name?.trim()) return { success: false, error: 'Navn er påkrævet' }
    const admin = createAdminClient()
    const { error } = await admin.from('employee_equipment').insert({
      employee_id: employeeId,
      name: input.name.trim(),
      category: input.category,
      serial_number: clean(input.serial_number),
      asset_number: clean(input.asset_number),
      status: input.status ?? 'udleveret',
      issued_date: clean(input.issued_date),
      returned_date: clean(input.returned_date),
      value_amount: input.value_amount ?? null,
      next_service_date: clean(input.next_service_date),
      note: clean(input.note),
      created_by: ctx.userId,
    })
    if (error) { logger.error('createEquipment failed', { error, entityId: employeeId }); return { success: false, error: 'Kunne ikke oprette udstyr' } }
    await logEmployeeEvent({ employeeId, eventType: 'equipment_issued', title: `Udstyr udleveret: ${input.name.trim()}`, createdBy: ctx.userId, metadata: { category: input.category } })
    revalidatePath(`/dashboard/employees/${employeeId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke oprette udstyr') }
  }
}

export async function updateEquipment(id: string, input: Partial<EquipmentInput>): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.edit')) return { success: false, error: 'Manglende tilladelse: employees.edit' }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of ['name','category','serial_number','asset_number','status','issued_date','returned_date','value_amount','next_service_date','note'] as const) {
      if (input[k] !== undefined) patch[k] = typeof input[k] === 'string' ? clean(input[k] as string) : input[k]
    }
    if (patch.name === null) return { success: false, error: 'Navn må ikke være tomt' }
    const admin = createAdminClient()
    const { data, error } = await admin.from('employee_equipment').update(patch).eq('id', id).select('employee_id').maybeSingle()
    if (error || !data) return { success: false, error: 'Kunne ikke opdatere udstyr' }
    revalidatePath(`/dashboard/employees/${data.employee_id}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke opdatere udstyr') }
  }
}

export async function setEquipmentStatus(id: string, status: EquipmentStatus): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.edit')) return { success: false, error: 'Manglende tilladelse: employees.edit' }
    const admin = createAdminClient()
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    if (status === 'returneret') patch.returned_date = new Date().toISOString().slice(0, 10)
    const { data, error } = await admin.from('employee_equipment').update(patch).eq('id', id).select('employee_id, name').maybeSingle()
    if (error || !data) return { success: false, error: 'Kunne ikke ændre status' }
    await logEmployeeEvent({ employeeId: data.employee_id as string, eventType: 'equipment_status', title: `Udstyr "${data.name}" markeret: ${status}`, createdBy: ctx.userId })
    revalidatePath(`/dashboard/employees/${data.employee_id}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke ændre status') }
  }
}

export async function deleteEquipment(id: string): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.edit')) return { success: false, error: 'Manglende tilladelse: employees.edit' }
    const admin = createAdminClient()
    const { data, error } = await admin.from('employee_equipment').delete().eq('id', id).select('employee_id').maybeSingle()
    if (error) return { success: false, error: 'Kunne ikke slette udstyr' }
    if (data) revalidatePath(`/dashboard/employees/${data.employee_id}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke slette udstyr') }
  }
}
