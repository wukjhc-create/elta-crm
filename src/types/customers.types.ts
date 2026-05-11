// Customer database type
export interface Customer {
  id: string
  customer_number: string
  company_name: string
  contact_person: string
  email: string
  phone: string | null
  mobile: string | null
  website: string | null
  vat_number: string | null
  billing_address: string | null
  billing_city: string | null
  billing_postal_code: string | null
  billing_country: string | null
  shipping_address: string | null
  shipping_city: string | null
  shipping_postal_code: string | null
  shipping_country: string | null
  notes: string | null
  tags: string[]
  custom_fields: Record<string, unknown>
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
}

// Customer with relations
export interface CustomerWithRelations extends Customer {
  contacts?: CustomerContact[]
  created_by_profile?: {
    id: string
    full_name: string | null
    email: string
  } | null
}

// Sprint 8G: kontaktrolle (CHECK constraint i DB)
export const CUSTOMER_CONTACT_ROLES = [
  'billing',
  'ordering',
  'site',
  'technical',
  'resident',
  'property_manager',
  'other',
] as const
export type CustomerContactRole = (typeof CUSTOMER_CONTACT_ROLES)[number]

export const CUSTOMER_CONTACT_ROLE_LABELS: Record<CustomerContactRole, string> = {
  billing: 'Faktura',
  ordering: 'Ordregiver',
  site: 'Kontakt på stedet',
  technical: 'Teknisk kontakt',
  resident: 'Beboer',
  property_manager: 'Ejendomsadministrator',
  other: 'Andet',
}

// Customer contact type
export interface CustomerContact {
  id: string
  customer_id: string
  name: string
  title: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  is_primary: boolean
  notes: string | null
  /** Sprint 8G — kontaktrolle (nullable). Bruges til at vælge default
   *  modtager pr. mailtype (faktura vs praktisk vs teknisk). */
  role?: CustomerContactRole | null
  created_at: string
  updated_at: string
}

// Create customer input
export interface CreateCustomerInput {
  company_name: string
  contact_person: string
  email: string
  phone?: string | null
  mobile?: string | null
  website?: string | null
  vat_number?: string | null
  billing_address?: string | null
  billing_city?: string | null
  billing_postal_code?: string | null
  billing_country?: string | null
  shipping_address?: string | null
  shipping_city?: string | null
  shipping_postal_code?: string | null
  shipping_country?: string | null
  notes?: string | null
  tags?: string[]
  is_active?: boolean
}

// Update customer input
export interface UpdateCustomerInput extends Partial<CreateCustomerInput> {
  id: string
}

// Create customer contact input
export interface CreateCustomerContactInput {
  customer_id: string
  name: string
  title?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  is_primary?: boolean
  notes?: string | null
  /** Sprint 8G — kontaktrolle. */
  role?: CustomerContactRole | null
}

// Update customer contact input
export interface UpdateCustomerContactInput extends Partial<Omit<CreateCustomerContactInput, 'customer_id'>> {
  id: string
}
