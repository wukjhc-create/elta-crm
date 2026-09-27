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
  { id: 'P-004', severity: 'S1', area: 'Anon-eksponering', title: 'Anon kunne læse leverandørpriser via views og kalde audit-/rolle-funktioner', closed: false,
    pending: 'Migration 00162 i prod (afventer Henriks godkendelse)' },
  { id: 'P-003', severity: 'S3', area: 'Crons', title: 'Supplier-sync (og 3 andre crons) kører med anon-klient → stille no-op', closed: false,
    pending: 'Henriks beslutning om at aktivere rettelsen (CRON_DISCOVERY F1–F4)' },
  { id: 'P-002', severity: 'S2', area: 'RLS/views', title: 'v_recent_audit_logs omgik RLS', closed: true },
  { id: 'P-001', severity: 'S2', area: 'Leverandør-credentials', title: 'Ugatet server action med dekrypterede credentials', closed: true },
  { id: 'P-000', severity: 'S2', area: 'RLS/rolleadgang', title: '8 følsomme tabeller åbne for alle indloggede', closed: true },
]
