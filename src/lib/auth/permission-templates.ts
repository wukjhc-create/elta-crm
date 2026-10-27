/**
 * PERM-1 (Henrik 2026-10-25): skabeloner = basisrolle + eksplicitte grants/revokes med EKSISTERENDE nøgler.
 * En skabelon sætter standarder ved tildeling (materialiseres som overrides med source='template' i fase 2); admin kan
 * derefter ændre enkelte nøgler. Ren logik.
 *
 * Regler (tjekkes af scripts/effective-permissions-test.ts):
 *  - Salg/Serviceleder/Bogholderi = PRÆCIS dagens rolle (ingen stille udvidelse)
 *  - ingen skabelon giver automatisk følsomme nøgler (kost/avance, løn, regnskab/faktura, bank, indstillinger,
 *    brugeradministration, integrationer, tilbudsgodkendelse), medmindre basisrollen allerede har dem
 */
import type { Permission } from './permissions'
import type { PermissionOverride } from './effective-permissions'

export type TemplateKey = 'montor' | 'elektriker' | 'overmontor' | 'salg' | 'serviceleder' | 'bogholderi'

export interface PermissionTemplate {
  key: TemplateKey
  label: string
  baseRole: 'admin' | 'serviceleder' | 'montør' | 'salg' | 'bogholderi'
  grants: Permission[]
  revokes: Permission[]
  /** Kendte mål der endnu ikke kan udtrykkes med eksisterende nøgler (fx kunde-scope) */
  pending?: string[]
}

const ELEKTRIKER_GRANTS: Permission[] = ['customers.create', 'cases.create']

export const PERMISSION_TEMPLATES: Record<TemplateKey, PermissionTemplate> = {
  montor: {
    // 00240: kunder/sager = egne + relaterede (customers.view / cases.view.assigned uden .all)
    key: 'montor', label: 'Montør', baseRole: 'montør', grants: [], revokes: [],
  },
  elektriker: {
    key: 'elektriker', label: 'Elektriker', baseRole: 'montør',
    // "ret relaterede sager" = montørens eksisterende cases.edit.own
    grants: ELEKTRIKER_GRANTS, revokes: [],
    pending: ['ret relaterede kunder — kræver kunde-scope-nøgle (customers.edit.related); customers.edit (alle kunder) gives IKKE'],
  },
  overmontor: {
    key: 'overmontor', label: 'Overmontør', baseRole: 'montør',
    // 00240 D5: alle kunder + alle sager (planlægning/backlog viser kunder på alle sager)
    grants: [...ELEKTRIKER_GRANTS, 'customers.view.all', 'cases.view.all', 'work_orders.view.all', 'work_orders.plan', 'calendar.view.all', 'calendar.plan', 'tasks.create', 'time_logs.approve'],
    revokes: [],
  },
  salg: { key: 'salg', label: 'Salg', baseRole: 'salg', grants: [], revokes: [] },
  serviceleder: { key: 'serviceleder', label: 'Serviceleder', baseRole: 'serviceleder', grants: [], revokes: [] },
  bogholderi: { key: 'bogholderi', label: 'Bogholderi', baseRole: 'bogholderi', grants: [], revokes: [] },
}

/** Følsomme nøgler en skabelon aldrig må give ud over basisrollen */
export const SENSITIVE_PERMISSION_PATTERNS: RegExp[] = [
  /cost_prices$/, /^economy\./, /^employees\.payroll\./, /^invoices\./, /^bank\./, /^settings\./, /^users\./,
  /^suppliers\.credentials$/, /^incoming_invoices\.approve$/, /^offers\.approve$/, /^reports\.export$/,
]

export function templateOverrides(t: PermissionTemplate): PermissionOverride[] {
  return [
    ...t.grants.map((permission) => ({ permission, effect: 'grant' as const })),
    ...t.revokes.map((permission) => ({ permission, effect: 'revoke' as const })),
  ]
}
