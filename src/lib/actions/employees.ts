'use server'

/**
 * Employee module — server actions.
 *
 * RBAC: read open to authenticated users (RLS narrows to admin-or-self).
 * All writes require `profiles.role='admin'`. Compensation changes
 * automatically snapshot into `employee_compensation_history` so payroll
 * back-calculation works.
 */

import { revalidatePath } from 'next/cache'
import { logEmployeeEvent } from '@/lib/actions/employee-events'
import {
  getAuthenticatedClient,
  getAuthenticatedClientWithRole,
} from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
import {
  EmployeeCompensationSchema,
  EmployeeIdentitySchema,
  type EmployeeCompensationInput,
  type EmployeeIdentityInput,
} from '@/lib/validations/employees'
import {
  calculateEmployeeProjectImpact,
} from '@/lib/services/employee-economics'
import type {
  EmployeeCompensationHistoryRow,
  EmployeeProjectImpact,
  EmployeeRow,
  EmployeeWithCompensation,
} from '@/types/employees.types'

export interface ActionOutcome<T = unknown> {
  ok: boolean
  message: string
  data?: T
  fieldErrors?: Record<string, string[]>
}

interface AdminCtx {
  supabase: Awaited<ReturnType<typeof getAuthenticatedClient>>['supabase']
  userId: string
}

/**
 * Sprint 7 Pilot — replaced inline 'role===admin' check with permission-aware
 * helpers. Each helper has same shape so callers can keep `if ('ok' in ctx)`
 * pattern.
 */
async function requireEmployeesEdit(): Promise<AdminCtx | { ok: false; message: string }> {
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('employees.edit')) {
    return { ok: false, message: 'Manglende tilladelse: employees.edit' }
  }
  return { supabase, userId }
}

async function requirePayrollView(): Promise<AdminCtx | { ok: false; message: string }> {
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('employees.payroll.view')) {
    return { ok: false, message: 'Manglende tilladelse: employees.payroll.view' }
  }
  return { supabase, userId }
}

async function requirePayrollEdit(): Promise<AdminCtx | { ok: false; message: string }> {
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('employees.payroll.edit')) {
    return { ok: false, message: 'Manglende tilladelse: employees.payroll.edit' }
  }
  return { supabase, userId }
}

function fullName(first: string | null, last: string | null, fallback?: string | null): string {
  const composed = [first, last].filter(Boolean).join(' ').trim()
  if (composed) return composed
  return fallback || 'Ukendt'
}

// =====================================================
// Reads
// =====================================================

export interface ListFilter {
  active?: 'all' | 'active' | 'inactive'
  q?: string
  limit?: number
}

export async function listEmployeesAction(filter: ListFilter = {}): Promise<EmployeeRow[]> {
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('employees.view')) return []
  const canSeeRates = hasPermission('employees.payroll.view')

  let q = supabase
    .from('employees')
    .select('*')
    .order('first_name', { ascending: true })
    .order('last_name', { ascending: true })
    .limit(filter.limit ?? 200)

  if (filter.active === 'active') q = q.eq('active', true)
  else if (filter.active === 'inactive') q = q.eq('active', false)

  if (filter.q && filter.q.trim().length > 0) {
    const term = `%${filter.q.trim().replace(/[%_]/g, '\\$&')}%`
    q = q.or(
      `name.ilike.${term},first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},employee_number.ilike.${term},phone.ilike.${term}`
    )
  }

  const { data } = await q
  const rows = (data ?? []).map(normaliseEmployee)
  if (!canSeeRates) {
    return rows.map((r) => ({ ...r, hourly_rate: null, cost_rate: null }))
  }
  return rows
}

export async function getEmployeeAction(id: string): Promise<EmployeeWithCompensation | null> {
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('employees.view')) return null
  const canSeePayroll = hasPermission('employees.payroll.view')

  const { data: emp } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!emp) return null

  let comp = null
  if (canSeePayroll) {
    const { data: c } = await supabase
      .from('employee_compensation')
      .select('*')
      .eq('employee_id', id)
      .maybeSingle()
    comp = c ?? null
  }

  const normalised = normaliseEmployee(emp)
  return {
    ...normalised,
    hourly_rate: canSeePayroll ? normalised.hourly_rate : null,
    cost_rate: canSeePayroll ? normalised.cost_rate : null,
    compensation: comp,
  }
}

export async function getEmployeeProjectImpactAction(
  employeeId: string,
  options: { workOrderId?: string | null; sinceIso?: string; untilIso?: string } = {}
): Promise<EmployeeProjectImpact[]> {
  const { hasPermission } = await getAuthenticatedClientWithRole()
  // Project impact udregner cost-effekter af medarbejder. Skal gates til
  // payroll-roller saa kostpriser ikke laekker.
  if (!hasPermission('employees.payroll.view')) return []
  return calculateEmployeeProjectImpact({ employeeId, ...options })
}

