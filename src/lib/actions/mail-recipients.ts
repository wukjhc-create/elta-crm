'use server'

/**
 * Sprint 8G — Mail-modtager helper.
 *
 * Bygger en liste af mulige modtagere for en given mail/sag, så
 * brugeren kan vælge mellem betaler, site contact, kontaktpersoner
 * med rolle, eller manuel adresse.
 *
 * Returnerer ALDRIG interne @eltasolar.dk-adresser som primær modtager.
 */

import { createClient } from '@/lib/supabase/server'
import { validateUUID } from '@/lib/validations/common'
import {
  CUSTOMER_CONTACT_ROLE_LABELS,
  type CustomerContactRole,
} from '@/types/customers.types'

const INTERNAL_DOMAIN = '@eltasolar.dk'

export interface RecipientOption {
  /** Stabilt nøgle for React keys. */
  id: string
  /** Email-adressen (lowercased, trimmed). */
  email: string
  /** Visnings-label (fx "Betaler · Fasetech ApS"). */
  label: string
  /** Type-tag til UI. */
  kind: 'paying_customer' | 'site_customer' | 'site_contact' | 'role_contact' | 'manual'
  /** Hvis kind='role_contact': hvilken rolle. */
  role?: CustomerContactRole | null
  /** Kobling-id (customer_id eller customer_contact_id). */
  refId?: string
}

function isInternal(addr: string | null | undefined): boolean {
  if (!addr) return true
  return addr.toLowerCase().includes(INTERNAL_DOMAIN)
}

function normalizeEmail(addr: string | null | undefined): string | null {
  if (!addr) return null
  const trimmed = addr.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Hent alle customer_contacts for en kunde og returnér én RecipientOption
 * pr. kontakt med email.
 */
export async function getCustomerContactsByRole(
  customerId: string,
  options?: { roleFilter?: CustomerContactRole }
): Promise<RecipientOption[]> {
  validateUUID(customerId, 'customerId')
  const supabase = await createClient()

  let q = supabase
    .from('customer_contacts')
    .select('id, name, email, role, is_primary')
    .eq('customer_id', customerId)
    .not('email', 'is', null)

  if (options?.roleFilter) {
    q = q.eq('role', options.roleFilter)
  }

  const { data, error } = await q
  if (error || !data) return []

  const result: RecipientOption[] = []
  for (const c of data) {
    const email = normalizeEmail(c.email as string | null)
    if (!email || isInternal(email)) continue
    const role = (c.role as CustomerContactRole | null) || null
    const roleLabel = role ? CUSTOMER_CONTACT_ROLE_LABELS[role] : null
    const namePart = (c.name as string) || email
    const label = roleLabel
      ? `${roleLabel} · ${namePart}`
      : c.is_primary
        ? `Primær kontakt · ${namePart}`
        : `Kontakt · ${namePart}`
    result.push({
      id: `contact:${c.id}`,
      email,
      label,
      kind: 'role_contact',
      role,
      refId: c.id as string,
    })
  }
  return result
}

// Supabase JOIN returnerer arrays for embedded relations. Helper til at
// hente første row (eller null) på en kanonisk måde.
function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] || null
  return value
}

/** Sprint 8H Phase 1B: kontext-info til RecipientPicker context-bar. */
export interface RecipientContext {
  payerName: string | null
  siteCustomerName: string | null
  siteContactName: string | null
  caseNumber: string | null
}

/**
 * Byg den komplette modtager-liste for en mail på en service_case.
 * Sortering: betaler → site_customer → site_contact → øvrige kontakter.
 * Filtrerer interne adresser væk og dedupliker på email.
 */
