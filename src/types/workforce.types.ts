export type EmployeeRole = 'admin' | 'electrician' | 'installer'
export type WorkOrderStatus = 'planned' | 'in_progress' | 'done' | 'cancelled'

export interface EmployeeRow {
  id: string
  profile_id: string | null
  name: string
  email: string
  role: EmployeeRole
  active: boolean
  created_at: string
  updated_at: string
}

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
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface TimeLogRow {
  id: string
  employee_id: string
  work_order_id: string
  start_time: string
  end_time: string | null
  hours: number | null
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
