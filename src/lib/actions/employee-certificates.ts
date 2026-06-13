'use server'

/**
 * Sprint Ø2 ERP — certifikater/kompetencer (employee_certificates). CRUD.
 * Read: employees.view. Write: employees.edit. Logger events.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { logEmployeeEvent } from '@/lib/actions/employee-events'
import { logger } from '@/lib/utils/logger'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types/common.types'
import type { EmployeeCertificate, CertificateCategory } from '@/types/employees.types'

export interface CertificateInput {
  name: string
  category: CertificateCategory
  issuer?: string | null
  issued_date?: string | null
  expires_date?: string | null
  document_path?: string | null
  note?: string | null
  archived?: boolean
}

const clean = (v: string | null | undefined) => (v && v.length ? v : null)

export async function listCertificates(employeeId: string): Promise<ActionResult<EmployeeCertificate[]>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.view')) return { success: false, error: 'Manglende tilladelse' }
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('employee_certificates')
      .select('*')
      .eq('employee_id', employeeId)
      .order('expires_date', { ascending: true, nullsFirst: false })
    if (error) return { success: false, error: 'Kunne ikke hente certifikater' }
    return { success: true, data: (data ?? []) as EmployeeCertificate[] }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke hente certifikater') }
  }
}

export async function createCertificate(employeeId: string, input: CertificateInput): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.edit')) return { success: false, error: 'Manglende tilladelse: employees.edit' }
    if (!input.name?.trim()) return { success: false, error: 'Certifikatnavn er påkrævet' }
    const admin = createAdminClient()
    const { error } = await admin.from('employee_certificates').insert({
      employee_id: employeeId,
      name: input.name.trim(),
      category: input.category,
      issuer: clean(input.issuer),
      issued_date: clean(input.issued_date),
      expires_date: clean(input.expires_date),
      document_path: clean(input.document_path),
      note: clean(input.note),
      archived: input.archived ?? false,
      created_by: ctx.userId,
    })
    if (error) { logger.error('createCertificate failed', { error, entityId: employeeId }); return { success: false, error: 'Kunne ikke oprette certifikat' } }
    await logEmployeeEvent({ employeeId, eventType: 'certificate_added', title: `Certifikat tilføjet: ${input.name.trim()}`, createdBy: ctx.userId, metadata: { category: input.category, expires: input.expires_date ?? null } })
    revalidatePath(`/dashboard/employees/${employeeId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke oprette certifikat') }
  }
}

export async function updateCertificate(id: string, input: Partial<CertificateInput>): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.edit')) return { success: false, error: 'Manglende tilladelse: employees.edit' }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of ['name','category','issuer','issued_date','expires_date','document_path','note','archived'] as const) {
      if (input[k] !== undefined) patch[k] = typeof input[k] === 'string' ? clean(input[k] as string) : input[k]
    }
    if (patch.name === null) return { success: false, error: 'Navn må ikke være tomt' }
    const admin = createAdminClient()
    const { data, error } = await admin.from('employee_certificates').update(patch).eq('id', id).select('employee_id').maybeSingle()
    if (error || !data) return { success: false, error: 'Kunne ikke opdatere certifikat' }
    revalidatePath(`/dashboard/employees/${data.employee_id}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke opdatere certifikat') }
  }
}

export async function deleteCertificate(id: string): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.edit')) return { success: false, error: 'Manglende tilladelse: employees.edit' }
    const admin = createAdminClient()
    const { data, error } = await admin.from('employee_certificates').delete().eq('id', id).select('employee_id').maybeSingle()
    if (error) return { success: false, error: 'Kunne ikke slette certifikat' }
    if (data) revalidatePath(`/dashboard/employees/${data.employee_id}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke slette certifikat') }
  }
}
