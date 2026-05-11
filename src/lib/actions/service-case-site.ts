'use server'

/**
 * Sprint 8G+1 — Site-info edit + site contact creation.
 *
 * To dedikerede server actions til modalen "Rediger leveringskontakt":
 *  - updateServiceCaseSiteInfo: opdaterer adresse, access_notes,
 *    site_customer_id, site_contact_id på en sag.
 *  - createSiteContactForCase: opretter ny customer_contacts-row knyttet
 *    til site_customer_id (eller fallback til betaler) + sætter
 *    sag.site_contact_id til den nye kontakt.
 *
 * Begge er guard-belagt med permission 'cases.edit' og UUID-validering.
 */

import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import { revalidatePath } from 'next/cache'
import {
  CUSTOMER_CONTACT_ROLES,
  type CustomerContact,
  type CustomerContactRole,
} from '@/types/customers.types'
import type { ServiceCase } from '@/types/service-cases.types'

// =====================================================
// updateServiceCaseSiteInfo
// =====================================================

export interface UpdateSiteInfoInput {
  /** Arbejdsadresse. */
  address?: string | null
  postal_code?: string | null
  city?: string | null
  floor_door?: string | null
  /** Telefon på stedet (fallback hvis site_contact_id ikke er sat). */
  contact_phone?: string | null
  /** Adgangsnoter (parkering, hund, kode etc.). */
  access_notes?: string | null
  /** Leveringskunde — null = samme som betaler. */
  site_customer_id?: string | null
  /** Kontaktperson på stedet — peger på customer_contacts.id. */
  site_contact_id?: string | null
}

export async function updateServiceCaseSiteInfo(
  caseId: string,
  input: UpdateSiteInfoInput
): Promise<{ success: boolean; error?: string; data?: ServiceCase }> {
  try {
    validateUUID(caseId, 'caseId')

    const { supabase, hasPermission, userId } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.edit')) {
      return { success: false, error: 'Manglende tilladelse: cases.edit' }
    }

    // Hent sagen så vi kan validere FK'er
    const { data: existing, error: fetchErr } = await supabase
      .from('service_cases')
      .select('id, customer_id, site_customer_id, site_contact_id')
      .eq('id', caseId)
      .maybeSingle()

    if (fetchErr || !existing) {
      return { success: false, error: 'Sagen blev ikke fundet' }
    }

    // Validér FK-værdier
    if (input.site_customer_id) {
      validateUUID(input.site_customer_id, 'site_customer_id')
      const { data: cust } = await supabase
        .from('customers')
        .select('id')
        .eq('id', input.site_customer_id)
        .maybeSingle()
      if (!cust) {
        return { success: false, error: 'Leveringskunde blev ikke fundet' }
      }
    }

    if (input.site_contact_id) {
      validateUUID(input.site_contact_id, 'site_contact_id')
      // Kontakten skal høre til enten betaler eller site_customer
      const newSiteCustomerId =
        input.site_customer_id !== undefined ? input.site_customer_id : existing.site_customer_id
      const allowedCustomerIds = [existing.customer_id, newSiteCustomerId].filter(
        (id): id is string => !!id
      )
      if (allowedCustomerIds.length === 0) {
        return { success: false, error: 'Sagen mangler en kunde — kan ikke knytte kontakt' }
      }
      const { data: contact } = await supabase
        .from('customer_contacts')
        .select('id, customer_id')
        .eq('id', input.site_contact_id)
        .maybeSingle()
      if (!contact) {
        return { success: false, error: 'Kontaktperson blev ikke fundet' }
      }
      if (!allowedCustomerIds.includes(contact.customer_id)) {
        return {
          success: false,
          error: 'Kontaktperson hører til en anden kunde end betaler/leveringskunde',
        }
      }
    }

    // Byg payload — kun de felter caller eksplicit har sat
    const payload: Record<string, unknown> = {}
    if (input.address !== undefined) payload.address = input.address
    if (input.postal_code !== undefined) payload.postal_code = input.postal_code
    if (input.city !== undefined) payload.city = input.city
    if (input.floor_door !== undefined) payload.floor_door = input.floor_door
    if (input.contact_phone !== undefined) payload.contact_phone = input.contact_phone
    if (input.access_notes !== undefined) payload.access_notes = input.access_notes
    if (input.site_customer_id !== undefined) payload.site_customer_id = input.site_customer_id
    if (input.site_contact_id !== undefined) payload.site_contact_id = input.site_contact_id

    if (Object.keys(payload).length === 0) {
      return { success: true, data: existing as unknown as ServiceCase }
    }

    const { data, error } = await supabase
      .from('service_cases')
      .update(payload)
      .eq('id', caseId)
      .select('*')
      .single()

    if (error) {
      logger.error('updateServiceCaseSiteInfo failed', {
        error,
        entity: 'service_cases',
        entityId: caseId,
        userId,
      })
      return { success: false, error: 'Kunne ikke opdatere leveringsinfo' }
    }

    logger.info('Service case site info updated', {
      userId,
      action: 'updateServiceCaseSiteInfo',
      entity: 'service_cases',
      entityId: caseId,
      metadata: { keys: Object.keys(payload) },
    })

    revalidatePath(`/dashboard/orders/${caseId}`)
    revalidatePath('/dashboard/orders')
    return { success: true, data: data as ServiceCase }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Uventet fejl',
    }
  }
}

