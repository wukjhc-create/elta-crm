'use server'

/**
 * Server Actions — Customer Relations (Aktivitetsoversigt)
 *
 * Queries for offers, projects, leads, and sent quotes linked to a customer.
 *
 * Leads-review 2026-10-08 (#8): funktionerne havde ingen rettighedstjek (kun RLS) — hver læsning kræver nu sin
 * modul-rettighed og returnerer [] uden den.
 */

async function clientFor(permission: Permission) {
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  return hasPermission(permission) ? supabase : null
}

import { escapeLike } from '@/lib/validations/postgrest-filter'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import type { Permission } from '@/lib/auth/permissions'
import { validateUUID } from '@/lib/validations/common'
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
  validateUUID(customerId, 'customerId')
  const supabase = await clientFor('offers.view')
  if (!supabase) return []

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
  validateUUID(customerId, 'customerId')
  const supabase = await clientFor('projects.view')
  if (!supabase) return []

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

/**
 * Leads-review 2026-10-08 (#11): kun e-mail-match — et konverteret lead med anden/ingen e-mail (custom_fields.customer_id)
 * manglede på kundekortet. Nu begge, uden dubletter.
 */
export async function getCustomerLeads(customerId: string, customerEmail: string | null): Promise<CustomerLead[]> {
  validateUUID(customerId, 'customerId')
  const supabase = await clientFor('leads.view')
  if (!supabase) return []
  const cols = 'id, company_name, status, source, created_at'
  const email = (customerEmail ?? '').trim()
  const [byId, byEmail] = await Promise.all([
    supabase.from('leads').select(cols).eq('custom_fields->>customer_id', customerId),
    email ? supabase.from('leads').select(cols).ilike('email', escapeLike(email)) : Promise.resolve({ data: [], error: null }),
  ])
  if (byId.error || byEmail.error) {
    logger.error('Failed to fetch customer leads', { error: byId.error ?? byEmail.error, entityId: customerId })
    return []
  }
  const seen = new Map<string, CustomerLead>()
  for (const l of [...(byId.data ?? []), ...(byEmail.data ?? [])] as CustomerLead[]) seen.set(l.id, l)
  return [...seen.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function getCustomerSentQuotes(customerId: string): Promise<CustomerSentQuote[]> {
  validateUUID(customerId, 'customerId')
  const supabase = await clientFor('offers.view')
  if (!supabase) return []

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
  validateUUID(customerId, 'customerId')
  const supabase = await clientFor('inbox.view')
  if (!supabase) return []

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