export async function getCompensationHistoryAction(
  employeeId: string,
  limit = 50
): Promise<EmployeeCompensationHistoryRow[]> {
  const ctx = await requirePayrollView()
  if ('ok' in ctx) return []
  const { data } = await ctx.supabase
    .from('employee_compensation_history')
    .select('*')
    .eq('employee_id', employeeId)
    .order('effective_from', { ascending: false })
    .limit(limit)
  return (data ?? []) as EmployeeCompensationHistoryRow[]
}

// =====================================================
// Writes — identity
// =====================================================

export async function createEmployeeAction(
  raw: unknown
): Promise<ActionOutcome<EmployeeWithCompensation>> {
  const ctx = await requireEmployeesEdit()
  if ('ok' in ctx) return ctx

  const parsed = EmployeeIdentitySchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Validering fejlede. Tjek felter.',
      fieldErrors: zodFieldErrors(parsed.error),
    }
  }
  const input = parsed.data

  // email + employee_number must be unique — pre-check for friendlier error.
  const { data: existing } = await ctx.supabase
    .from('employees')
    .select('id, email, employee_number')
    .or(
      input.employee_number
        ? `email.eq.${input.email},employee_number.eq.${input.employee_number}`
        : `email.eq.${input.email}`
    )
    .maybeSingle()
  if (existing) {
    return {
      ok: false,
      message:
        existing.email === input.email
          ? 'En medarbejder med denne e-mail findes allerede.'
          : 'Medarbejdernummeret er allerede i brug.',
    }
  }

  const insertPayload = buildEmployeePayload(input)
  const { data: ins, error } = await ctx.supabase
    .from('employees')
    .insert(insertPayload)
    .select('*')
    .single()
  if (error || !ins) {
    logger.error('createEmployee insert failed', { error })
    return { ok: false, message: error?.message ?? 'Insert fejlede.' }
  }

  revalidatePath('/dashboard/employees')
  return {
    ok: true,
    message: `Oprettet medarbejder: ${fullName(ins.first_name, ins.last_name, ins.name)}`,
    data: { ...normaliseEmployee(ins), compensation: null },
  }
}

export async function updateEmployeeAction(
  id: string,
  raw: unknown
): Promise<ActionOutcome<EmployeeWithCompensation>> {
  const ctx = await requireEmployeesEdit()
  if ('ok' in ctx) return ctx

  const parsed = EmployeeIdentitySchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Validering fejlede. Tjek felter.',
      fieldErrors: zodFieldErrors(parsed.error),
    }
  }

  const updatePayload = buildEmployeePayload(parsed.data)
  const { data: upd, error } = await ctx.supabase
    .from('employees')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !upd) {
    logger.error('updateEmployee failed', { entityId: id, error })
    return { ok: false, message: error?.message ?? 'Opdatering fejlede.' }
  }

  // Pull current compensation so the caller gets a complete row back.
  const { data: comp } = await ctx.supabase
    .from('employee_compensation')
    .select('*')
    .eq('employee_id', id)
    .maybeSingle()

  revalidatePath('/dashboard/employees')
  revalidatePath(`/dashboard/employees/${id}`)
  return {
    ok: true,
    message: 'Medarbejder opdateret.',
    data: { ...normaliseEmployee(upd), compensation: comp ?? null },
  }
}

export async function setEmployeeActiveAction(
  id: string,
  active: boolean
): Promise<ActionOutcome> {
  const ctx = await requireEmployeesEdit()
  if ('ok' in ctx) return ctx
  const { error } = await ctx.supabase
    .from('employees')
    .update({ active, termination_date: active ? null : new Date().toISOString().slice(0, 10) })
    .eq('id', id)
  if (error) return { ok: false, message: error.message }
  await logEmployeeEvent({
    employeeId: id,
    eventType: active ? 'employee_activated' : 'employee_deactivated',
    title: active ? 'Medarbejder aktiveret' : 'Medarbejder deaktiveret',
    createdBy: ctx.userId,
  })
  revalidatePath('/dashboard/employees')
  revalidatePath(`/dashboard/employees/${id}`)
  return { ok: true, message: active ? 'Medarbejder aktiveret.' : 'Medarbejder deaktiveret.' }
}

// =====================================================
// Writes — compensation
// =====================================================

