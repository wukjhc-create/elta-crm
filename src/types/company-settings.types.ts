// Company settings database type

// Sprint Ø2.11 — kostbasis for timeøkonomi (rate engine)
export type TimeCostBasis = 'real_hourly_cost' | 'internal_cost_rate' | 'fixed_standard_rate'

export const TIME_COST_BASIS_OPTIONS: Array<{ value: TimeCostBasis; label: string; help: string }> = [
  { value: 'real_hourly_cost', label: 'Reel timekost (fuldt belastet)', help: 'Løn + pension/ferie/SH/social/overhead. Mest korrekte kost.' },
  { value: 'internal_cost_rate', label: 'Intern kostpris/time', help: 'Manuelt sat intern kostpris pr. medarbejder.' },
  { value: 'fixed_standard_rate', label: 'Fast firma-standard', help: 'Samme standardkost for alle medarbejdere.' },
]

export interface CompanySettings {
  id: string
  // Company info
  company_name: string
  company_address: string | null
  company_city: string | null
  company_postal_code: string | null
  company_country: string | null
  company_phone: string | null
  company_email: string | null
  company_vat_number: string | null
  company_logo_url: string | null
  company_website: string | null

  // SMTP settings
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_password: string | null
  smtp_from_email: string | null
  smtp_from_name: string | null

  // Default values
  default_tax_percentage: number
  default_currency: string
  default_offer_validity_days: number
  default_payment_terms_days: number
  default_terms_and_conditions: string | null

  // Reminder settings
  reminder_enabled: boolean
  reminder_interval_days: number
  reminder_max_count: number
  reminder_email_subject: string | null

  // Sprint Ø2.11 — timeøkonomi-kostbasis
  time_cost_basis: TimeCostBasis
  time_cost_rate: number | null

  // Timestamps
  created_at: string
  updated_at: string
}

// Update company settings input
export interface UpdateCompanySettingsInput {
  // Company info
  company_name?: string
  company_address?: string | null
  company_city?: string | null
  company_postal_code?: string | null
  company_country?: string | null
  company_phone?: string | null
  company_email?: string | null
  company_vat_number?: string | null
  company_logo_url?: string | null
  company_website?: string | null

  // SMTP settings
  smtp_host?: string | null
  smtp_port?: number | null
  smtp_user?: string | null
  smtp_password?: string | null
  smtp_from_email?: string | null
  smtp_from_name?: string | null

  // Default values
  default_tax_percentage?: number
  default_currency?: string
  default_offer_validity_days?: number
  default_payment_terms_days?: number
  default_terms_and_conditions?: string | null

  // Sprint Ø2.11 — timeøkonomi-kostbasis
  time_cost_basis?: TimeCostBasis
  time_cost_rate?: number | null
}
