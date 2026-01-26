// Offer status enum
export const OFFER_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'accepted',
  'rejected',
  'expired',
] as const

export type OfferStatus = (typeof OFFER_STATUSES)[number]

// Status labels in Danish
export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  draft: 'Kladde',
  sent: 'Sendt',
  viewed: 'Set',
  accepted: 'Accepteret',
  rejected: 'Afvist',
  expired: 'Udløbet',
}

// Status colors for badges
export const OFFER_STATUS_COLORS: Record<OfferStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  viewed: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  expired: 'bg-orange-100 text-orange-800',
}

// Common units
export const OFFER_UNITS = [
  { value: 'stk', label: 'Stk.' },
  { value: 'time', label: 'Time' },
  { value: 'm', label: 'Meter' },
  { value: 'm2', label: 'm²' },
  { value: 'kWp', label: 'kWp' },
  { value: 'sæt', label: 'Sæt' },
  { value: 'pakke', label: 'Pakke' },
] as const

// Offer line item type
export interface OfferLineItem {
  id: string
  offer_id: string
  position: number
  description: string
  quantity: number
  unit: string
  unit_price: number
  discount_percentage: number
  total: number
  created_at: string
}

// Offer database type
export interface Offer {
  id: string
  offer_number: string
  title: string
  description: string | null
  status: OfferStatus
  customer_id: string | null
  lead_id: string | null
  total_amount: number
  discount_percentage: number
  discount_amount: number
  tax_percentage: number
  tax_amount: number
  final_amount: number
  currency: string
  valid_until: string | null
  terms_and_conditions: string | null
  notes: string | null
  sent_at: string | null
  viewed_at: string | null
  accepted_at: string | null
  rejected_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

import type { OfferActivityWithPerformer } from './offer-activities.types'

// Offer with relations
export interface OfferWithRelations extends Offer {
  line_items?: OfferLineItem[]
  customer?: {
    id: string
    customer_number: string
    company_name: string
    contact_person: string
    email: string
    phone: string | null
    billing_address: string | null
    billing_city: string | null
    billing_postal_code: string | null
    billing_country: string | null
  } | null
  lead?: {
    id: string
    company_name: string
    contact_person: string
    email: string
  } | null
  created_by_profile?: {
    id: string
    full_name: string | null
    email: string
  } | null
  activities?: OfferActivityWithPerformer[]
}

// Create offer input
export interface CreateOfferInput {
  title: string
  description?: string | null
  customer_id?: string | null
  lead_id?: string | null
  discount_percentage?: number
  tax_percentage?: number
  valid_until?: string | null
  terms_and_conditions?: string | null
  notes?: string | null
}

// Update offer input
export interface UpdateOfferInput extends Partial<CreateOfferInput> {
  id: string
  status?: OfferStatus
}

// Create line item input
export interface CreateLineItemInput {
  offer_id: string
  position: number
  description: string
  quantity: number
  unit: string
  unit_price: number
  discount_percentage?: number
}

// Update line item input
export interface UpdateLineItemInput extends Partial<Omit<CreateLineItemInput, 'offer_id'>> {
  id: string
}