// =====================================================
// createSiteContactForCase
// =====================================================

export interface CreateSiteContactInput {
  name: string
  email?: string | null
  phone?: string | null
  mobile?: string | null
  /** Default = 'site'. */
  role?: CustomerContactRole
  notes?: string | null
  /** Hvis sat: opret kontakt under denne kunde (typisk site_customer_id).
   *  Ellers: opret under sagens betalende customer_id. */
  parentCustomerId?: string | null
}

export async function createSiteContactForCase(
  caseId: string,
  input: CreateSiteContactInput
): Promise<{ success: boolean; error?: string; contact?: CustomerContact }> {
  try {
    validateUUID(caseId, 'caseId')

    const { supabase, hasPermission, userId } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.edit')) {
      return { success: false, error: 'Manglende tilladelse: cases.edit' }
    }

    if (!input.name || input.name.trim().length === 0) {
      return { success: false, error: 'Navn er påkrævet' }
    }
    if (input.name.length > 200) {
      return { success: false, error: 'Navn er for langt (max 200 tegn)' }
    }

    const role = input.role || 'site'
    if (!CUSTOMER_CONTACT_ROLES.includes(role)) {
      return { success: false, error: 'Ugyldig rolle' }
    }

    // Hent sag for at finde parent customer
    const { data: caseRow, error: caseErr } = await supabase
      .from('service_cases')
      .select('id, customer_id, site_customer_id')
      .eq('id', caseId)
      .maybeSingle()

    if (caseErr || !caseRow) {
      return { success: false, error: 'Sagen blev ikke fundet' }
    }

    // Bestem parent customer_id i prioritet: explicit input → site_customer → betaler
    let parentCustomerId: string | null = null
    if (input.parentCustomerId) {
      validateUUID(input.parentCustomerId, 'parentCustomerId')
      // Skal være enten betaler eller site_customer
      if (
        input.parentCustomerId !== caseRow.customer_id &&
        input.parentCustomerId !== caseRow.site_customer_id
      ) {
        return {
          success: false,
          error: 'parentCustomerId skal være betaler eller leveringskunde',
        }
      }
      parentCustomerId = input.parentCustomerId
    } else if (caseRow.site_customer_id) {
      parentCustomerId = caseRow.site_customer_id
    } else if (caseRow.customer_id) {
      parentCustomerId = caseRow.customer_id
    }

    if (!parentCustomerId) {
      return {
        success: false,
        error: 'Sagen har ingen kunde — opret betaler først',
      }
    }

    const insertPayload: Record<string, unknown> = {
      customer_id: parentCustomerId,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      mobile: input.mobile?.trim() || null,
      notes: input.notes?.trim() || null,
      role,
      is_primary: false,
    }

    const { data: newContact, error: insertErr } = await supabase
      .from('customer_contacts')
      .insert(insertPayload)
      .select('*')
      .single()

    if (insertErr || !newContact) {
      logger.error('createSiteContactForCase: insert failed', {
        error: insertErr,
        entity: 'customer_contacts',
        userId,
        metadata: { caseId, parentCustomerId },
      })
      return { success: false, error: 'Kunne ikke oprette kontaktperson' }
    }

    // Sæt sagens site_contact_id til den nye kontakt
    const { error: updateErr } = await supabase
      .from('service_cases')
      .update({ site_contact_id: newContact.id })
      .eq('id', caseId)

    if (updateErr) {
      // Kontakten er oprettet — lad det stå, men rapportér linkning-fejlen.
      logger.warn('createSiteContactForCase: link to case failed', {
        error: updateErr,
        entity: 'service_cases',
        entityId: caseId,
        metadata: { contactId: newContact.id },
      })
      return {
        success: false,
        error: 'Kontakt oprettet, men kunne ikke kobles til sagen',
        contact: newContact as CustomerContact,
      }
    }

    logger.info('Site contact created and linked to case', {
      userId,
      action: 'createSiteContactForCase',
      entity: 'customer_contacts',
      entityId: newContact.id,
      metadata: { caseId, role, parentCustomerId },
    })

    revalidatePath(`/dashboard/orders/${caseId}`)
    revalidatePath(`/dashboard/customers/${parentCustomerId}`)
    return { success: true, contact: newContact as CustomerContact }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Uventet fejl',
    }
  }
}

