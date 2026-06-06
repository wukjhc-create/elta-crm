'use server'

/**
 * Staging-model B — Forslag fra mails.
 *
 * Auto-flow (auto-case.ts, auto-offer.ts) opretter service_cases og
 * offers med is_proposal=true. Disse funktioner styrer den side, hvor
 * brugeren ser, godkender (promote) eller afviser (reject) forslag.
 *
 * Promote = sæt is_proposal=false → record overgår til hovedlisten.
 * Reject  = DELETE → records cascader (case_notes / offer_line_items).
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'

export interface CaseProposal {
  id: string
  case_number: string
  title: string
  description: string | null
  status: string
  priority: string
  source_email_id: string | null
  created_at: string
  customer_id: string | null
  customer_name: string | null
}

export interface OfferProposal {
  id: string
  offer_number: string
  title: string
  description: string | null
  status: string
  final_amount: number
  source_email_id: string | null
  created_at: string
  customer_id: string | null
  customer_name: string | null
}

export interface ProposalsBundle {
  cases: CaseProposal[]
  offers: OfferProposal[]
  totalCount: number
}

export async function getProposals(): Promise<ActionResult<ProposalsBundle>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const [casesRes, offersRes] = await Promise.all([
      supabase
        .from('service_cases')
        .select(`
          id, case_number, title, description, status, priority,
          source_email_id, created_at, customer_id,
          customer:customers!service_cases_customer_id_fkey(company_name, contact_person)
        `)
        .eq('is_proposal', true)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('offers')
        .select(`
          id, offer_number, title, description, status, final_amount,
          source_email_id, created_at, customer_id,
          customer:customers!offers_customer_id_fkey(company_name, contact_person)
        `)
        .eq('is_proposal', true)
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    if (casesRes.error) {
      logger.error('getProposals: cases query failed', { error: casesRes.error })
      return { success: false, error: 'Kunne ikke hente sag-forslag' }
    }
    if (offersRes.error) {
      logger.error('getProposals: offers query failed', { error: offersRes.error })
      return { success: false, error: 'Kunne ikke hente tilbud-forslag' }
    }

    const cases: CaseProposal[] = (casesRes.data ?? []).map((row) => {
      const customer = (row.customer as unknown as { company_name?: string; contact_person?: string } | null) ?? null
      return {
        id: row.id,
        case_number: row.case_number,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        source_email_id: row.source_email_id,
        created_at: row.created_at,
        customer_id: row.customer_id,
        customer_name: customer?.company_name ?? customer?.contact_person ?? null,
      }
    })

    const offers: OfferProposal[] = (offersRes.data ?? []).map((row) => {
      const customer = (row.customer as unknown as { company_name?: string; contact_person?: string } | null) ?? null
      return {
        id: row.id,
        offer_number: row.offer_number,
        title: row.title,
        description: row.description,
        status: row.status,
        final_amount: Number(row.final_amount ?? 0),
        source_email_id: row.source_email_id,
        created_at: row.created_at,
        customer_id: row.customer_id,
        customer_name: customer?.company_name ?? customer?.contact_person ?? null,
      }
    })

    return {
      success: true,
      data: {
        cases,
        offers,
        totalCount: cases.length + offers.length,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl ved hentning af forslag') }
  }
}

export async function getProposalsCount(): Promise<number> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const [c, o] = await Promise.all([
      supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('is_proposal', true),
      supabase.from('offers').select('id', { count: 'exact', head: true }).eq('is_proposal', true),
    ])
    return (c.count ?? 0) + (o.count ?? 0)
  } catch {
    return 0
  }
}

export async function promoteCaseProposal(id: string): Promise<ActionResult> {
  try {
    validateUUID(id, 'sag-ID')
    const { supabase, userId } = await getAuthenticatedClient()
    const { error } = await supabase
      .from('service_cases')
      .update({ is_proposal: false })
      .eq('id', id)
      .eq('is_proposal', true)
    if (error) {
      logger.error('promoteCaseProposal failed', { error, entityId: id, userId })
      return { success: false, error: 'Kunne ikke godkende sag-forslag' }
    }
    revalidatePath('/dashboard/mail/proposals')
    revalidatePath('/dashboard/service-cases')
    revalidatePath('/dashboard/orders')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}

export async function promoteOfferProposal(id: string): Promise<ActionResult> {
  try {
    validateUUID(id, 'tilbud-ID')
    const { supabase, userId } = await getAuthenticatedClient()
    const { error } = await supabase
      .from('offers')
      .update({ is_proposal: false })
      .eq('id', id)
      .eq('is_proposal', true)
    if (error) {
      logger.error('promoteOfferProposal failed', { error, entityId: id, userId })
      return { success: false, error: 'Kunne ikke godkende tilbud-forslag' }
    }
    revalidatePath('/dashboard/mail/proposals')
    revalidatePath('/dashboard/offers')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}

export async function rejectCaseProposal(id: string): Promise<ActionResult> {
  try {
    validateUUID(id, 'sag-ID')
    const { supabase, userId } = await getAuthenticatedClient()
    // Defensiv: ryd incoming_emails.service_case_id-referencer foer DELETE.
    await supabase
      .from('incoming_emails')
      .update({ service_case_id: null })
      .eq('service_case_id', id)
    const { error } = await supabase
      .from('service_cases')
      .delete()
      .eq('id', id)
      .eq('is_proposal', true)
    if (error) {
      logger.error('rejectCaseProposal failed', { error, entityId: id, userId })
      return { success: false, error: 'Kunne ikke afvise sag-forslag' }
    }
    revalidatePath('/dashboard/mail/proposals')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}

export async function rejectOfferProposal(id: string): Promise<ActionResult> {
  try {
    validateUUID(id, 'tilbud-ID')
    const { supabase, userId } = await getAuthenticatedClient()
    const { error } = await supabase
      .from('offers')
      .delete()
      .eq('id', id)
      .eq('is_proposal', true)
    if (error) {
      logger.error('rejectOfferProposal failed', { error, entityId: id, userId })
      return { success: false, error: 'Kunne ikke afvise tilbud-forslag' }
    }
    revalidatePath('/dashboard/mail/proposals')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}
