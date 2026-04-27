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
}

export interface ServiceCaseWithRelations extends ServiceCase {
  customer?: {
    id: string
    company_name: string
    contact_person: string | null
    email: string | null
    phone: string | null
  } | null
  assignee?: {
    id: string
    full_name: string | null
  } | null
  attachments?: ServiceCaseAttachment[]
}
