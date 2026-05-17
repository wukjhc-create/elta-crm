'use server'

/**
 * Sprint 8H polish — "Opret kunde + (sag) fra mail" med 3 modes:
 *
 * A. 'payer_only': Afsender → ny kunde. Body-data ignoreres.
 *    Bruges når afsenderen ER kunden (privatperson skriver direkte).
 *
 * B. 'body_only': Body-data → ny kunde. Afsender ignoreres.
 *    Bruges når en formidler (webform, freemail) sender på vegne af kunden.
 *
 * C. 'payer_plus_site': Afsender → ny kunde (betaler) + body-data →
 *    customer_contact med role='site' + service_case med arbejdsadresse.
 *    Bruges når en grossist/samarbejdspartner sender på vegne af
 *    slutkunde (Fasetech-scenariet).
 *
 * Alle modes kobler mailen til betaler-kunden (og evt. sagen).
 */

import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { insertCustomerWithRetry } from '@/lib/customers/customer-number'

export type CreateFromEmailMode = 'payer_only' | 'body_only' | 'payer_plus_site'

export interface CreateFromEmailInput {
  emailId: string
  mode: CreateFromEmailMode
  /** Payer-data (mode A og C). */
  payer?: {
    companyName: string
    contactPerson?: string | null
    email: string
    phone?: string | null
  }
  /** Body-parsed kunde-data (mode B). */
  bodyCustomer?: {
    companyName: string
    contactPerson?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
    postalCode?: string | null
    city?: string | null
  }
  /** Site-kontakt + arbejdsadresse (mode C). */
  site?: {
    contactName: string
    contactEmail?: string | null
    contactPhone?: string | null
    address?: string | null
    postalCode?: string | null
    city?: string | null
    role?: 'site' | 'resident' | 'technical' | 'ordering' | 'other'
  }
  /** Hvis true: opret også en service_case fra mailen. */
  createCase?: boolean
}

export interface CreateFromEmailResult {
  success: boolean
  error?: string
  customerId?: string
  siteContactId?: string
  serviceCaseId?: string
  /** True hvis betaler-kunden allerede fandtes (kobles, ikke oprettes). */
  payerExisted?: boolean
}

// Sprint 9E Phase 5d: lokal generateCustomerNumber fjernet.
// Bruger faelles helper i src/lib/customers/customer-number.ts.

async function findOrCreateCustomerByEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  data: {
    companyName: string
    contactPerson?: string | null
    email: string
    phone?: string | null
  },
  userId: string
): Promise<{ id: string; existed: boolean } | { error: string }> {
  const emailLower = data.email.trim().toLowerCase()
  if (!emailLower || !emailLower.includes('@')) {
    return { error: 'Ugyldig email på betaler' }
  }

  const { data: existing } = await supabase
    .from('customers')
    .select('id, company_name')
    .ilike('email', emailLower)
    .limit(1)
    .maybeSingle()

  if (existing) {
    return { id: existing.id as string, existed: true }
  }

  // Sprint 9E Phase 5d — faelles insertCustomerWithRetry. Tilfoejer retry
  // mod 23505 customer_number-collisions, hvilket den gamle path manglede.
  const { data: created, error } = await insertCustomerWithRetry<{ id: string }>(
    supabase,
    (customerNumber) => ({
      customer_number: customerNumber,
      company_name: data.companyName.trim(),
      contact_person: (data.contactPerson || data.companyName).trim(),
      email: emailLower,
      phone: data.phone?.trim() || null,
      tags: ['email'],
      is_active: true,
      created_by: userId,
    }),
    { selectClause: 'id', label: 'findOrCreateCustomerByEmail' }
  )

  if (error || !created) {
    return { error: error?.message || 'Kunne ikke oprette kunde' }
  }
  return { id: created.id, existed: false }
}

