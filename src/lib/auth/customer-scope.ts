/**
 * 00240 (Henrik 2026-10-27) — kunde-scope i app-laget. Samme regler som RLS-hjælperen customer_in_my_scope i 00240
 * (se scope-model.ts). Bruges hvor en server-sti læser kunder med admin-klienten PÅ VEGNE AF en bruger (Telegram,
 * dublet-opslag, finans-handlinger med kunde-id), så et gættet/indsendt uuid aldrig giver adgang til en skjult kunde.
 *
 * Bruger-klient-forespørgsler (lister, søgning, Ctrl+K, vælgere, tællinger) begrænses af RLS efter 00240 — de skal ikke
 * filtreres to gange. Opslagene her kører med KALDERENS klient (ctx.supabase): før 00240 ser den alt (RLS true), efter
 * 00240 kun egne sager — begge giver samme resultat, fordi reglerne er de samme.
 *
 * Fejl i et opslag giver INGEN adgang (fail-closed).
 */
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { selectInChunks } from '@/lib/supabase/in-chunks'
import { logger } from '@/lib/utils/logger'
import { getCaseScope, scopePermissions, type ScopeContext } from './case-scope'
import {
  CASE_PARTY_COLUMNS, CASE_SCOPE_KEYS, CUSTOMER_SCOPE_KEYS, OPEN_TASK_STATUSES, WORK_ORDER_EXCLUDED_STATUS,
  casePartyOrFilter, isUuid, scopeLevel, type ScopeLevel,
} from './scope-model'

export type CustomerScope =
  | { type: 'all' }
  | { type: 'specific'; customerIds: string[] }

/** Kunde-scope-niveau ud fra EFFEKTIVE rettigheder (overrides indlæses hvis kalderen ikke sender hasPermission) */
export async function customerScopeLevel(ctx: ScopeContext): Promise<ScopeLevel> {
  return scopeLevel(await scopePermissions(ctx), CUSTOMER_SCOPE_KEYS)
}

async function myEmployeeId(ctx: ScopeContext): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .from('employees').select('id').eq('profile_id', ctx.userId).eq('active', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle() // som case-scope: dublet-rækker må ikke give 0 adgang
  if (error) throw new Error(`employees: ${error.message}`)
  return (data?.id as string | undefined) ?? null
}

type PartyRow = Record<(typeof CASE_PARTY_COLUMNS)[number], string | null>
function partyIds(rows: PartyRow[], out: Set<string>) {
  for (const r of rows) for (const c of CASE_PARTY_COLUMNS) if (r[c]) out.add(r[c] as string)
}

/**
 * Alle kunde-id'er brugeren må se ('all' = hele registeret). Til batch-filtrering af admin-klient-resultater —
 * brug userCanViewCustomer for ét id.
 */
export async function getCustomerScope(ctx: ScopeContext): Promise<CustomerScope> {
  const level = await customerScopeLevel(ctx)
  if (level === 'all') return { type: 'all' }
  if (level === 'none') return { type: 'specific', customerIds: [] }
  try {
    const ids = new Set<string>()
    // dynamisk kolonneliste → PostgREST-typerne kan ikke udlede rækken; resultatet typesættes eksplicit
    const partySel: string = CASE_PARTY_COLUMNS.join(', ')
    const db = ctx.supabase as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

    // OWN: oprettet af mig
    const own = await fetchAllRows<{ id: string }>((f, t) => ctx.supabase
      .from('customers').select('id').eq('created_by', ctx.userId).order('id').range(f, t))
    own.forEach((r) => ids.add(r.id))

    // RELATED 1: parter på sager i mit sags-scope
    const caseScope = await getCaseScope(ctx)
    if (caseScope.type === 'all') {
      partyIds(await fetchAllRows<PartyRow & { id: string }>((f, t) => db
        .from('service_cases').select(`id, ${partySel}`).order('id').range(f, t)), ids)
    } else if (caseScope.caseIds.length) {
      partyIds(await selectInChunks<PartyRow>(caseScope.caseIds, (chunk) => db
        .from('service_cases').select(partySel).in('id', chunk)), ids)
    }

    // RELATED 2: kunden på en ikke-annulleret arbejdsordre tildelt mig
    const employeeId = await myEmployeeId(ctx)
    if (employeeId) {
      const wos = await fetchAllRows<{ id: string; customer_id: string | null }>((f, t) => ctx.supabase
        .from('work_orders').select('id, customer_id')
        .eq('assigned_employee_id', employeeId).neq('status', WORK_ORDER_EXCLUDED_STATUS)
        .not('customer_id', 'is', null).order('id').range(f, t))
      wos.forEach((r) => r.customer_id && ids.add(r.customer_id))
    }

    // RELATED 3 (D3): kunden på en ÅBEN opgave tildelt mig
    const tasks = await fetchAllRows<{ id: string; customer_id: string | null }>((f, t) => ctx.supabase
      .from('customer_tasks').select('id, customer_id')
      .eq('assigned_to', ctx.userId).in('status', [...OPEN_TASK_STATUSES])
      .not('customer_id', 'is', null).order('id').range(f, t))
    tasks.forEach((r) => r.customer_id && ids.add(r.customer_id))

    return { type: 'specific', customerIds: Array.from(ids) }
  } catch (e) {
    logger.error('getCustomerScope: opslag fejlede — ingen kunder i scope', { error: e, entityId: ctx.userId })
    return { type: 'specific', customerIds: [] }
  }
}

