'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

export interface PublicOffer {
  id: string
  offer_number: string
  title: string
  description: string | null
  status: string
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
  created_at: string
  customer: {
    company_name: string
    contact_person: string
    email: string
  } | null
  line_items: Array<{
    id: string
    position: number
    description: string
    quantity: number
    unit: string
    unit_price: number
    discount_percentage: number
    total: number
    section: string | null
  }>
}

export async function getPublicOffer(offerId: string): Promise<PublicOffer | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('offers')
    .select(`
      id, offer_number, title, description, status,
      total_amount, discount_percentage, discount_amount,
      tax_percentage, tax_amount, final_amount, currency,
      valid_until, terms_and_conditions, notes, created_at,
      customer:customers(company_name, contact_person, email),
      line_items:offer_line_items(id, position, description, quantity, unit, unit_price, discount_percentage, total, section)
    `)
    .eq('id', offerId)
    .in('status', ['sent', 'viewed', 'accepted'])
    .maybeSingle()

  if (error) {
    logger.error('Failed to fetch public offer', { error, entityId: offerId })
    return null
  }

  if (!data) return null

  // Mark as viewed if currently "sent"
  if (data.status === 'sent') {
    await supabase
      .from('offers')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('id', offerId)
  }

  // Sort line items
  if (data.line_items) {
    data.line_items.sort((a: { position: number }, b: { position: number }) => a.position - b.position)
  }

  return data as unknown as PublicOffer
}

export async function acceptPublicOffer(offerId: string, accepterName: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: offer } = await supabase
    .from('offers')
    .select('id, status')
    .eq('id', offerId)
    .single()

  if (!offer) return { success: false, error: 'Tilbud ikke fundet' }
  if (offer.status === 'accepted') return { success: false, error: 'Tilbuddet er allerede accepteret' }
  if (!['sent', 'viewed'].includes(offer.status)) return { success: false, error: 'Tilbuddet kan ikke accepteres i denne status' }

  const { error } = await supabase
    .from('offers')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      notes: `Accepteret af ${accepterName} via tilbudsportal`,
    })
    .eq('id', offerId)

  if (error) return { success: false, error: error.message }

  // Log signature (ignore errors)
  try {
    await supabase.from('offer_signatures').insert({
      offer_id: offerId,
      signer_name: accepterName,
      signed_at: new Date().toISOString(),
      ip_address: null,
    })
  } catch { /* ignore */ }

  return { success: true }
}
