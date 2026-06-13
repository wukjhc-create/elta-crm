/**
 * Workforce types — work_orders + time_logs (Phase 7-9).
 *
 * Employee types live in src/types/employees.types.ts (Sprint 4B).
 * This file used to duplicate EmployeeRow/EmployeeRole with a stale
 * subset (3 roles vs the 8 in DB). Re-exports below keep the legacy
 * import paths working without divergence.
 */

import type {
  EmployeeRow as EmployeeRowFull,
  EmployeeRole as EmployeeRoleFull,
} from './employees.types'

// Re-export so existing imports keep working.
export type EmployeeRow = EmployeeRowFull
export type EmployeeRole = EmployeeRoleFull

export type WorkOrderStatus = 'planned' | 'in_progress' | 'done' | 'cancelled'

export interface WorkOrderRow {
  id: string
  case_id: string | null
  customer_id: string | null
  title: string
  description: string | null
  status: WorkOrderStatus
  scheduled_date: string | null
  assigned_employee_id: string | null
  source_offer_id: string | null
  auto_invoice_on_done: boolean
  low_profit: boolean              // added migration 00089
  completed_at: string | null
  created_at: string
  updated_at: string
}

// Sprint Ø2.9 — satstype for en timeregistrering (matcher time_logs CHECK)
export type PayRateType = 'normal' | 'ot1' | 'ot2' | 'weekend' | 'holiday' | 'standby' | 'other'

export const PAY_RATE_TYPE_OPTIONS: Array<{ value: PayRateType; label: string }> = [
  { value: 'normal', label: 'Normal tid' },
  { value: 'ot1', label: 'Overtid 50%' },
  { value: 'ot2', label: 'Overtid 100%' },
  { value: 'weekend', label: 'Weekend' },
  { value: 'holiday', label: 'Helligdag' },
  { value: 'standby', label: 'Vagt/rådighed' },
  { value: 'other', label: 'Andet' },
]

export const PAY_RATE_TYPE_LABEL = new Map(PAY_RATE_TYPE_OPTIONS.map((o) => [o.value, o.label]))

export interface TimeLogRow {
  id: string
  employee_id: string
  work_order_id: string
  start_time: string
  end_time: string | null
  hours: number | null
  cost_amount: number | null       // added migration 00088 (trigger-computed)
  // Sprint Ø1.1/Ø2.9 — frosne snapshots + satstype (trigger-computed)
  pay_rate_type: PayRateType
  employee_rate_id: string | null
  cost_rate_snapshot: number | null
  sale_rate_snapshot: number | null
  sale_amount: number | null
  description: string | null
  billable: boolean
  invoice_line_id: string | null
  created_at: string
}

export interface EmployeeStats {
  employeeId: string
  activeTaskCount: number
  hoursToday: number
  hoursThisWeek: number
  activeTimer: TimeLogRow | null
}

export interface BillableLineSuggestion {
  workOrderId: string
  description: string
  quantity: number       // hours
  unit: 'time'
  unit_price: number     // sale price per hour (set by caller; service returns 0 — pricing is policy)
  source_time_log_ids: string[]
}