/** Må brugeren se netop denne kunde? Ét målrettet opslag pr. regel (stopper ved første træf). Fail-closed. */
export async function userCanViewCustomer(customerId: string, ctx: ScopeContext): Promise<boolean> {
  if (!isUuid(customerId)) return false
  const level = await customerScopeLevel(ctx)
  if (level === 'all') return true
  if (level === 'none') return false
  try {
    const one = async (q: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return Array.isArray(data) ? data.length > 0 : !!data
    }
    // OWN
    if (await one(ctx.supabase.from('customers').select('id').eq('id', customerId).eq('created_by', ctx.userId).limit(1))) return true
    // RELATED 3 (D3): åben opgave tildelt mig
    if (await one(ctx.supabase.from('customer_tasks').select('id').eq('customer_id', customerId)
      .eq('assigned_to', ctx.userId).in('status', [...OPEN_TASK_STATUSES]).limit(1))) return true
    const employeeId = await myEmployeeId(ctx)
    // RELATED 2: arbejdsordre på kunden tildelt mig
    if (employeeId && await one(ctx.supabase.from('work_orders').select('id').eq('customer_id', customerId)
      .eq('assigned_employee_id', employeeId).neq('status', WORK_ORDER_EXCLUDED_STATUS).limit(1))) return true
    // RELATED 1: kunden er part på en sag i mit sags-scope
    const caseLevel = scopeLevel(await scopePermissions(ctx), CASE_SCOPE_KEYS)
    if (caseLevel === 'none') return false
    if (caseLevel === 'all') {
      return await one(ctx.supabase.from('service_cases').select('id').or(casePartyOrFilter(customerId)).limit(1))
    }
    const scope = await getCaseScope(ctx)
    if (scope.type === 'all') return await one(ctx.supabase.from('service_cases').select('id').or(casePartyOrFilter(customerId)).limit(1))
    if (!scope.caseIds.length) return false
    const hits = await selectInChunks<{ id: string }>(scope.caseIds, (chunk) => ctx.supabase
      .from('service_cases').select('id').in('id', chunk).or(casePartyOrFilter(customerId)).limit(1))
    return hits.length > 0
  } catch (e) {
    logger.error('userCanViewCustomer: opslag fejlede — nægtet', { error: e, entityId: customerId })
    return false
  }
}

/** Filtrér en liste af kunde-id'er til dem brugeren må se (til admin-klient-resultater) */
export async function filterVisibleCustomerIds(ids: readonly string[], ctx: ScopeContext): Promise<Set<string>> {
  const level = await customerScopeLevel(ctx)
  if (level === 'all') return new Set(ids)
  if (level === 'none' || ids.length === 0) return new Set()
  const scope = await getCustomerScope(ctx)
  if (scope.type === 'all') return new Set(ids)
  const allowed = new Set(scope.customerIds)
  return new Set(ids.filter((id) => allowed.has(id)))
}
