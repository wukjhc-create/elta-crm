export type ProfitSnapshotSource =
  | 'manual'
  | 'invoice_created'
  | 'work_order_done'
  | 'recompute'

export interface WorkOrderProfit {
  workOrderId: string
  revenue: number
  laborCost: number
  /** 00248: materialCost, totalCost, profit og marginPercentage er null, når et materiale mangler kost */
  materialCost: number | null
  totalCost: number | null
  profit: number | null
  marginPercentage: number | null
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
  /** 00248: material_cost, total_cost, profit og margin_percentage er null, når et materiale mangler kost */
  material_cost: number | null
  total_cost: number | null
  profit: number | null
  margin_percentage: number | null
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
