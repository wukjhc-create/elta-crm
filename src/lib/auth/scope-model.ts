/**
 * 00240 (Henrik 2026-10-27, D1–D6): ÉN semantisk model for læse-scope på kunder og sager — app-laget
 * (case-scope.ts / customer-scope.ts) og RLS-hjælperne i 00240 (case_in_my_scope / customer_in_my_scope) afledes af
 * de samme regler og konstanter. Ren logik/konstanter, ingen DB. Ændres en regel her, skal SQL-udkastet
 * (docs/runbooks/mp-00240-read-scope-proposal.md) ændres i samme commit — scripts/scope-model-test.ts tjekker det.
 *
 * Niveauer: NONE / OWN+RELATED / ALL. Alt går gennem EFFEKTIVE rettigheder (rolle ∪ grants − revokes); manglende eller
 * inaktiv profil = NONE (ingen_adgang har ingen nøgler). Ingen regel er knyttet til profiles.role.
 *
 * SAG (service_cases)
 *   ALL      = cases.view.all
 *   OWN      = cases.view.assigned ∧ (created_by = mig ∨ assigned_to = mig)
 *   RELATED  = cases.view.assigned ∧ (
 *                ∃ work_orders(case_id = sagen, assigned_employee_id = min AKTIVE employees-række, status ≠ cancelled)
 *              ∨ sagen.source_offer_id → offers.created_by = mig            (D4: sag konverteret fra mit tilbud) )
 *
 * KUNDE (customers)
 *   ALL      = customers.view.all
 *   OWN      = customers.view ∧ created_by = mig
 *   RELATED  = customers.view ∧ (
 *                kunden står i en af sagens 6 parts-kolonner (CASE_PARTY_COLUMNS) på en sag i mit sags-scope
 *              ∨ work_orders.customer_id på en ikke-annulleret arbejdsordre tildelt min aktive employees-række
 *              ∨ customer_tasks.customer_id på en ÅBEN opgave (OPEN_TASK_STATUSES) med assigned_to = mig )   (D3)
 *   En afsluttet opgave giver ikke varig adgang; adgang via sag/arbejdsordre består uafhængigt af opgaven.
 */
import type { Permission } from './permissions'

export type ScopeLevel = 'none' | 'own_related' | 'all'

/** Sagens kunde-roller (FK → customers.id) — RELATED kunde via en sag i scope */
export const CASE_PARTY_COLUMNS = [
  'customer_id',
  'site_customer_id',
  'payer_customer_id',
  'orderer_customer_id',
  'end_customer_id',
  'purchased_from_customer_id',
] as const

/** customer_tasks_status_check: pending | in_progress | done — åbne = ikke 'done' (eksplicit liste: nye statusser giver ikke adgang) */
export const OPEN_TASK_STATUSES = ['pending', 'in_progress'] as const

/** work_orders.status der IKKE giver adgang (FW-11) */
export const WORK_ORDER_EXCLUDED_STATUS = 'cancelled'

export const CUSTOMER_SCOPE_KEYS = { all: 'customers.view.all', base: 'customers.view' } as const satisfies Record<string, Permission>
export const CASE_SCOPE_KEYS = { all: 'cases.view.all', base: 'cases.view.assigned' } as const satisfies Record<string, Permission>

/** Niveau ud fra effektive rettigheder (ingen DB) */
export function scopeLevel(can: (p: Permission) => boolean, keys: { all: Permission; base: Permission }): ScopeLevel {
  if (can(keys.all)) return 'all'
  if (can(keys.base)) return 'own_related'
  return 'none'
}

/** PostgREST or()-filter: kunden i en af sagens parts-kolonner (id er en uuid fra vores egen DB / valideret input) */
export function casePartyOrFilter(customerId: string): string {
  return CASE_PARTY_COLUMNS.map((c) => `${c}.eq.${customerId}`).join(',')
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}
