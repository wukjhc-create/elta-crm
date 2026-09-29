/**
 * Incident-register til Pilot Health (P1 #10). Kilde til sandhed er docs/pilot/INCIDENT_LOG.md;
 * `npm run ops:incident-check` fejler hvis id'er eller lukket-status ikke matcher dokumentet.
 */
export type IncidentSeverity = 'S1' | 'S2' | 'S3' | 'S4'

export interface IncidentEntry {
  id: string
  severity: IncidentSeverity
  area: string
  title: string
  closed: boolean
  /** Hvad der mangler for at lukke den (kun aabne). */
  pending?: string
}

export const INCIDENT_REGISTER: IncidentEntry[] = [
  { id: 'P-007', severity: 'S3', area: 'Leverandørfaktura-RLS', title: 'Fakturalinjer og audit-log åbne for alle indloggede (audit kan manipuleres)', closed: true },
  { id: 'P-008', severity: 'S2', area: 'Leverandør-RLS', title: 'suppliers skrivbar/slettelig for alle indloggede (CASCADE til ~324k priser)', closed: false,
    pending: 'Migration 00168 i prod' },
  { id: 'P-009', severity: 'S2', area: 'RLS-skrivemodel', title: '109 tabeller med åbne skrive-policies for indloggede (RBAC kun i app-laget)', closed: false,
    pending: 'Domæne-vise lockdown-migrationer (plan i backlog)' },
  { id: 'P-006', severity: 'S3', area: 'Server-action-RBAC', title: 'Mange skrivende server-actions uden rettighedstjek — alle gatet eller bevist undtaget; CI-blokerende audit', closed: true },
  { id: 'P-005', severity: 'S3', area: 'Pris/leverandør-RBAC', title: 'Pris-/leverandør-actions uden rettighedstjek; supplier_settings skrivbar for alle indloggede', closed: true },
  { id: 'P-004', severity: 'S1', area: 'Anon-eksponering', title: 'Anon kunne læse leverandørpriser via views og kalde audit-/rolle-funktioner', closed: true },
  { id: 'P-003', severity: 'S3', area: 'Crons', title: 'Supplier-sync (og 3 andre crons) kører med anon-klient → stille no-op', closed: false,
    pending: 'Henriks beslutning om at aktivere rettelsen (CRON_DISCOVERY F1–F4)' },
  { id: 'P-002', severity: 'S2', area: 'RLS/views', title: 'v_recent_audit_logs omgik RLS', closed: true },
  { id: 'P-001', severity: 'S2', area: 'Leverandør-credentials', title: 'Ugatet server action med dekrypterede credentials', closed: true },
  { id: 'P-000', severity: 'S2', area: 'RLS/rolleadgang', title: '8 følsomme tabeller åbne for alle indloggede', closed: true },
]
