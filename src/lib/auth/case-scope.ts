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
import type { Permission } from '@/lib/auth/permissions'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export type CaseScope =
  | { type: 'all' }
  | { type: 'specific'; caseIds: string[] }

export type WorkOrderScope =
  | { type: 'all' }
  | { type: 'specific'; workOrderIds: string[]; employeeId: string | null }

export interface ScopeContext {
  role: UserRole
  userId: string
  supabase: SupabaseClient
  /** PERM-1: effektiv rettigheds-tjek (fra getAuthenticatedClientWithRole) — uden den bruges rollen (uændret adfærd) */
  hasPermission?: (perm: Permission) => boolean
}

/**
 * PERM-1 / 00240: scope afgøres ALTID af EFFEKTIVE rettigheder (rolle ∪ grants − revokes). Sender kalderen ikke sit
 * hasPermission med, indlæses brugerens overrides (request-cachet) — før faldt ~34 kaldesteder tilbage til rollen alene,
 * så fx en Overmontør (cases.view.all via skabelon) blev behandlet som montør, og en REVOKE blev ignoreret.
 * Kan overrides ikke læses, giver effectivePermissionsFor INGEN rettigheder (fail-closed).
 */
export async function scopePermissions(ctx: ScopeContext): Promise<(perm: Permission) => boolean> {
  if (ctx.hasPermission) return ctx.hasPermission
  const { effectivePermissionsFor } = await import('./effective-access')
  const set = await effectivePermissionsFor(ctx.userId, ctx.role)
  return (perm) => set.has(perm)
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
  const can = await scopePermissions(ctx)
  if (can('cases.view.all')) {
    return { type: 'all' }
  }

  if (!can('cases.view.assigned')) {
    return { type: 'specific', caseIds: [] }
  }

  // Aggreger case-IDs fra to kilder for salg + montor.
  const caseIdSet = new Set<string>()

  // Kilde 1: cases hvor user direkte er assigned_to / created_by (salg-pattern).
  // PF2-4 (performance-review 2026-10-17): side for side — over 1.000 egne sager mistede vilkårlige sager adgang
  const ownRows = await fetchAllRows<{ id: string }>((from, to) => ctx.supabase
    .from('service_cases')
    .select('id')
    .or(`assigned_to.eq.${ctx.userId},created_by.eq.${ctx.userId}`)
    .order('id')
    .range(from, to))
  for (const row of ownRows) {
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
      // FW-11 (montør-review 2026-10-17): en annulleret arbejdsordre giver ikke længere adgang til sagen
      .neq('status', 'cancelled')
      .order('id')
      .range(from, to))
    for (const row of woRows) {
      if (row.case_id) caseIdSet.add(row.case_id as string)
    }
  }

  // Kilde 3 (00240 D4, Henrik 2026-10-27): sager konverteret fra et tilbud brugeren selv har oprettet
  // (service_cases.source_offer_id → offers.created_by) — fx salgs tilbud der accepteres i portalen/konverteres af andre
  for (const id of await casesFromMyOffers(ctx)) caseIdSet.add(id)

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
  const can = await scopePermissions(ctx)
  if (can('work_orders.view.all')) return { type: 'all' }
  if (!can('work_orders.view.assigned')) return { type: 'employee', employeeId: null }
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
  // PF2-4 (performance-review 2026-10-17): samme regler som getCaseScope, men som opslag på ÉN sag (før blev hele
  // scopet — alle egne sager + alle montørens arbejdsordrer — hentet ved hvert kald, ~40 kaldesteder pr. sidevisning)
  const can = await scopePermissions(ctx)
  if (can('cases.view.all')) return true
  if (!can('cases.view.assigned')) return false
  const { data: own } = await ctx.supabase
    .from('service_cases')
    .select('id')
    .eq('id', caseId)
    .or(`assigned_to.eq.${ctx.userId},created_by.eq.${ctx.userId}`)
    .maybeSingle()
  if (own) return true
  const { data: emp } = await ctx.supabase
    .from('employees')
    .select('id')
    .eq('profile_id', ctx.userId)
    .eq('active', true)
    .maybeSingle()
  const employeeId = (emp?.id as string | undefined) ?? null
  if (employeeId) {
    const { data: wo } = await ctx.supabase
      .from('work_orders')
      .select('id')
      .eq('case_id', caseId)
      .eq('assigned_employee_id', employeeId)
      .neq('status', 'cancelled') // FW-11
      .limit(1)
      .maybeSingle()
    if (wo) return true
  }
  // 00240 D4: sagen er konverteret fra et tilbud brugeren selv har oprettet
  const { data: fromOffer } = await ctx.supabase
    .from('service_cases')
    .select('id, src:offers!service_cases_source_offer_id_fkey!inner(created_by)')
    .eq('id', caseId)
    .eq('src.created_by', ctx.userId)
    .maybeSingle()
  return !!fromOffer
}

/** 00240 D4: id'er på sager hvis source_offer_id er et tilbud oprettet af brugeren (side for side) */
async function casesFromMyOffers(ctx: ScopeContext): Promise<string[]> {
  const rows = await fetchAllRows<{ id: string }>((from, to) => ctx.supabase
    .from('service_cases')
    .select('id, src:offers!service_cases_source_offer_id_fkey!inner(created_by)')
    .eq('src.created_by', ctx.userId)
    .order('id')
    .range(from, to))
  return rows.map((r) => r.id).filter(Boolean)
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
