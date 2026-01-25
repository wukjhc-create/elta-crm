// Lead status enum
export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

// Lead source enum
export const LEAD_SOURCES = [
  'website',
  'referral',
  'email',
  'phone',
  'social',
  'other',
] as const

export type LeadSource = (typeof LEAD_SOURCES)[number]

// Status labels in Danish
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Ny',
  contacted: 'Kontaktet',
  qualified: 'Kvalificeret',
  proposal: 'Tilbud sendt',
  negotiation: 'Forhandling',
  won: 'Vundet',
  lost: 'Tabt',
}

// Source labels in Danish
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  website: 'Hjemmeside',
  referral: 'Henvisning',
  email: 'E-mail',
  phone: 'Telefon',
  social: 'Sociale medier',
  other: 'Andet',
}

// Status colors for badges
export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-purple-100 text-purple-800',
  proposal: 'bg-indigo-100 text-indigo-800',
  negotiation: 'bg-orange-100 text-orange-800',
  won: 'bg-green-100 text-green-800',
  lost: 'bg-red-100 text-red-800',
}

// Lead database type
export interface Lead {
  id: string
  company_name: string
  contact_person: string
  email: string
  phone: string | null
  status: LeadStatus
  source: LeadSource
  value: number | null
  probability: number | null
  expected_close_date: string | null
  notes: string | null
  assigned_to: string | null
  created_by: string
  created_at: string
  updated_at: string
  tags: string[]
  custom_fields: Record<string, unknown>
}

// Lead with relations
export interface LeadWithRelations extends Lead {
  assigned_to_profile?: {
    id: string
    full_name: string | null
    email: string
  } | null
  created_by_profile?: {
    id: string
    full_name: string | null
    email: string
  } | null
}

// Lead activity type
export interface LeadActivity {
  id: string
  lead_id: string
  activity_type: string
  description: string
  performed_by: string
  created_at: string
  performed_by_profile?: {
    id: string
    full_name: string | null
    email: string
  } | null
}

// Create lead input
export interface CreateLeadInput {
  company_name: string
  contact_person: string
  email: string
  phone?: string | null
  status?: LeadStatus
  source: LeadSource
  value?: number | null
  probability?: number | null
  expected_close_date?: string | null
  notes?: string | null
  assigned_to?: string | null
  tags?: string[]
}

// Update lead input
export interface UpdateLeadInput extends Partial<CreateLeadInput> {
  id: string
}
