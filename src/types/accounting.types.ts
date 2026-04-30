export type AccountingProvider = 'economic'

export interface AccountingSettings {
  id: string
  provider: AccountingProvider
  api_token: string | null
  agreement_grant_token: string | null
  active: boolean
  last_sync_at: string | null
  config: EconomicConfig
  created_at: string
  updated_at: string
}

export interface EconomicConfig {
  /** e-conomic invoice layout number — required for booking. */
  layoutNumber?: number
  /** Default payment terms (e.g. Net 14 days). */
  paymentTermsNumber?: number
  /** VAT zone (1 = domestic Denmark). */
  vatZoneNumber?: number
  /** Fallback product number for free-text lines (must exist in e-conomic). */
  defaultProductNumber?: string
  /** Cashbook journal number used for "mark paid" entries. */
  cashbookNumber?: number
  /** Bank GL account that gets debited when a payment lands. */
  bankContraAccountNumber?: number
  /** Auto-book drafts after creating them. */
  autoBookOnCreate?: boolean
  /** Default e-conomic customer-group number for new customers. */
  defaultCustomerGroupNumber?: number
}

export type AccountingEntityType = 'customer' | 'invoice' | 'payment'
export type AccountingAction = 'create' | 'update' | 'mark_paid' | 'skip'
export type AccountingStatus = 'success' | 'failed' | 'skipped'

export interface AccountingSyncLogRow {
  id: string
  provider: AccountingProvider
  entity_type: AccountingEntityType
  entity_id: string
  action: AccountingAction
  status: AccountingStatus
  external_id: string | null
  error_message: string | null
  request_meta: Record<string, unknown> | null
  response_meta: Record<string, unknown> | null
  created_at: string
}

export interface EconomicResult<T = unknown> {
  ok: boolean
  status: AccountingStatus
  externalId?: string
  data?: T
  error?: string
  reason?: string
}
