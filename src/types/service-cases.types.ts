// =====================================================
// Service Cases Types
// =====================================================

export const SERVICE_CASE_STATUSES = ['new', 'in_progress', 'pending', 'closed', 'converted'] as const
export type ServiceCaseStatus = (typeof SERVICE_CASE_STATUSES)[number]

export const SERVICE_CASE_STATUS_LABELS: Record<ServiceCaseStatus, string> = {
  new: 'Ny',
  in_progress: 'I gang',
  pending: 'Afventer',
  closed: 'Lukket',
  converted: 'Konverteret til Ordre',
}

export const SERVICE_CASE_STATUS_COLORS: Record<ServiceCaseStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  pending: 'bg-orange-100 text-orange-800',
  closed: 'bg-green-100 text-green-800',
  converted: 'bg-purple-100 text-purple-800',
}

export const SERVICE_CASE_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type ServiceCasePriority = (typeof SERVICE_CASE_PRIORITIES)[number]

export const SERVICE_CASE_PRIORITY_LABELS: Record<ServiceCasePriority, string> = {
  low: 'Lav',
  medium: 'Normal',
  high: 'Høj',
  urgent: 'Akut',
}

export const SERVICE_CASE_PRIORITY_COLORS: Record<ServiceCasePriority, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

export const SERVICE_CASE_SOURCES = ['email', 'phone', 'portal', 'manual'] as const
export type ServiceCaseSource = (typeof SERVICE_CASE_SOURCES)[number]

export const SERVICE_CASE_SOURCE_LABELS: Record<ServiceCaseSource, string> = {
  email: 'Email',
  phone: 'Telefon',
  portal: 'Kundeportal',
  manual: 'Manuel',
}

// Sprint 2 — sag/ordre type classification (added via migration 00098).
export const SERVICE_CASE_TYPES = [
  'solar',
  'service',
  'installation',
  'project',
  'akut',
  'general',
] as const
export type ServiceCaseType = (typeof SERVICE_CASE_TYPES)[number]

export const SERVICE_CASE_TYPE_LABELS: Record<ServiceCaseType, string> = {
  solar: 'Solcelleanlæg',
  service: 'Service',
  installation: 'El-installation',
  project: 'Projekt',
  akut: 'Akut udkald',
  general: 'Generelt',
}

export interface ChecklistItem {
  key: string
  label: string
  required: boolean
  completed: boolean
  completed_at: string | null
  attachment_id?: string | null
}

export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { key: 'inverter_photo', label: 'Foto af inverter', required: true, completed: false, completed_at: null },
  { key: 'tavle_photo', label: 'Foto af eltavle', required: true, completed: false, completed_at: null },
  { key: 'panel_photo', label: 'Foto af paneler', required: true, completed: false, completed_at: null },
  { key: 'before_photo', label: 'Foto før arbejde', required: false, completed: false, completed_at: null },
  { key: 'after_photo', label: 'Foto efter arbejde', required: false, completed: false, completed_at: null },
  { key: 'notes_added', label: 'Noter tilføjet', required: false, completed: false, completed_at: null },
]

/**
 * Check if a service case can be closed (all required checklist items completed)
 */
export function canCloseCase(checklist: ChecklistItem[]): boolean {
  if (!checklist || checklist.length === 0) return true
  return checklist.filter((i) => i.required).every((i) => i.completed)
}

export interface ServiceCaseAttachment {
  id: string
  service_case_id: string
  file_name: string
  file_url: string
  storage_path: string | null
  mime_type: string
  file_size: number | null
  category: 'inverter_photo' | 'panel_photo' | 'tavle_photo' | 'before_photo' | 'after_photo' | 'signature' | 'other'
  notes: string | null
  uploaded_by: string | null
  created_at: string
}

