'use server'

/**
 * Server Actions — Customer Relations (Aktivitetsoversigt)
 *
 * Queries for offers, projects, leads, and sent quotes linked to a customer.
 */

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

export interface CustomerOffer {
  id: string
  offer_number: string | null
  title: string
  status: string
  final_amount: number | null
  created_at: string | null
}

export interface CustomerProject {
  id: string
  project_number: string | null
  name: string
  status: string
}

export interface CustomerLead {
  id: string
  company_name: string
  status: string
  source: string | null
  created_at: string
}

export interface CustomerSentQuote {
  id: string
  quote_reference: string
  title: string
  total: number | null
  created_at: string
}

export async function getCustomerOffers(customerId: string): Promise<CustomerOffer[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('offers')
    .select('id, offer_number, title, status, final_amount, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('Failed to fetch customer offers', { error, entityId: customerId })
    return []
  }

  return (data || []) as CustomerOffer[]
}

export async function getCustomerProjects(customerId: string): Promise<CustomerProject[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('projects')
    .select('id, project_number, name, status')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('Failed to fetch customer projects', { error, entityId: customerId })
    return []
  }

  return (data || []) as CustomerProject[]
}

export async function getCustomerLeads(customerEmail: string): Promise<CustomerLead[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('leads')
    .select('id, company_name, status, source, created_at')
    .ilike('email', customerEmail)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('Failed to fetch customer leads', { error })
    return []
  }

  return (data || []) as CustomerLead[]
}

export async function getCustomerSentQuotes(customerId: string): Promise<CustomerSentQuote[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sent_quotes')
    .select('id, quote_reference, title, total, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('Failed to fetch customer sent quotes', { error, entityId: customerId })
    return []
  }

  return (data || []) as CustomerSentQuote[]
}

export interface CustomerEmail {
  id: string
  subject: string | null
  sender_email: string
  sender_name: string | null
  received_at: string
  is_read: boolean
  link_status: string
  body_preview: string | null
  has_attachments: boolean
}

export async function getCustomerEmails(customerId: string): Promise<CustomerEmail[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('incoming_emails')
    .select('id, subject, sender_email, sender_name, received_at, is_read, link_status, body_preview, has_attachments')
    .eq('customer_id', customerId)
    .eq('is_archived', false)
    .order('received_at', { ascending: false })
    .limit(50)

  if (error) {
    logger.error('Failed to fetch customer emails', { error, entityId: customerId })
    return []
  }

  return (data || []) as CustomerEmail[]
}
