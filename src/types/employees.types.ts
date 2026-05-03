export type EmployeeRole =
  | 'admin'
  | 'elektriker'
  | 'montør'
  | 'lærling'
  | 'projektleder'
  | 'kontor'
  // legacy values still acceptable on read
  | 'electrician'
  | 'installer'

export const EMPLOYEE_ROLE_OPTIONS: Array<{ value: EmployeeRole; label: string }> = [
  { value: 'elektriker',   label: 'Elektriker' },
  { value: 'montør',       label: 'Montør' },
  { value: 'lærling',      label: 'Lærling' },
  { value: 'projektleder', label: 'Projektleder' },
  { value: 'kontor',       label: 'Kontor' },
  { value: 'admin',        label: 'Admin' },
]

export interface EmployeeRow {
  id: string
  profile_id: string | null
  employee_number: string | null
  first_name: string | null
  last_name: string | null
  name: string                 // legacy "Full name" — derived from first/last when both present
  email: string
  role: EmployeeRole
  active: boolean
  address: string | null
  postal_code: string | null
  city: string | null
  phone: string | null
  hire_date: string | null
  termination_date: string | null
  notes: string | null
  hourly_rate: number | null   // mirror of compensation.sales_rate
  cost_rate: number | null     // mirror of compensation.internal_cost_rate
  created_at: string
  updated_at: string
}

export interface EmployeeCompensationRow {
  employee_id: string
  hourly_wage: number | null
  internal_cost_rate: number | null
  sales_rate: number | null
  pension_pct: number
  free_choice_pct: number
  vacation_pct: number
  sh_pct: number
  social_costs: number
  overhead_pct: number
  overtime_rate: number | null
  mileage_rate: number | null
  real_hourly_cost: number | null   // generated column
  notes: string | null
  created_at: string
  updated_at: string
}

export interface EmployeeWithCompensation extends EmployeeRow {
  compensation: EmployeeCompensationRow | null
}

export interface EmployeeProjectImpact {
  employeeId: string
  employeeName: string
  projectId: string | null
  projectName: string | null
  totalHours: number
  billableHours: number
  laborCost: number          // billable hours × internal_cost_rate
  laborRevenue: number       // billable hours × sales_rate
  contributionMargin: number // revenue - cost (DB)
}

export interface EmployeeCompensationHistoryRow {
  id: string
  employee_id: string
  hourly_wage: number | null
  internal_cost_rate: number | null
  sales_rate: number | null
  pension_pct: number | null
  free_choice_pct: number | null
  vacation_pct: number | null
  sh_pct: number | null
  social_costs: number | null
  overhead_pct: number | null
  overtime_rate: number | null
  mileage_rate: number | null
  real_hourly_cost: number | null
  effective_from: string
  changed_by: string | null
  change_reason: string | null
  created_at: string
}
