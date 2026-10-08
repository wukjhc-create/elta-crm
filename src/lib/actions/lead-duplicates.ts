'use server'

/**
 * N87: mulige eksisterende kunder for et lead, før det gøres til kunde. "Opret som kunde" matcher kun på e-mail — men
 * mail-automatikken har ofte allerede oprettet personen (prod: 92/107 kunder auto-oprettet, 14 uden e-mail) ud fra
 * telefonnummeret. Her foreslås kunder med samme telefon (8 cifre) eller samme navn; brugeren vælger selv at koble.
 *   getLeadCustomerCandidatesAction — forslag (customers.view + leads.view)
 *   linkLeadToCustomerAction        — kobl leadet (og dets kildemail, hvis ukoblet) til en valgt kunde (leads.edit)
 * Ingen automatisk fletning; kunden ændres ikke.
 */
import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { phoneDigits } from '@/lib/customers/csv-import'
import { pgQuote } from '@/lib/validations/postgrest-filter'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'

export interface LeadCustomerCandidate { id: string; name: string; customer_number: string | null; email: string | null; reason: 'phone' | 'name' }

const last8 = (s: string | null | undefined) => { const d = phoneDigits(s); return d.length >= 8 ? d.slice(-8) : '' }

export async function getLeadCustomerCandidatesAction(leadId: string): Promise<ActionResult<LeadCustomerCandidate[]>> {
  try {
    validateUUID(leadId, 'lead ID')
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view') || !hasPermission('leads.view')) return { success: false, error: 'Manglende tilladelse' }
    const { data: lead } = await supabase.from('leads').select('id, company_name, contact_person, email, phone, custom_fields').eq('id', leadId).maybeSingle()
    if (!lead) return { success: false, error: 'Lead ikke fundet' }
    if (typeof (lead.custom_fields as Record<string, unknown> | null)?.customer_id === 'string') return { success: true, data: [] }

    const phone = last8(lead.phone as string | null)
    const name = String(lead.contact_person || lead.company_name || '').trim()
    const out = new Map<string, LeadCustomerCandidate>()
    if (phone) {
      // telefon gemmes i forskellige formater ("+45 12 34 56 78", "12345678") — et ilike-forfilter rammer ikke tal med
      // mellemrum, så telefonfelterne hentes (lette kolonner; kundetabellen er lille) og matches på de sidste 8 cifre
      // pagineret (PostgREST giver højst 1000 rækker pr. kald)
      type Row = { id: string; company_name: string; customer_number: string | null; email: string | null; phone: string | null; mobile: string | null }
      const data: Row[] = []
      for (let from = 0; from < 50_000; from += 1000) {
        const { data: page } = await supabase.from('customers').select('id, company_name, customer_number, email, phone, mobile')
          .eq('is_active', true).or('phone.not.is.null,mobile.not.is.null').order('id').range(from, from + 999)
        data.push(...((page ?? []) as Row[]))
        if (!page || page.length < 1000) break
      }
      for (const c of data) {
        if (last8(c.phone) === phone || last8(c.mobile) === phone) out.set(c.id, { id: c.id, name: c.company_name, customer_number: c.customer_number, email: c.email, reason: 'phone' })
      }
    }
    if (name.includes(' ') && name.length >= 5) {
      const safe = name.replace(/[%,()]/g, ' ').trim()
      const { data } = await supabase.from('customers').select('id, company_name, customer_number, email')
        .or(`company_name.ilike.${pgQuote(safe)},contact_person.ilike.${pgQuote(safe)}`).eq('is_active', true).limit(10)
      for (const c of (data ?? []) as Array<{ id: string; company_name: string; customer_number: string | null; email: string | null }>) {
        if (!out.has(c.id)) out.set(c.id, { id: c.id, name: c.company_name, customer_number: c.customer_number, email: c.email, reason: 'name' })
      }
    }
    // samme e-mail håndteres allerede af "Opret som kunde" (kobler automatisk)
    const leadEmail = String(lead.email ?? '').trim().toLowerCase()
    return { success: true, data: Array.from(out.values()).filter((c) => (c.email ?? '').toLowerCase() !== leadEmail).slice(0, 5) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke finde mulige kunder') }
  }
}

export async function linkLeadToCustomerAction(leadId: string, customerId: string): Promise<ActionResult<{ customer_id: string }>> {
  try {
    validateUUID(leadId, 'lead ID')
    validateUUID(customerId, 'kunde ID')
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('leads.edit')) return { success: false, error: 'Manglende tilladelse: leads.edit' }
    // kundens eksistens/synlighed afgøres af RLS-opslaget nedenfor (leads.edit-roller kan se kunder)
    const [{ data: lead }, { data: cust }] = await Promise.all([
      supabase.from('leads').select('id, custom_fields').eq('id', leadId).maybeSingle(),
      supabase.from('customers').select('id, company_name').eq('id', customerId).maybeSingle(),
    ])
    if (!lead) return { success: false, error: 'Lead ikke fundet' }
    if (!cust) return { success: false, error: 'Kunde ikke fundet' }
    const cf = (lead.custom_fields ?? {}) as Record<string, unknown>
    const { error } = await supabase.from('leads').update({ custom_fields: { ...cf, customer_id: customerId } }).eq('id', leadId)
    if (error) return { success: false, error: 'Kunne ikke koble leadet' }
    if (typeof cf.source_email_id === 'string' && hasPermission('inbox.view')) {
      const { error: linkErr } = await supabase.from('incoming_emails')
        .update({ customer_id: customerId, link_status: 'linked', linked_by: 'lead-link', linked_at: new Date().toISOString() })
        .eq('id', cf.source_email_id).is('customer_id', null)
      if (linkErr) logger.warn('linkLeadToCustomer: kildemail ikke koblet', { error: linkErr, entityId: leadId })
    }
    await supabase.from('lead_activities').insert({ lead_id: leadId, activity_type: 'note', performed_by: userId,
      description: `Lead koblet til eksisterende kunde: ${(cust as { company_name: string }).company_name}` })
    revalidatePath(`/dashboard/leads/${leadId}`)
    return { success: true, data: { customer_id: customerId } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke koble leadet') }
  }
}
