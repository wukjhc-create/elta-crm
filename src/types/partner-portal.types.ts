import type {
  ServiceCaseStatus,
  ServiceCaseType,
} from '@/types/service-cases.types'

// =====================================================
// Partner-portal typer (Fase 1)
//
// Spejler portal.types.ts, men scoped fra PARTNERENS vinkel:
// partner_customer_id = partnerens egen kunde-række; portalen viser
// sager hvor service_cases.payer_customer_id = partner_customer_id.
//
// COST-FREE: ingen typer her må bære kost/margin/dækningsbidrag/budget.
// =====================================================

// Partner Access Token (intern visning)
export interface PartnerAccessToken {
  id: string
  partner_customer_id: string
  token: string
  email: string
  is_active: boolean
  expires_at: string | null
  last_accessed_at: string | null
  created_by: string
  created_at: string
}

// Partner-session (returneres af validatePartnerToken)
export interface PartnerSession {
  token: string
  partner_customer_id: string
  partner: {
    id: string
    customer_number: string
    company_name: string
    contact_person: string
    email: string
  }
  expires_at: string | null
}

// Oprettelses-data
export interface CreatePartnerTokenData {
  partner_customer_id: string
  email: string
  expires_at?: string | null
}

// Partner-sikker sagsvisning (cost-free delmængde — ALDRIG interne felter som
// budget/contract_sum/planned_hours/formand_id/low_profit/ksr_number).
// end_customer_name beriges server-side (KUN navn — intet økonomisk) så
// partneren kan se hvilken slutkunde sagen vedrører.
export interface PartnerServiceCase {
  id: string
  case_number: string
  title: string
  description: string | null
  status: ServiceCaseStatus
  status_note: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  start_date: string | null
  end_date: string | null
  project_name: string | null
  type: ServiceCaseType | null
  reference: string | null
  created_at: string
  end_customer_name: string | null
}

// Kunde-vendte dokumenttyper partneren må hente (Fase 1). Interne sagsfotos
// (service_case_attachments) er bevidst UDE. Delt mellem action + download-API.
export const PARTNER_DOCUMENT_TYPES = [
  'quote',
  'invoice',
  'contract',
  'besigtigelse',
] as const

// Partner-sikker dokumentvisning (kunde-vendte typer pr. sag, cost-free).
// Ingen brugbar URL i payloaden — download sker via /api/partner/documents,
// der re-validerer token + ejerskab pr. forespørgsel og udsteder en frisk
// kortlivet signed-URL.
export interface PartnerDocument {
  id: string
  title: string
  description: string | null
  document_type: string
  file_name: string
  mime_type: string
  service_case_id: string | null
  created_at: string
}
