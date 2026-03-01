export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Elta CRM'
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
export const DEFAULT_LOCALE = process.env.NEXT_PUBLIC_DEFAULT_LOCALE || 'da'
export const DEFAULT_LOCALE_CODE = 'da-DK'

// File upload constants
export const MAX_FILE_SIZE = parseInt(process.env.NEXT_PUBLIC_MAX_FILE_SIZE || '10485760') // 10MB
export const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2MB for profile/logo images

// Webhook payload size limits
export const WEBHOOK_PAYLOAD_LIMITS = {
  SMS: 65_536, // 64KB
  EMAIL: 5_242_880, // 5MB
  INTEGRATION: 1_048_576, // 1MB
} as const
export const ALLOWED_FILE_TYPES =
  process.env.NEXT_PUBLIC_ALLOWED_FILE_TYPES?.split(',') || [
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.jpg',
    '.jpeg',
    '.png',
  ]

// Feature flags
export const ENABLE_REGISTRATION =
  process.env.NEXT_PUBLIC_ENABLE_REGISTRATION === 'true'
export const ENABLE_EMAIL_VERIFICATION =
  process.env.NEXT_PUBLIC_ENABLE_EMAIL_VERIFICATION === 'true'

// Pagination
export const DEFAULT_PAGE_SIZE = 10
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

// Date formats (Danish)
export const DATE_FORMAT = 'dd/MM/yyyy'
export const DATETIME_FORMAT = 'dd/MM/yyyy HH:mm'
export const TIME_FORMAT = 'HH:mm'

// Currency
export const DEFAULT_CURRENCY = 'DKK'
export const DEFAULT_TAX_RATE = 25 // 25% Danish VAT

// Offer & token validity
export const OFFER_VALIDITY_DAYS = 30
export const PORTAL_TOKEN_EXPIRY_DAYS = 30
export const FILE_SIGNED_URL_EXPIRY_SECONDS = 3600

// SMS configuration
export const SMS_CONFIG = {
  UNICODE_PART_LENGTH: 70,
  UNICODE_SEGMENT_LENGTH: 67,
  GSM_PART_LENGTH: 160,
  GSM_SEGMENT_LENGTH: 153,
  SENDER_NAME_MAX_LENGTH: 11,
  DANISH_COUNTRY_CODE: 45,
  DANISH_PHONE_LENGTH: 8,
  GATEWAY_API_SMS_ENDPOINT: 'https://gatewayapi.com/rest/mtsms',
  GATEWAY_API_INFO_ENDPOINT: 'https://gatewayapi.com/rest/me',
} as const

// Supplier API configuration
export const SUPPLIER_API_CONFIG = {
  DEFAULT_TIMEOUT_MS: 30000,
  DEFAULT_RETRY_ATTEMPTS: 3,
  DEFAULT_RETRY_DELAY_MS: 1000,
  CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  AUTH_TOKEN_TTL_MS: 60 * 60 * 1000, // 1 hour
  AO_API_BASE_URL: 'https://ao.dk',
  AO_WEBSITE_URL: 'https://ao.dk',
  LM_API_BASE_URL: 'https://api.lfrm.dk/v1',
  LM_WEBSITE_URL: 'https://www.lfrm.dk',
} as const

// Electrician calculation defaults
export const CALC_DEFAULTS = {
  HOURLY_RATES: {
    ELECTRICIAN: 495,
    APPRENTICE: 295,
    MASTER: 650,
    HELPER: 350,
  },
  MARGINS: {
    MATERIALS: 25,
    PRODUCTS: 20,
    SUBCONTRACTOR: 10,
    DEFAULT_DB_TARGET: 35,
    MINIMUM_DB: 20,
  },
  WORK_HOURS: {
    START: '07:00',
    END: '15:30',
    BREAK_MINUTES: 30,
    OVERTIME_MULTIPLIER: 1.5,
    WEEKEND_MULTIPLIER: 2.0,
  },
  PAYMENT_TERMS_DAYS: 14,
} as const

// Intelligence / monitoring thresholds
export const MONITORING_CONFIG = {
  MARGIN_WARNING_THRESHOLD: 15,
  MARGIN_CRITICAL_THRESHOLD: 5,
  PRICE_CHANGE_OFFER_THRESHOLD: 5,
  PRICE_CRITICAL_CHANGE_THRESHOLD: 20,
  SYNC_STALE_WARNING_DAYS: 7,
  SYNC_STALE_CRITICAL_DAYS: 14,
  STALE_PRODUCT_DAYS: 14,
  STALE_PRODUCT_MIN_COUNT: 50,
} as const

// Microsoft Graph / Mail Bridge
export const GRAPH_CONFIG = {
  DEFAULT_MAILBOX: 'crm@eltasolar.dk',
  MAX_MESSAGES_PER_POLL: 50,
  MAX_PAGES_PER_SYNC: 5,
  SYNC_INTERVAL_MINUTES: 5,
} as const

