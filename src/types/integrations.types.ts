// =====================================================
// EXTERNAL INTEGRATIONS TYPES
// =====================================================

// Integration types
export type IntegrationType = 'generic' | 'economic' | 'dinero' | 'billy' | 'webhook'
export type AuthType = 'none' | 'bearer' | 'basic' | 'api_key' | 'oauth2'

// Webhook event types
export type WebhookEventType =
  | 'offer.created'
  | 'offer.updated'
  | 'offer.sent'
  | 'offer.viewed'
  | 'offer.accepted'
  | 'offer.rejected'
  | 'offer.expired'
  | 'project.created'
  | 'project.updated'
  | 'project.status_changed'
  | 'project.completed'
  | 'project.cancelled'
  | 'customer.created'
  | 'customer.updated'
  | 'custom'

// Endpoint operations
export type EndpointOperation =
  | 'create_order'
  | 'update_order'
  | 'get_order'
  | 'create_invoice'
  | 'sync_products'
  | 'sync_customers'
  | 'custom'

// Queue statuses
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

// Sync statuses
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error'

// Log types
export type LogType = 'webhook_sent' | 'webhook_received' | 'api_call' | 'sync' | 'error'

// =====================================================
// INTEGRATION
// =====================================================

export interface Integration {
  id: string
  name: string
  description: string | null
  integration_type: IntegrationType
  is_active: boolean

  // API Configuration
  base_url: string | null
  api_key: string | null
  api_secret: string | null
  auth_type: AuthType
  auth_header_name: string

  // OAuth2
  oauth_token_url: string | null
  oauth_client_id: string | null
  oauth_client_secret: string | null
  oauth_access_token: string | null
  oauth_refresh_token: string | null
  oauth_expires_at: string | null

  // Request config
  default_headers: Record<string, string>
  timeout_ms: number
  retry_count: number

  // Field mappings
  field_mappings: FieldMappings

  // Status
  last_sync_at: string | null
  last_error: string | null
  error_count: number

  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FieldMappings {
  offer?: Record<string, string>
  project?: Record<string, string>
  customer?: Record<string, string>
  line_item?: Record<string, string>
}

export interface IntegrationWithRelations extends Integration {
  webhooks?: IntegrationWebhook[]
  endpoints?: IntegrationEndpoint[]
  creator?: {
    id: string
    full_name: string | null
    email: string
  }
}

// =====================================================
// WEBHOOK
// =====================================================

export interface IntegrationWebhook {
  id: string
  integration_id: string
  name: string
  url: string
  http_method: string
  event_type: WebhookEventType
  filter_conditions: Record<string, unknown>
  headers: Record<string, string>
  payload_template: Record<string, unknown> | null
  is_active: boolean

  // Statistics
  success_count: number
  failure_count: number
  last_triggered_at: string | null
  last_success_at: string | null
  last_failure_at: string | null
  last_error: string | null

  created_at: string
  updated_at: string
}

// =====================================================
// ENDPOINT
// =====================================================

export interface IntegrationEndpoint {
  id: string
  integration_id: string
  name: string
  description: string | null
  endpoint_path: string
  http_method: string
  operation: EndpointOperation
  request_template: Record<string, unknown> | null
  response_mapping: Record<string, unknown> | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// =====================================================
// LOG
// =====================================================

export interface IntegrationLog {
  id: string
  integration_id: string | null
  webhook_id: string | null
  endpoint_id: string | null
  log_type: LogType
  event_type: string | null

  // Related entities
  offer_id: string | null
  project_id: string | null
  customer_id: string | null

  // Request
  request_url: string | null
  request_method: string | null
  request_headers: Record<string, string> | null
  request_body: Record<string, unknown> | null

  // Response
  response_status: number | null
  response_headers: Record<string, string> | null
  response_body: Record<string, unknown> | null

  // Result
  success: boolean
  error_message: string | null
  duration_ms: number | null