export interface ServiceCase {
  id: string
  case_number: string
  customer_id: string | null
  title: string
  description: string | null
  status: ServiceCaseStatus
  priority: ServiceCasePriority
  source: ServiceCaseSource
  source_email_id: string | null
  assigned_to: string | null
  status_note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  // Address fields
  address: string | null
  postal_code: string | null
  city: string | null
  floor_door: string | null
  latitude: number | null
  longitude: number | null
  contact_phone: string | null
  // Admin fields
  ksr_number: string | null
  ean_number: string | null
  // Checklist & signature
  checklist: ChecklistItem[]
  customer_signature: string | null
  customer_signature_name: string | null
  signed_at: string | null
  // Ordrestyring integration
  os_case_id: string | null
  os_synced_at: string | null
  // ---- Sprint 2 — sag/ordre fields (migration 00098) ----
  // Display + classification
  project_name: string | null
  type: ServiceCaseType | null
  // External + customer references
  reference: string | null
  requisition: string | null
  // People responsible
  formand_id: string | null
  // Planning + economics
  planned_hours: number | null
  contract_sum: number | null   // tilbudt beløb
  revised_sum: number | null    // revideret beløb
  budget: number | null         // intern cost budget
  start_date: string | null
  end_date: string | null
  // Workflow flags (mirror Phase 7/8 work_orders)
  auto_invoice_on_done: boolean
  low_profit: boolean
  // Optional offer that produced this sag
  source_offer_id: string | null
  // ---- Sprint 8G — betalende kunde vs. leveringskunde (migration 00111) ----
  /** Kontaktperson på stedet — FK customer_contacts. Nullable. */
  site_contact_id: string | null
  /** Leveringskunde / slutkunde hvis forskellig fra betaler — FK customers. Nullable. */
  site_customer_id: string | null
  /** Praktiske noter til arbejdssted (adgangskode, parkering, hund, etc.). */
  access_notes: string | null
  // ---- Sprint 9E Phase 1 — sagspartner-model (migration 00112) ----
  /** Ordregiver — den der bestilte opgaven. Backfilled til customer_id. */
  orderer_customer_id: string | null
  /** Slutkunde / anlægsejer. Kan = orderer ved B2C. Backfilled til site_customer_id ?? customer_id. */
  end_customer_id: string | null
  /** Hvem får tilbud/faktura. Mail-router bruger denne fra Phase 6. */
  payer_customer_id: string | null
  /** Forhandler/købssted hvis customer-row findes. Får ALDRIG mail automatisk. */
  purchased_from_customer_id: string | null
  /** Fritekst-købssted hvis ingen customer-row passer ("Direkte", "Bilka"). */
  purchase_source: string | null
  /** Deskriptiv markering af payer-relation. Autoritativ kilde er payer_customer_id. */
  billing_mode: ServiceCaseBillingMode | null
}

/** Sprint 9E Phase 1 — billing_mode CHECK-værdier. */
export type ServiceCaseBillingMode =
  | 'same_as_customer'
  | 'orderer_pays'
  | 'end_customer_pays'
  | 'third_party_pays'
  | 'unknown'

export const BILLING_MODE_LABELS: Record<ServiceCaseBillingMode, string> = {
  same_as_customer: 'Samme som kunde (B2C / direkte)',
  orderer_pays: 'Ordregiver betaler',
  end_customer_pays: 'Slutkunde betaler',
  third_party_pays: 'Tredje part betaler',
  unknown: 'Ikke afklaret endnu',
}

export interface ServiceCaseWithRelations extends ServiceCase {
  customer?: {
    id: string
    company_name: string
    contact_person: string | null
    email: string | null
    phone: string | null
  } | null
  /** Sprint 8G — leveringskunde (separat customer-row hvis forskellig fra betaler). */
  site_customer?: {
    id: string
    company_name: string
    contact_person: string | null
    email: string | null
    phone: string | null
  } | null
  /** Sprint 8G — kontaktperson på stedet. */
  site_contact?: {
    id: string
    name: string
    email: string | null
    phone: string | null
    mobile: string | null
    role: string | null
  } | null
  /** Sprint 9E — sagspartnere (alle valgfrie joins). */
  orderer_customer?: {
    id: string
    company_name: string
    contact_person: string | null
    email: string | null
  } | null
  end_customer?: {
    id: string
    company_name: string
    contact_person: string | null
    email: string | null
  } | null
  payer_customer?: {
    id: string
    company_name: string
    contact_person: string | null
    email: string | null
  } | null
  purchased_from_customer?: {
    id: string
    company_name: string
  } | null
  assignee?: {
    id: string
    full_name: string | null
  } | null
  attachments?: ServiceCaseAttachment[]
}