// Batch processing
export const BATCH_CONFIG = {
  SUPPLIER_SYNC_BATCH_SIZE: 50,
  MATERIAL_UPDATE_BATCH_SIZE: 10,
  API_CONCURRENT_REQUESTS: 5,
  IMPORT_PREVIEW_LIMIT: 100,
} as const

// Electrical calculation defaults (DS/HD 60364)
export const ELECTRICAL_DEFAULTS = {
  // Standard voltages in Denmark
  VOLTAGE_1PHASE: 230,
  VOLTAGE_3PHASE: 400,
  // Maximum voltage drop percentages
  MAX_VOLTAGE_DROP_LIGHTING: 3,
  MAX_VOLTAGE_DROP_OTHER: 5,
  MAX_VOLTAGE_DROP_TOTAL: 4, // Danish recommendation
  // Standard appliance power ratings (watts)
  APPLIANCE_POWER: {
    OVEN_3PHASE: 3600,
    INDUCTION: 7200,
    EV_CHARGER_11KW: 11000,
    EV_CHARGER_22KW: 22000,
    WASHING_MACHINE: 2200,
    DRYER: 2500,
    DISHWASHER: 2200,
    FLOOR_HEATING_PER_M2: 100,
    LED_SPOT: 10,
    LED_CEILING: 40,
    LED_PANEL: 60,
    STANDARD_OUTLET: 230, // For diversity calculation
    VENTILATION: 150,
  },
  // Circuit defaults
  MAX_OUTLETS_PER_CIRCUIT: 10,
  MAX_LIGHTS_PER_CIRCUIT: 20,
  // RCD sensitivity
  RCD_STANDARD_MA: 30,
  RCD_FIRE_PROTECTION_MA: 300,
  // Panel spare capacity target
  PANEL_SPARE_CAPACITY_PERCENT: 20,
} as const

// Learning engine configuration
export const LEARNING_CONFIG = {
  MIN_SAMPLE_SIZE: 3,
  HIGH_CONFIDENCE_THRESHOLD: 0.8,
  SIGNIFICANT_VARIANCE_PERCENT: 15,
  MAX_FEEDBACK_PER_COLLECTION: 100,
  PROFITABILITY_THRESHOLD: 1.1, // Within 10% of estimate = profitable
} as const

// Dashboard widget limits
export const DASHBOARD_LIMITS = {
  RECENT_ACTIVITY: 10,
  ACTIVITY_PER_TABLE: 5,
  UPCOMING_TASKS: 5,
  PENDING_OFFERS: 5,
} as const

// Lead statuses
export const LEAD_STATUSES = [
  { value: 'new', label: 'Ny', color: 'blue' },
  { value: 'contacted', label: 'Kontaktet', color: 'yellow' },
  { value: 'qualified', label: 'Kvalificeret', color: 'purple' },
  { value: 'proposal', label: 'Tilbud sendt', color: 'indigo' },
  { value: 'negotiation', label: 'Forhandling', color: 'orange' },
  { value: 'won', label: 'Vundet', color: 'green' },
  { value: 'lost', label: 'Tabt', color: 'red' },
] as const

// Lead sources
export const LEAD_SOURCES = [
  { value: 'website', label: 'Hjemmeside' },
  { value: 'referral', label: 'Henvisning' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefon' },
  { value: 'social', label: 'Sociale medier' },
  { value: 'other', label: 'Andet' },
] as const

// Offer statuses
export const OFFER_STATUSES = [
  { value: 'draft', label: 'Kladde', color: 'gray' },
  { value: 'sent', label: 'Sendt', color: 'blue' },
  { value: 'viewed', label: 'Set', color: 'purple' },
  { value: 'accepted', label: 'Accepteret', color: 'green' },
  { value: 'rejected', label: 'Afvist', color: 'red' },
  { value: 'expired', label: 'Udløbet', color: 'orange' },
] as const

// Project statuses
export const PROJECT_STATUSES = [
  { value: 'planning', label: 'Planlægning', color: 'blue' },
  { value: 'active', label: 'Aktiv', color: 'green' },
  { value: 'on_hold', label: 'På hold', color: 'yellow' },
  { value: 'completed', label: 'Afsluttet', color: 'gray' },
  { value: 'cancelled', label: 'Annulleret', color: 'red' },
] as const

// Project priorities
export const PROJECT_PRIORITIES = [
  { value: 'low', label: 'Lav', color: 'gray' },
  { value: 'medium', label: 'Mellem', color: 'blue' },
  { value: 'high', label: 'Høj', color: 'orange' },
  { value: 'urgent', label: 'Kritisk', color: 'red' },
] as const

// Message types
export const MESSAGE_TYPES = [
  { value: 'email', label: 'E-mail' },
  { value: 'sms', label: 'SMS' },
  { value: 'internal', label: 'Intern' },
  { value: 'note', label: 'Note' },
] as const

// Task statuses
export const TASK_STATUSES = [
  { value: 'todo', label: 'At gøre', color: 'gray' },
  { value: 'in_progress', label: 'I gang', color: 'blue' },
  { value: 'review', label: 'Til gennemsyn', color: 'purple' },
  { value: 'done', label: 'Færdig', color: 'green' },
] as const