  triggered_by: string | null
  created_at: string
}

export interface IntegrationLogWithRelations extends IntegrationLog {
  integration?: { id: string; name: string } | null
  webhook?: { id: string; name: string } | null
  endpoint?: { id: string; name: string } | null
  offer?: { id: string; offer_number: string; title: string } | null
  project?: { id: string; project_number: string; name: string } | null
}

// =====================================================
// QUEUE
// =====================================================

export interface IntegrationQueueItem {
  id: string
  integration_id: string
  webhook_id: string | null
  endpoint_id: string | null
  operation: string
  payload: Record<string, unknown>
  offer_id: string | null
  project_id: string | null
  status: QueueStatus
  attempts: number
  max_attempts: number
  next_attempt_at: string | null
  last_error: string | null
  scheduled_at: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}

// =====================================================
// EXTERNAL REFERENCE
// =====================================================

export type EntityType = 'offer' | 'project' | 'customer' | 'product' | 'invoice'

export interface ExternalReference {
  id: string
  integration_id: string
  entity_type: EntityType
  entity_id: string
  external_id: string
  external_number: string | null
  external_url: string | null
  last_synced_at: string | null
  sync_status: SyncStatus
  external_data: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// =====================================================
// INPUT TYPES
// =====================================================

export interface CreateIntegrationInput {
  name: string
  description?: string
  integration_type: IntegrationType
  is_active?: boolean
  base_url?: string
  api_key?: string
  api_secret?: string
  auth_type?: AuthType
  auth_header_name?: string
  default_headers?: Record<string, string>
  timeout_ms?: number
  retry_count?: number
  field_mappings?: FieldMappings
}

export interface UpdateIntegrationInput extends Partial<CreateIntegrationInput> {
  id: string
}

export interface CreateWebhookInput {
  integration_id: string
  name: string
  url: string
  http_method?: string
  event_type: WebhookEventType
  filter_conditions?: Record<string, unknown>
  headers?: Record<string, string>
  payload_template?: Record<string, unknown>
  is_active?: boolean
}

export interface UpdateWebhookInput extends Partial<Omit<CreateWebhookInput, 'integration_id'>> {
  id: string
}

export interface CreateEndpointInput {
  integration_id: string
  name: string
  description?: string
  endpoint_path: string
  http_method?: string
  operation: EndpointOperation
  request_template?: Record<string, unknown>
  response_mapping?: Record<string, unknown>
  is_active?: boolean
}

export interface UpdateEndpointInput extends Partial<Omit<CreateEndpointInput, 'integration_id'>> {
  id: string
}

// =====================================================
// WEBHOOK PAYLOAD TYPES
// =====================================================

export interface WebhookPayload {
  event: WebhookEventType
  timestamp: string
  data: WebhookOfferData | WebhookProjectData | WebhookCustomerData
}

export interface WebhookOfferData {
  type: 'offer'
  id: string
  offer_number: string
  title: string
  status: string
  customer?: {
    id: string
    company_name: string
    contact_person: string
    email: string
  }
  total_amount: number
  final_amount: number
  currency: string
  line_items?: Array<{
    description: string
    quantity: number
    unit: string
    unit_price: number
    total: number
  }>
  created_at: string
  accepted_at?: string
  rejected_at?: string
}

export interface WebhookProjectData {
  type: 'project'
  id: string
  project_number: string
  name: string
  status: string
  priority: string
  customer?: {
    id: string
    company_name: string
  }
  offer?: {
    id: string
    offer_number: string
  }
  budget: number
  start_date?: string
  end_date?: string
  created_at: string
}

export interface WebhookCustomerData {
  type: 'customer'
  id: string
  customer_number: string
  company_name: string
  contact_person: string
  email: string
  phone?: string
  address?: string
  created_at: string
}

// =====================================================
// UI HELPERS
// =====================================================

export const INTEGRATION_TYPE_LABELS: Record<IntegrationType, string> = {
  generic: 'Generisk API',
  economic: 'e-conomic',
  dinero: 'Dinero',
  billy: 'Billy',
  webhook: 'Kun webhooks',
}

export const AUTH_TYPE_LABELS: Record<AuthType, string> = {
  none: 'Ingen',
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
  api_key: 'API Nøgle',
  oauth2: 'OAuth 2.0',
}

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
  'offer.created': 'Tilbud oprettet',
  'offer.updated': 'Tilbud opdateret',
  'offer.sent': 'Tilbud sendt',
  'offer.viewed': 'Tilbud set',
  'offer.accepted': 'Tilbud accepteret',
  'offer.rejected': 'Tilbud afvist',
  'offer.expired': 'Tilbud udløbet',
  'project.created': 'Projekt oprettet',
  'project.updated': 'Projekt opdateret',
  'project.status_changed': 'Projekt status ændret',
  'project.completed': 'Projekt afsluttet',
  'project.cancelled': 'Projekt annulleret',
  'customer.created': 'Kunde oprettet',
  'customer.updated': 'Kunde opdateret',
  'custom': 'Brugerdefineret',
}

export const ENDPOINT_OPERATION_LABELS: Record<EndpointOperation, string> = {
  create_order: 'Opret ordre',
  update_order: 'Opdater ordre',
  get_order: 'Hent ordre',
  create_invoice: 'Opret faktura',
  sync_products: 'Synkroniser produkter',
  sync_customers: 'Synkroniser kunder',
  custom: 'Brugerdefineret',
}

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  pending: 'Afventer',
  processing: 'Behandler',
  completed: 'Fuldført',
  failed: 'Fejlet',
  cancelled: 'Annulleret',
}

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  synced: 'Synkroniseret',
  pending: 'Afventer',
  conflict: 'Konflikt',
  error: 'Fejl',
}

export const LOG_TYPE_LABELS: Record<LogType, string> = {
  webhook_sent: 'Webhook sendt',
  webhook_received: 'Webhook modtaget',
  api_call: 'API kald',
  sync: 'Synkronisering',
  error: 'Fejl',
}