// =====================================================
// getContactsForCase
// =====================================================

/**
 * Hent alle customer_contacts for både betaler og evt. leveringskunde
 * på en sag. Til brug i edit-modalens "Vælg kontakt"-dropdown.
 */
export async function getContactsForCase(caseId: string): Promise<{
  success: boolean
  error?: string
  contacts?: Array<
    Pick<
      CustomerContact,
      'id' | 'name' | 'email' | 'phone' | 'mobile' | 'role' | 'customer_id'
    > & { is_primary?: boolean; parent_label?: 'paying' | 'site' }
  >
}> {
  try {
    validateUUID(caseId, 'caseId')

    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.view.all') && !hasPermission('cases.view.assigned')) {
      return { success: false, error: 'Manglende tilladelse' }
    }

    const { data: caseRow } = await supabase
      .from('service_cases')
      .select('customer_id, site_customer_id')
      .eq('id', caseId)
      .maybeSingle()

    if (!caseRow) {
      return { success: false, error: 'Sagen blev ikke fundet' }
    }

    const customerIds = [caseRow.customer_id, caseRow.site_customer_id].filter(
      (id): id is string => !!id
    )

    if (customerIds.length === 0) {
      return { success: true, contacts: [] }
    }

    const { data: contacts, error } = await supabase
      .from('customer_contacts')
      .select('id, customer_id, name, email, phone, mobile, role, is_primary')
      .in('customer_id', customerIds)
      .order('is_primary', { ascending: false })
      .order('name', { ascending: true })

    if (error) {
      return { success: false, error: 'Kunne ikke hente kontakter' }
    }

    const enriched = (contacts || []).map((c) => ({
      ...c,
      role: c.role as CustomerContactRole | null,
      parent_label: (c.customer_id === caseRow.customer_id ? 'paying' : 'site') as
        | 'paying'
        | 'site',
    }))

    return { success: true, contacts: enriched as never }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Uventet fejl',
    }
  }
}

// =====================================================
// searchCustomers (til site_customer dropdown)
// =====================================================

export interface CustomerSearchResult {
  id: string
  customer_number: string
  company_name: string
  contact_person: string | null
  email: string | null
}

/**
 * Søg blandt kunder for at vælge leveringskunde. Returnerer max 10
 * resultater. Tom query returnerer top 10 (sorteret efter
 * customer_number desc — nyeste først).
 */
export async function searchCustomersForSite(
  query: string
): Promise<{ success: boolean; results: CustomerSearchResult[]; error?: string }> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.view.all') && !hasPermission('cases.view.assigned')) {
      return { success: false, results: [], error: 'Manglende tilladelse' }
    }

    let q = supabase
      .from('customers')
      .select('id, customer_number, company_name, contact_person, email')
      .eq('is_active', true)
      .order('customer_number', { ascending: false })
      .limit(10)

    const trimmed = query.trim()
    if (trimmed.length > 0) {
      // Sanitér så bruger ikke kan injecte ',' i .or()
      const safe = trimmed.replace(/[,()]/g, ' ').substring(0, 100)
      q = q.or(
        `company_name.ilike.%${safe}%,customer_number.ilike.%${safe}%,email.ilike.%${safe}%`
      )
    }

    const { data, error } = await q
    if (error) {
      return { success: false, results: [], error: 'Søgning fejlede' }
    }

    return { success: true, results: (data || []) as CustomerSearchResult[] }
  } catch (err) {
    return {
      success: false,
      results: [],
      error: err instanceof Error ? err.message : 'Uventet fejl',
    }
  }
}
