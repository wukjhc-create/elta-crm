/**
 * PERM-1: enkle grupper til admin-UI'et (Team → Medarbejder → Rettigheder) — ikke 112 flade kontakter.
 * Hver nøgle i PERMISSIONS hører til PRÆCIS én gruppe (tjekkes af scripts/effective-permissions-test.ts).
 * Scope-sæt: gensidigt udelukkende niveauer der vises som ét valg (eget/relateret/alle). Team-scope tilføjes senere som et
 * ekstra niveau i samme sæt — ingen skemaændring (overrides gemmer blot nøgler).
 */
import type { Permission } from './permissions'

export type PermissionGroupKey = 'customers' | 'cases' | 'planning' | 'tasks' | 'offers' | 'materials' | 'finance' | 'administration'

export const PERMISSION_GROUP_LABELS: Record<PermissionGroupKey, string> = {
  customers: 'Kunder', cases: 'Sager', planning: 'Planlægning', tasks: 'Opgaver', offers: 'Tilbud',
  materials: 'Materialer', finance: 'Økonomi', administration: 'Administration',
}

/** Gruppe ud fra nøglens præfiks (første led) — eksplicit liste, så nye præfikser fanges af testen */
const PREFIX_GROUP: Record<string, PermissionGroupKey> = {
  customers: 'customers', leads: 'customers', inbox: 'customers',
  cases: 'cases', service: 'cases', documents: 'cases', work_orders: 'cases',
  calendar: 'planning', absences: 'planning', time: 'planning', time_logs: 'planning',
  tasks: 'tasks',
  offers: 'offers', tools: 'offers',
  materials: 'materials', other_costs: 'materials', products: 'materials', suppliers: 'materials',
  economy: 'finance', invoices: 'finance', bank: 'finance', incoming_invoices: 'finance', reports: 'finance',
  settings: 'administration', users: 'administration', employees: 'administration',
}

export function permissionGroup(p: Permission): PermissionGroupKey | null {
  return PREFIX_GROUP[p.split('.')[0]] ?? null
}

/** Scope-niveauer (lav → høj). Tilføj senere fx 'cases.view.team' mellem de to — ingen skemaændring. */
export const SCOPE_SETS: Array<{ label: string; levels: Array<{ key: Permission; label: string }> }> = [
  { label: 'Se sager', levels: [{ key: 'cases.view.assigned', label: 'Egne/tildelte' }, { key: 'cases.view.all', label: 'Alle' }] },
  { label: 'Ret sager', levels: [{ key: 'cases.edit.own', label: 'Egne/tildelte' }, { key: 'cases.edit', label: 'Alle' }] },
  { label: 'Se arbejdsordrer', levels: [{ key: 'work_orders.view.assigned', label: 'Tildelte' }, { key: 'work_orders.view.all', label: 'Alle' }] },
  { label: 'Kalender', levels: [{ key: 'calendar.view.own', label: 'Egen' }, { key: 'calendar.view.all', label: 'Alle' }] },
  { label: 'Se timer', levels: [{ key: 'time_logs.view.own', label: 'Egne' }, { key: 'time_logs.view.all', label: 'Alle' }] },
  { label: 'Ret timer', levels: [{ key: 'time_logs.edit.own', label: 'Egne' }, { key: 'time_logs.edit.all', label: 'Alle' }] },
  { label: 'Se tilbud', levels: [{ key: 'offers.view', label: 'Egne/relaterede' }, { key: 'offers.view.all', label: 'Alle' }] },
  { label: 'Se fakturaer', levels: [{ key: 'invoices.view.own_cases', label: 'Egne sager' }, { key: 'invoices.view.all', label: 'Alle' }] },
]
