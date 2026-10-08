/**
 * Kolonnelister for time_logs (RLS-plan for kostkolonner, docs/runbooks/rls-cost-columns.md). Bevidst IKKE 'use server'.
 *
 * Fra migration 00192 må rollen `authenticated` (bruger-klienten) IKKE læse kost/løn-kolonnerne `cost_amount` og
 * `cost_rate_snapshot` — så salg og montør heller ikke kan læse dem direkte via API'et. Bruger-klienten vælger derfor
 * kun PUBLIC-kolonnerne (aldrig '*'); kost læses med admin-klienten EFTER en permission-gate.
 */
export const TIME_LOG_COST_COLUMNS = ['cost_amount', 'cost_rate_snapshot'] as const

export const TIME_LOG_PUBLIC_COLUMNS =
  'id, employee_id, work_order_id, start_time, end_time, hours, pay_rate_type, employee_rate_id, sale_rate_snapshot, ' +
  'sale_amount, description, billable, invoice_line_id, created_at, approval_status, approved_by, approved_at, rejection_reason'
