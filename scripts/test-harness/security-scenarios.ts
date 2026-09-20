/**
 * Test Harness — sikkerheds-scenarier (deklarative). Hver beskriver et
 * FORSOEG der SKAL afvises. Selve udfoerelsen mod staging (som anon/non-admin/
 * montoer via RLS) implementeres i scenario-runner naar staging findes; her
 * defineres kontrakten + forventet udfald, saa den er reviewbar nu.
 */

export type SecurityRole = 'anon' | 'authenticated_non_admin' | 'montoer' | 'admin' | 'service_role'

export interface SecurityScenario {
  id: string
  title: string
  /** Rolle forsoeget udfoeres som. */
  as: SecurityRole
  description: string
  /** true = forsoeget SKAL afvises (0 rows / fejl / ingen effekt). */
  mustBeDenied: boolean
}

export const SECURITY_SCENARIOS: SecurityScenario[] = [
  { id: 'nonadmin_read_agent_data', title: 'Non-admin læser Agent Core-data', as: 'authenticated_non_admin', description: 'SELECT paa agent_runs/actions => 0 rows (RLS admin-only).', mustBeDenied: true },
  { id: 'montoer_read_economy', title: 'Montør læser økonomi/admin-data', as: 'montoer', description: 'Adgang til invoices/economy => afvist af RLS/permissions.', mustBeDenied: true },
  { id: 'anon_read_agent_data', title: 'Anon læser Agent Core-data', as: 'anon', description: 'Anon har ingen grants/policies => 0 rows.', mustBeDenied: true },
  { id: 'manipulated_customer_id_link', title: 'Manipuleret customer_id i link_customer', as: 'authenticated_non_admin', description: 'Valgt kunde ikke blandt forslagets kandidater => afvist (tamper).', mustBeDenied: true },
  { id: 'stale_approval_execute', title: 'Eksekvering med udløbet approval', as: 'service_role', description: 'Approval udløbet (expires_at) => is_executable false => afvist.', mustBeDenied: true },
  { id: 'duplicate_execution', title: 'Dobbelt-eksekvering af samme action', as: 'service_role', description: 'Gentaget executeAction paa executed => noop (ingen ny effekt).', mustBeDenied: true },
  { id: 'invalid_portal_token', title: 'Ugyldigt portal-token', as: 'anon', description: 'Portal-adgang med ugyldigt/udløbet token => afvist.', mustBeDenied: true },
  { id: 'storage_access_no_right', title: 'Storage-adgang uden rettighed', as: 'anon', description: 'Anon list/download i private buckets => 0/403.', mustBeDenied: true },
  { id: 'disabled_agent_execute', title: 'Eksekvering med disabled agent', as: 'service_role', description: 'Executor afviser naar agent_configs.enabled=false.', mustBeDenied: true },
  { id: 'hardblocked_without_approval', title: 'Hard-blocked side effect uden approval', as: 'service_role', description: 'send/push/finance/delete uden approval => trigger/Executor afviser.', mustBeDenied: true },
]

/** Hjaelper: en scenario-koersel er "grøn" hvis det afviste udfald matcher mustBeDenied. */
export function scenarioPassed(scenario: SecurityScenario, wasDenied: boolean): boolean {
  return scenario.mustBeDenied === wasDenied
}
