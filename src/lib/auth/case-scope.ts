/**
 * Sprint 7E — case-scope filter logic.
 *
 * Returnerer enten 'all' (admin/serviceleder/bogholderi) eller en
 * konkret liste af case_ids brugeren maa se. Bruges af list/read
 * server actions til at filtrere data uden at exponere alt.
 *
 * Path til montor-scope:
 *   profiles.id → employees.profile_id → employees.id →
 *   work_orders.assigned_employee_id → work_orders.case_id
 *
 * Path til salg-scope:
 *   service_cases.created_by = profile.id ELLER
 *   service_cases.assigned_to = profile.id
 *
 * Schema-bekraeftelse i SPRINT_7E_SCOPE_MODEL.md.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '@/types/auth.types'
import { hasPermission } from '@/lib/auth/permissions'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export type CaseScope =
  | { type: 'all' }
  | { type: 'specific'; caseIds: string[] }

export type WorkOrderScope =
  | { type: 'all' }
  | { type: 'specific'; workOrderIds: string[]; employeeId: string | null }

interface ScopeContext {
  role: UserRole
  userId: string
  supabase: SupabaseClient
}

/**
 * Returnér hvilke service_case-IDs en bruger maa se.
 *
 * - admin/serviceleder/bogholderi (cases.view.all)  → 'all'
 * - salg (cases.view.assigned + cases.create)       → cases hvor user
 *                                                     er created_by ELLER
 *                                                     assigned_to
 * - montor (cases.view.assigned)                    → cases hvor user's
 *                                                     employee har work
 *                                                     orders tildelt
 * - andre                                           → tom liste
 */
export async function getCaseScope(ctx: ScopeContext): Promise<CaseScope> {
  if (hasPermission(ctx.role, 'cases.view.all')) {
    return { type: 'all' }
  }

  if (!hasPermission(ctx.role, 'cases.view.assigned')) {
    return { type: 'specific', caseIds: [] }
  }

  // Aggreger case-IDs fra to kilder for salg + montor.
  const caseIdSet = new Set<string>()

  // Kilde 1: cases hvor user direkte er assigned_to / created_by (salg-pattern).
  const ownCasesRes = await ctx.supabase
    .from('service_cases')
    .select('id')
    .or(`assigned_to.eq.${ctx.userId},created_by.eq.${ctx.userId}`)
  for (const row of ownCasesRes.data ?? []) {
    if (row.id) caseIdSet.add(row.id as string)
  }

  // Kilde 2: cases via work_orders.assigned_employee_id (montor-pattern).
  // Slaa user's employee-record op via profile_id.
  const empRes = await ctx.supabase
    .from('employees')
    .select('id')
    .eq('profile_id', ctx.userId)
    .eq('active', true)
    .maybeSingle()
  const employeeId = (empRes.data?.id as string | undefined) ?? null

  if (employeeId) {
    // montør-review: side for side (PostgREST giver højst 1.000 rækker — ældre montører mistede vilkårlige sager)
    const woRows = await fetchAllRows<{ id: string; case_id: string | null }>((from, to) => ctx.supabase
      .from('work_orders')
      .select('id, case_id')
      .eq('assigned_employee_id', employeeId)
      .not('case_id', 'is', null)
      .order('id')
      .range(from, to))
    for (const row of woRows) {
      if (row.case_id) caseIdSet.add(row.case_id as string)
    }
  }

  return { type: 'specific', caseIds: Array.from(caseIdSet) }
}

/**
 * Returnér hvilke work_order-IDs en bruger maa se.
 *
 * - admin/serviceleder (work_orders.view.all)       → 'all'
 * - montor (work_orders.view.assigned)              → kun assigned to user's
 *                                                     employee
 * - andre                                           → tom liste
 */
export type WorkOrderEmployeeScope = { type: 'all' } | { type: 'employee'; employeeId: string | null }

/**
 * Q-5 (review 2026-10-16): let variant af getWorkOrderScope uden id-listen — montørens scope ER "tildelt min
 * medarbejder", så kald der kan filtrere på assigned_employee_id i databasen behøver ikke hente alle id'er.
 * employeeId null = ingen adgang.
 */
export async function getWorkOrderEmployeeScope(ctx: ScopeContext): Promise<WorkOrderEmployeeScope> {
  if (hasPermission(ctx.role, 'work_orders.view.all')) return { type: 'all' }
  if (!hasPermission(ctx.role, 'work_orders.view.assigned')) return { type: 'employee', employeeId: null }
  const empRes = await ctx.supabase
    .from('employees')
    .select('id')
    .eq('profile_id', ctx.userId)
    .eq('active', true)
    .maybeSingle()
  return { type: 'employee', employeeId: (empRes.data?.id as string | undefined) ?? null }
}

export async function getWorkOrderScope(ctx: ScopeContext): Promise<WorkOrderScope> {
  const base = await getWorkOrderEmployeeScope(ctx)
  if (base.type === 'all') return { type: 'all' }
  const employeeId = base.employeeId
  if (!employeeId) {
    return { type: 'specific', workOrderIds: [], employeeId: null }
  }

  // montør-review: side for side (1.000-loftet gav "Arbejdsordren er ikke tildelt dig" på nye job)
  const woRows = await fetchAllRows<{ id: string }>((from, to) => ctx.supabase
    .from('work_orders')
    .select('id')
    .eq('assigned_employee_id', employeeId)
    .order('id')
    .range(from, to))
  const workOrderIds = woRows
    .map((r) => r.id as string)
    .filter(Boolean)

  return { type: 'specific', workOrderIds, employeeId }
}

/**
 * Predicat til detail-actions: maa user se dette specifikke case?
 */
export async function userCanViewCase(
  caseId: string,
  ctx: ScopeContext
): Promise<boolean> {
  const scope = await getCaseScope(ctx)
  if (scope.type === 'all') return true
  return scope.caseIds.includes(caseId)
}

/**
 * Predicat til detail-actions: maa user se dette specifikke work_order?
 */
export async function userCanViewWorkOrder(
  workOrderId: string,
  ctx: ScopeContext
): Promise<boolean> {
  // Q-5: ét rækkeopslag i stedet for alle montørens arbejdsordre-id'er
  const scope = await getWorkOrderEmployeeScope(ctx)
  if (scope.type === 'all') return true
  if (!scope.employeeId) return false
  const { data } = await ctx.supabase
    .from('work_orders')
    .select('id')
    .eq('id', workOrderId)
    .eq('assigned_employee_id', scope.employeeId)
    .maybeSingle()
  return !!data
}
