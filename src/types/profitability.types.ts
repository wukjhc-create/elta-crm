export type ProfitSnapshotSource =
  | 'manual'
  | 'invoice_created'
  | 'work_order_done'
  | 'recompute'

export interface WorkOrderProfit {
  workOrderId: string
  revenue: number
  laborCost: number
  materialCost: number
  totalCost: number
  profit: number
  marginPercentage: number
  revenueSource: 'invoice' | 'planned'
  invoiceId: string | null
  timeLogCount: number
  offerLineCount: number
  totalHours: number
}

export interface WorkOrderProfitSnapshotRow {
  id: string
  work_order_id: string
  revenue: number
  labor_cost: number
  material_cost: number
  total_cost: number
  profit: number
  margin_percentage: number
  source: ProfitSnapshotSource
  invoice_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface EmployeeProductivity {
  employeeId: string
  hours: number
  cost: number
  /** revenue ascribed to this employee from billed time logs (their hours × hourly_rate). */
  revenue: number
  /** revenue / cost ratio (1.0 = breakeven, > 1.0 = profitable). 0 if cost is 0. */
  productivity: number
}