export async function setEmployeeCompensationAction(
  employeeId: string,
  raw: unknown
): Promise<ActionOutcome<{ realHourlyCost: number | null }>> {
  const ctx = await requirePayrollEdit()
  if ('ok' in ctx) return ctx

  const parsed = EmployeeCompensationSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Validering fejlede. Tjek satser.',
      fieldErrors: zodFieldErrors(parsed.error),
    }
  }
  const input = parsed.data

  const upsertPayload = buildCompensationPayload(input)

  const { data: upserted, error } = await ctx.supabase
    .from('employee_compensation')
    .upsert({ employee_id: employeeId, ...upsertPayload }, { onConflict: 'employee_id' })
    .select('*')
    .single()
  if (error || !upserted) {
    logger.error('setEmployeeCompensation upsert failed', { entityId: employeeId, error })
    return { ok: false, message: error?.message ?? 'Gem af satser fejlede.' }
  }

  // Snapshot into history for audit/payroll back-calc.
  await ctx.supabase.from('employee_compensation_history').insert({
    employee_id: employeeId,
    hourly_wage: upserted.hourly_wage,
    internal_cost_rate: upserted.internal_cost_rate,
    sales_rate: upserted.sales_rate,
    pension_pct: upserted.pension_pct,
    free_choice_pct: upserted.free_choice_pct,
    vacation_pct: upserted.vacation_pct,
    sh_pct: upserted.sh_pct,
    social_costs: upserted.social_costs,
    overhead_pct: upserted.overhead_pct,
    overtime_rate: upserted.overtime_rate,
    mileage_rate: upserted.mileage_rate,
    real_hourly_cost: upserted.real_hourly_cost,
    effective_from: new Date().toISOString(),
    changed_by: ctx.userId,
    change_reason: input.change_reason ?? null,
  })

  await logEmployeeEvent({
    employeeId,
    eventType: 'compensation_changed',
    title: 'Satser/økonomi ændret',
    description: input.change_reason ?? null,
    createdBy: ctx.userId,
    metadata: { real_hourly_cost: upserted.real_hourly_cost },
  })

  revalidatePath(`/dashboard/employees/${employeeId}`)
  return {
    ok: true,
    message: 'Satser gemt.',
    data: { realHourlyCost: upserted.real_hourly_cost },
  }
}

// =====================================================
// helpers
// =====================================================

function buildEmployeePayload(input: EmployeeIdentityInput) {
  const composedName = [input.first_name, input.last_name].filter(Boolean).join(' ').trim()
  return {
    first_name: input.first_name,
    last_name: input.last_name,
    name: composedName,
    email: input.email,
    role: input.role,
    employment_type: input.employment_type,
    active: input.active,
    employee_number: input.employee_number,
    phone: input.phone,
    address: input.address,
    postal_code: input.postal_code,
    city: input.city,
    hire_date: input.hire_date,
    termination_date: input.termination_date,
    notes: input.notes,
    profile_id: input.profile_id,
  }
}

function buildCompensationPayload(input: EmployeeCompensationInput) {
  return {
    hourly_wage: input.hourly_wage,
    internal_cost_rate: input.internal_cost_rate,
    sales_rate: input.sales_rate,
    pension_pct: input.pension_pct,
    free_choice_pct: input.free_choice_pct,
    vacation_pct: input.vacation_pct,
    sh_pct: input.sh_pct,
    social_costs: input.social_costs,
    overhead_pct: input.overhead_pct,
    // Ø2.12B: legacy employee_compensation.overtime_rate styres ikke længere
    // fra UI (overtid = employee_overtime_rates-tabellen). Udelades fra upsert
    // så eksisterende legacy-værdi bevares uændret i DB.
    mileage_rate: input.mileage_rate,
    notes: input.notes,
  }
}

function normaliseEmployee(row: Record<string, unknown>): EmployeeRow {
  const r = row as {
    id: string
    profile_id: string | null
    employee_number: string | null
    first_name: string | null
    last_name: string | null
    name: string | null
    email: string
    role: string
    employment_type: import('@/types/employees.types').EmploymentType | null
    active: boolean
    address: string | null
    postal_code: string | null
    city: string | null
    phone: string | null
    hire_date: string | null
    termination_date: string | null
    notes: string | null
    hourly_rate: number | null
    cost_rate: number | null
    created_at: string
    updated_at: string
  }
  return {
    ...r,
    name: r.name ?? fullName(r.first_name, r.last_name, r.email),
    role: r.role as EmployeeRow['role'],
  }
}

function zodFieldErrors(err: import('zod').ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const issue of err.issues) {
    const key = issue.path.join('.')
    out[key] = out[key] ?? []
    out[key].push(issue.message)
  }
  return out
}
