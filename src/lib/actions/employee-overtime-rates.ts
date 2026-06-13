'use server'

/**
 * Sprint Ø2.6 — overtidssatser pr. medarbejder (employee_overtime_rates).
 *
 * Read-gate: employees.payroll.view. Write-gate: employees.payroll.edit.
 * Bruger admin-client (service role) efter app-niveau permission-tjek.
 *
 * VIGTIGT: disse satser er endnu IKKE wired ind i time_logs' kost-/
 * salgsberegning. Denne sprint leverer datamodel + administration.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types/common.types'
import {
  DEFAULT_OVERTIME_RATES,
  type EmployeeOvertimeRate,
} from '@/types/employees.types'

export interface OvertimeRateInput {
  name: string
  code?: string
  multiplier: number
  cost_rate?: number | null
  sale_rate?: number | null
  is_active?: boolean
  sort_order?: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

function slugCode(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[æ]/g, 'ae').replace(/[ø]/g, 'oe').replace(/[å]/g, 'aa')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || `rate_${Date.now()}`
}

export async function listEmployeeOvertimeRates(
  employeeId: string
): Promise<ActionResult<EmployeeOvertimeRate[]>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.payroll.view')) {
      return { success: false, error: 'Manglende tilladelse: employees.payroll.view' }
    }
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('employee_overtime_rates')
      .select('*')
      .eq('employee_id', employeeId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) return { success: false, error: 'Kunne ikke hente satser' }
    return { success: true, data: (data ?? []) as EmployeeOvertimeRate[] }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke hente satser') }
  }
}

/**
 * Seeder de 6 standard-satser hvis medarbejderen ikke har nogen endnu.
 * Idempotent: gør intet hvis der allerede findes satser. Default kost-/
 * salgspris afledes af employee_compensation × multiplikator når de findes.
 */
export async function ensureDefaultOvertimeRates(
  employeeId: string
): Promise<ActionResult<EmployeeOvertimeRate[]>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.payroll.edit')) {
      return { success: false, error: 'Manglende tilladelse: employees.payroll.edit' }
    }
    const admin = createAdminClient()

    const { data: existing } = await admin
      .from('employee_overtime_rates')
      .select('id')
      .eq('employee_id', employeeId)
      .limit(1)
    if (existing && existing.length > 0) {
      return listEmployeeOvertimeRates(employeeId)
    }

    // Basis-satser fra kompensation (kan være null).
    const { data: comp } = await admin
      .from('employee_compensation')
      .select('internal_cost_rate, sales_rate')
      .eq('employee_id', employeeId)
      .maybeSingle()
    const baseCost = comp?.internal_cost_rate != null ? Number(comp.internal_cost_rate) : null
    const baseSale = comp?.sales_rate != null ? Number(comp.sales_rate) : null

    const rows = DEFAULT_OVERTIME_RATES.map((d) => ({
      employee_id: employeeId,
      name: d.name,
      code: d.code,
      multiplier: d.multiplier,
      cost_rate: baseCost != null ? r2(baseCost * d.multiplier) : null,
      sale_rate: baseSale != null ? r2(baseSale * d.multiplier) : null,
      is_active: true,
      sort_order: d.sort_order,
    }))

    const { error } = await admin.from('employee_overtime_rates').insert(rows)
    if (error) {
      logger.error('ensureDefaultOvertimeRates: insert failed', { error, entityId: employeeId })
      return { success: false, error: 'Kunne ikke oprette standard-satser' }
    }
    revalidatePath(`/dashboard/employees/${employeeId}`)
    return listEmployeeOvertimeRates(employeeId)
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke oprette standard-satser') }
  }
}

export async function createOvertimeRate(
  employeeId: string,
  input: OvertimeRateInput
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.payroll.edit')) {
      return { success: false, error: 'Manglende tilladelse: employees.payroll.edit' }
    }
    if (!input.name?.trim()) return { success: false, error: 'Satsnavn er påkrævet' }
    if (!Number.isFinite(input.multiplier) || input.multiplier < 0) {
      return { success: false, error: 'Ugyldig multiplikator' }
    }
    const admin = createAdminClient()
    const code = (input.code?.trim() || slugCode(input.name)).slice(0, 40)
    const { error } = await admin.from('employee_overtime_rates').insert({
      employee_id: employeeId,
      name: input.name.trim(),
      code,
      multiplier: input.multiplier,
      cost_rate: input.cost_rate ?? null,
      sale_rate: input.sale_rate ?? null,
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 99,
    })
    if (error) {
      if (error.code === '23505') return { success: false, error: 'Der findes allerede en sats med denne kode' }
      logger.error('createOvertimeRate failed', { error, entityId: employeeId })
      return { success: false, error: 'Kunne ikke oprette sats' }
    }
    revalidatePath(`/dashboard/employees/${employeeId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke oprette sats') }
  }
}

export async function updateOvertimeRate(
  rateId: string,
  input: Partial<OvertimeRateInput>
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('employees.payroll.edit')) {
      return { success: false, error: 'Manglende tilladelse: employees.payroll.edit' }
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.multiplier !== undefined) patch.multiplier = input.multiplier
    if (input.cost_rate !== undefined) patch.cost_rate = input.cost_rate
    if (input.sale_rate !== undefined) patch.sale_rate = input.sale_rate
    if (input.is_active !== undefined) patch.is_active = input.is_active
    if (input.sort_order !== undefined) patch.sort_order = input.sort_order

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('employee_overtime_rates')
      .update(patch)
      .eq('id', rateId)
      .select('employee_id')
      .maybeSingle()
    if (error || !data) return { success: false, error: 'Kunne ikke opdatere sats' }
    revalidatePath(`/dashboard/employees/${data.employee_id}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke opdatere sats') }
  }
}

export async function setOvertimeRateActive(
  rateId: string,
  active: boolean
): Promise<ActionResult<void>> {
  return updateOvertimeRate(rateId, { is_active: active })
}