export async function getRecipientOptionsForCase(
  serviceCaseId: string
): Promise<{ options: RecipientOption[]; defaultEmail: string | null; context: RecipientContext }> {
  validateUUID(serviceCaseId, 'serviceCaseId')
  const supabase = await createClient()

  const { data: caseRow, error } = await supabase
    .from('service_cases')
    .select(`
      id, case_number,
      customer:customers!service_cases_customer_id_fkey(id, company_name, email),
      site_customer:customers!service_cases_site_customer_id_fkey(id, company_name, email),
      site_contact:customer_contacts!service_cases_site_contact_id_fkey(
        id, name, email, role
      )
    `)
    .eq('id', serviceCaseId)
    .maybeSingle()

  if (error || !caseRow) {
    return {
      options: [],
      defaultEmail: null,
      context: { payerName: null, siteCustomerName: null, siteContactName: null, caseNumber: null },
    }
  }

  const options: RecipientOption[] = []
  const seenEmails = new Set<string>()
  const addUnique = (opt: RecipientOption) => {
    if (seenEmails.has(opt.email)) return
    seenEmails.add(opt.email)
    options.push(opt)
  }

  // Supabase JOIN-resultater kommer som arrays — pak ud
  const raw = caseRow as unknown as {
    customer?: Array<{ id: string; company_name?: string; email?: string }> | { id: string; company_name?: string; email?: string } | null
    site_customer?: Array<{ id: string; company_name?: string; email?: string }> | { id: string; company_name?: string; email?: string } | null
    site_contact?: Array<{ id: string; name?: string; email?: string; role?: string | null }> | { id: string; name?: string; email?: string; role?: string | null } | null
  }

  // 1. Betaler
  const customer = firstOrNull(raw.customer)
  if (customer?.email) {
    const email = normalizeEmail(customer.email)
    if (email && !isInternal(email)) {
      addUnique({
        id: `paying:${customer.id}`,
        email,
        label: `Betaler · ${customer.company_name || email}`,
        kind: 'paying_customer',
        refId: customer.id,
      })
    }
  }

  // 2. Leveringskunde (site_customer)
  const siteCust = firstOrNull(raw.site_customer)
  if (siteCust?.email) {
    const email = normalizeEmail(siteCust.email)
    if (email && !isInternal(email)) {
      addUnique({
        id: `site_customer:${siteCust.id}`,
        email,
        label: `Leveringskunde · ${siteCust.company_name || email}`,
        kind: 'site_customer',
        refId: siteCust.id,
      })
    }
  }

  // 3. Site contact (specifik kontaktperson)
  const siteContact = firstOrNull(raw.site_contact)
  if (siteContact?.email) {
    const email = normalizeEmail(siteContact.email)
    if (email && !isInternal(email)) {
      const role = (siteContact.role as CustomerContactRole | null) || null
      const roleLabel = role ? CUSTOMER_CONTACT_ROLE_LABELS[role] : 'Kontakt på stedet'
      addUnique({
        id: `site_contact:${siteContact.id}`,
        email,
        label: `${roleLabel} · ${siteContact.name || email}`,
        kind: 'site_contact',
        role,
        refId: siteContact.id,
      })
    }
  }

  // 4. Øvrige kontakter på betaler-kunden (alle roller)
  if (customer?.id) {
    const more = await getCustomerContactsByRole(customer.id)
    for (const opt of more) addUnique(opt)
  }

  // 5. Øvrige kontakter på site_customer (hvis forskellig fra betaler)
  if (siteCust?.id && siteCust.id !== customer?.id) {
    const more = await getCustomerContactsByRole(siteCust.id)
    for (const opt of more) addUnique(opt)
  }

  // Default: første betaler hvis findes, ellers første option, ellers null
  const defaultEmail =
    options.find((o) => o.kind === 'paying_customer')?.email ||
    options[0]?.email ||
    null

  const context: RecipientContext = {
    payerName: customer?.company_name || null,
    siteCustomerName: siteCust?.company_name || null,
    siteContactName: siteContact?.name || null,
    caseNumber: (caseRow as { case_number?: string | null }).case_number || null,
  }

  return { options, defaultEmail, context }
}

/**
 * Byg modtager-liste for en mail uden direkte sag-tilknytning.
 * Bruges fra mail-detail når incoming_email kun har customer_id.
 */
export async function getRecipientOptionsForCustomer(
  customerId: string
): Promise<{ options: RecipientOption[]; defaultEmail: string | null; context: RecipientContext }> {
  validateUUID(customerId, 'customerId')
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('id, company_name, email')
    .eq('id', customerId)
    .maybeSingle()

  const options: RecipientOption[] = []
  const seenEmails = new Set<string>()

  if (customer?.email) {
    const email = normalizeEmail(customer.email)
    if (email && !isInternal(email)) {
      seenEmails.add(email)
      options.push({
        id: `paying:${customer.id}`,
        email,
        label: `Betaler · ${customer.company_name || email}`,
        kind: 'paying_customer',
        refId: customer.id,
      })
    }
  }

  const contacts = await getCustomerContactsByRole(customerId)
  for (const c of contacts) {
    if (!seenEmails.has(c.email)) {
      seenEmails.add(c.email)
      options.push(c)
    }
  }

  const defaultEmail =
    options.find((o) => o.kind === 'paying_customer')?.email ||
    options[0]?.email ||
    null

  const context: RecipientContext = {
    payerName: customer?.company_name || null,
    siteCustomerName: null,
    siteContactName: null,
    caseNumber: null,
  }

  return { options, defaultEmail, context }
}
