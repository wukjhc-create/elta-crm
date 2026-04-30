export type AutomationTrigger =
  | 'offer_created'
  | 'offer_accepted'
  | 'invoice_created'
  | 'invoice_overdue'
  | 'work_order_done'
  | 'new_customer'

export type AutomationAction =
  | 'send_email'
  | 'create_task'
  | 'create_invoice_from_offer'
  | 'create_invoice_from_work_order'
  | 'send_reminder'
  | 'notify'

export type AutomationEntity = 'offer' | 'invoice' | 'work_order' | 'customer'
export type AutomationStatus = 'executed' | 'skipped' | 'failed' | 'dry_run'

export interface AutomationRuleRow {
  id: string
  name: string
  trigger: AutomationTrigger
  condition_json: Record<string, ConditionExpr>
  action: AutomationAction
  action_config: Record<string, unknown>
  active: boolean
  dry_run: boolean
  created_at: string
  updated_at: string
}

export interface AutomationExecutionRow {
  id: string
  rule_id: string
  entity_type: AutomationEntity
  entity_id: string
  status: AutomationStatus
  result: Record<string, unknown> | null
  error_message: string | null
  created_at: string
}

export type ConditionOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'

export interface ConditionExpr {
  op: ConditionOp
  value: unknown
}

export interface AutomationEvent<T = Record<string, unknown>> {
  trigger: AutomationTrigger
  entityType: AutomationEntity
  entityId: string
  payload: T
  /** When true, no real side effects happen anywhere. */
  globalDryRun?: boolean
}

export interface ActionContext {
  rule: AutomationRuleRow
  event: AutomationEvent
}

export interface ActionResult {
  ok: boolean
  message?: string
  data?: Record<string, unknown>
}