export async function createCustomerAndCaseFromEmail(
  input: CreateFromEmailInput
): Promise<CreateFromEmailResult> {
  validateUUID(input.emailId, 'emailId')

  const { supabase, userId } = await getAuthenticatedClient()

  // 1. Hent mailen
  const { data: email } = await supabase
    .from('incoming_emails')
    .select('id, subject, sender_email, sender_name, conversation_id, customer_id')
    .eq('id', input.emailId)
    .maybeSingle()
  if (!email) return { success: false, error: 'Mail ikke fundet' }

  let customerId: string | null = null
  let payerExisted = false
  let siteContactId: string | null = null
  let serviceCaseId: string | null = null

  try {
    // 2. Opret betaler-kunde baseret på mode
    if (input.mode === 'payer_only' || input.mode === 'payer_plus_site') {
      if (!input.payer || !input.payer.email || !input.payer.companyName) {
        return { success: false, error: 'Betaler-data mangler (firmanavn + email)' }
      }
      const result = await findOrCreateCustomerByEmail(supabase, input.payer, userId)
      if ('error' in result) return { success: false, error: result.error }
      customerId = result.id
      payerExisted = result.existed
    } else if (input.mode === 'body_only') {
      if (!input.bodyCustomer || !input.bodyCustomer.companyName) {
        return { success: false, error: 'Kunde-data fra body mangler' }
      }
      // Body-only: brug body-data som ny kunde. Email kan være tom — så
      // bruger vi sender-email som backup eller springer email over.
      const email = input.bodyCustomer.email || ''
      if (!email) {
        return { success: false, error: 'Email på kunde mangler (kan ikke oprette uden)' }
      }
      const result = await findOrCreateCustomerByEmail(
        supabase,
        {
          companyName: input.bodyCustomer.companyName,
          contactPerson: input.bodyCustomer.contactPerson,
          email,
          phone: input.bodyCustomer.phone,
        },
        userId
      )
      if ('error' in result) return { success: false, error: result.error }
      customerId = result.id
      payerExisted = result.existed
    }

    if (!customerId) {
      return { success: false, error: 'Kunne ikke bestemme kunde-ID' }
    }

    // 3. Kobl mailen til betaler-kunden
    await supabase
      .from('incoming_emails')
      .update({
        customer_id: customerId,
        link_status: 'linked',
        linked_by: 'manual-create',
        linked_at: new Date().toISOString(),
      })
      .eq('id', input.emailId)

    // 4. Hvis mode C: opret site_contact (under betaler) — body-data
    if (input.mode === 'payer_plus_site' && input.site && input.site.contactName.trim().length > 0) {
      const { data: contact, error: contactErr } = await supabase
        .from('customer_contacts')
        .insert({
          customer_id: customerId,
          name: input.site.contactName.trim(),
          email: input.site.contactEmail?.trim() || null,
          phone: input.site.contactPhone?.trim() || null,
          mobile: null,
          role: input.site.role || 'site',
          is_primary: false,
        })
        .select('id')
        .single()
      if (contactErr) {
        logger.warn('createFromEmail: site_contact insert failed', {
          error: contactErr,
          metadata: { customerId, name: input.site.contactName },
        })
      } else if (contact) {
        siteContactId = contact.id as string
      }
    }

    // 5. Opret service_case hvis createCase=true (eller mode C med adresse)
    const shouldCreateCase =
      input.createCase ||
      (input.mode === 'payer_plus_site' && (input.site?.address || siteContactId))

    if (shouldCreateCase) {
      // Generér case_number
      const { data: lastCase } = await supabase
        .from('service_cases')
        .select('case_number')
        .order('case_number', { ascending: false })
        .limit(1)
      let caseNumber = 'SAG-000001'
      if (lastCase && lastCase.length > 0) {
        const m = (lastCase[0].case_number as string).match(/(\d+)$/)
        if (m) {
          const next = parseInt(m[1], 10) + 1
          caseNumber = 'SAG-' + next.toString().padStart(6, '0')
        }
      }

      const title = email.subject
        ? email.subject.replace(/^(?:(?:Re|Fwd|Fw|SV|VS|VB)\s*:\s*)+/gi, '').trim() || 'Ny opgave fra mail'
        : 'Ny opgave fra mail'

      const caseInsert: Record<string, unknown> = {
        case_number: caseNumber,
        customer_id: customerId,
        title: title.substring(0, 200),
        status: 'new',
        priority: 'medium',
        source: 'email',
        source_email_id: input.emailId,
        created_by: userId,
      }

      // Tilføj adresse fra site-data (mode C) eller body-data (mode B)
      if (input.mode === 'payer_plus_site' && input.site) {
        if (input.site.address) caseInsert.address = input.site.address.trim()
        if (input.site.postalCode) caseInsert.postal_code = input.site.postalCode.trim()
        if (input.site.city) caseInsert.city = input.site.city.trim()
        if (input.site.contactPhone) caseInsert.contact_phone = input.site.contactPhone.trim()
        if (siteContactId) caseInsert.site_contact_id = siteContactId
      } else if (input.mode === 'body_only' && input.bodyCustomer) {
        if (input.bodyCustomer.address) caseInsert.address = input.bodyCustomer.address.trim()
        if (input.bodyCustomer.postalCode) caseInsert.postal_code = input.bodyCustomer.postalCode.trim()
        if (input.bodyCustomer.city) caseInsert.city = input.bodyCustomer.city.trim()
        if (input.bodyCustomer.phone) caseInsert.contact_phone = input.bodyCustomer.phone.trim()
      }

      const { data: newCase, error: caseErr } = await supabase
        .from('service_cases')
        .insert(caseInsert)
        .select('id')
        .single()
      if (caseErr) {
        logger.warn('createFromEmail: service_case insert failed', {
          error: caseErr,
          metadata: { customerId, caseNumber },
        })
      } else if (newCase) {
        serviceCaseId = newCase.id as string
        // Opdater mailen med service_case_id så timeline/Mails-tab på sag virker
        await supabase
          .from('incoming_emails')
          .update({ service_case_id: serviceCaseId })
          .eq('id', input.emailId)
      }
    }

    logger.info('Customer created from email', {
      userId,
      action: 'createCustomerAndCaseFromEmail',
      entity: 'incoming_emails',
      entityId: input.emailId,
      metadata: {
        mode: input.mode,
        customerId,
        payerExisted,
        siteContactId,
        serviceCaseId,
      },
    })

    revalidatePath('/dashboard/mail')
    revalidatePath('/dashboard/customers')
    if (serviceCaseId) revalidatePath(`/dashboard/orders/${serviceCaseId}`)
    revalidatePath(`/dashboard/customers/${customerId}`)

    return {
      success: true,
      customerId,
      siteContactId: siteContactId || undefined,
      serviceCaseId: serviceCaseId || undefined,
      payerExisted,
    }
  } catch (err) {
    logger.error('createCustomerAndCaseFromEmail failed', {
      error: err,
      entity: 'incoming_emails',
      entityId: input.emailId,
    })
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Uventet fejl',
    }
  }
}
