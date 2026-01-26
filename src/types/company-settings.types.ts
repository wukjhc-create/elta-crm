// Company settings database type
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
  default_terms_and_conditions: string | null

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
  default_terms_and_conditions?: string | null
}
