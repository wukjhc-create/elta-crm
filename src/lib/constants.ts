export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Elta CRM'
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
export const DEFAULT_LOCALE = process.env.NEXT_PUBLIC_DEFAULT_LOCALE || 'da'

// File upload constants
export const MAX_FILE_SIZE = parseInt(process.env.NEXT_PUBLIC_MAX_FILE_SIZE || '10485760') // 10MB
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
