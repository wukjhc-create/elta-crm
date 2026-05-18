'use server'

/**
 * Sprint 9F Phase 6a — Routing-preview / shadow-router (read-only).
 *
 * Beregner "hvad fremtidig sagspartner-routing ville have anbefalet"
 * for en service-case eller en besigtigelse, uden at aendre faktisk
 * mail-afsendelse.
 *
 * VIGTIGT:
 *  - Ingen INSERT / UPDATE.
 *  - Ingen sendMail-kald.
 *  - Ingen aendring af resolveres faktiske output.
 *  - Resultatet er kun til log-meta og audit (shadow_only=true).
 *
 * Scope i Phase 6a:
 *  - service-case confirmation (intent = 'task_practical' i resolveren)
 *  - besigtigelse (intent = 'besigtigelse')
 *
 * Tilbud / faktura / rykker er bevidst IKKE implementeret her — de
 * kraever migration paa offers/invoices i Phase 6c/6d.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import {
  type MailRoute,
  type MailIntent,
  type PartyRolesSnapshot,
  type RecommendedRoute,
  type RoutePreview,
  type RoutingDivergence,
  normalizeEmail,
  isInternalEmail,
} from '@/lib/services/mail-routing'

// =====================================================
// Feature flag
// =====================================================

/**
 * Default: OFF naar env ikke er sat. Skal eksplicit slaaes til med
 * MAIL_ROUTING_SHADOW_LOG='1' eller 'true' i Vercel env. Saa vi har
 * en sikker production rollout — preview koerer ikke foer vi vil
 * have data.
 */
export async function isShadowLogEnabled(): Promise<boolean> {
  const raw = (process.env.MAIL_ROUTING_SHADOW_LOG || '').toLowerCase().trim()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

// =====================================================
// DB-shape helpers
// =====================================================

/**
 * service_cases-row med alle sagspartner-felter + joinet customer-data
 * for hver rolle. Alle joins er nullable fordi felterne er optional.
 */
interface ServiceCaseWithParties {
  id: string
  case_number: string | null
  customer_id: string | null
  orderer_customer_id: string | null
  end_customer_id: string | null
  payer_customer_id: string | null
  purchased_from_customer_id: string | null
  billing_mode: string | null
  site_customer_id?: string | null
  site_contact_id?: string | null
  customer: CustomerLike | null
  orderer_customer: CustomerLike | null
  end_customer: CustomerLike | null
  payer_customer: CustomerLike | null
  site_customer: CustomerLike | null
  site_contact: ContactLike | null
}

interface CustomerLike {
  id: string
  company_name: string | null
  email: string | null
}

interface ContactLike {
  id: string
  name: string | null
  email: string | null
  customer_id?: string | null
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] || null
  return value
}

// =====================================================
// Internal: load service case with all party joins
// =====================================================

async function loadServiceCaseWithParties(
  caseId: string
): Promise<ServiceCaseWithParties | null> {
  const supabase = createAdminClient()

  // Probe schema for optional site_customer_id / site_contact_id —
  // migration 00111 er ikke garanteret i alle miljoer iflg. 00112-noten.
  // Vi bygger selecten dynamisk for at undgaa PostgREST-fejl.
  const baseSelect = `
    id, case_number, customer_id,
    orderer_customer_id, end_customer_id, payer_customer_id,
    purchased_from_customer_id, billing_mode,
    customer:customers!service_cases_customer_id_fkey(id, company_name, email),
    orderer_customer:customers!service_cases_orderer_customer_id_fkey(id, company_name, email),
    end_customer:customers!service_cases_end_customer_id_fkey(id, company_name, email),
    payer_customer:customers!service_cases_payer_customer_id_fkey(id, company_name, email)
  `

  const fullSelect = `
    ${baseSelect},
    site_customer_id, site_contact_id,
    site_customer:customers!service_cases_site_customer_id_fkey(id, company_name, email),
    site_contact:customer_contacts!service_cases_site_contact_id_fkey(id, name, email, customer_id)
  `

  // Try full select first; fall back if optional joins fail (skema mangler).
  let row: unknown = null
  const { data: fullData, error: fullErr } = await supabase
    .from('service_cases')
    .select(fullSelect)
    .eq('id', caseId)
    .maybeSingle()

  if (!fullErr && fullData) {
    row = fullData
  } else {
    const { data: baseData, error: baseErr } = await supabase
      .from('service_cases')
      .select(baseSelect)
      .eq('id', caseId)
      .maybeSingle()
    if (baseErr) {
      logger.warn('Route preview: service_case base load failed', {
        error: baseErr,
        entityId: caseId,
      })
      return null
    }
    row = baseData
  }

  if (!row) return null

  const r = row as Record<string, unknown>
  return {
    id: String(r.id || ''),
    case_number: (r.case_number as string) || null,
    customer_id: (r.customer_id as string) || null,
    orderer_customer_id: (r.orderer_customer_id as string) || null,
    end_customer_id: (r.end_customer_id as string) || null,
    payer_customer_id: (r.payer_customer_id as string) || null,
    purchased_from_customer_id: (r.purchased_from_customer_id as string) || null,
    billing_mode: (r.billing_mode as string) || null,
    site_customer_id: (r.site_customer_id as string) || null,
    site_contact_id: (r.site_contact_id as string) || null,
    customer: pickOne<CustomerLike>(r.customer as CustomerLike | CustomerLike[] | null),
    orderer_customer: pickOne<CustomerLike>(r.orderer_customer as CustomerLike | CustomerLike[] | null),
    end_customer: pickOne<CustomerLike>(r.end_customer as CustomerLike | CustomerLike[] | null),
    payer_customer: pickOne<CustomerLike>(r.payer_customer as CustomerLike | CustomerLike[] | null),
    site_customer: pickOne<CustomerLike>(r.site_customer as CustomerLike | CustomerLike[] | null),
    site_contact: pickOne<ContactLike>(r.site_contact as ContactLike | ContactLike[] | null),
  }
}

// =====================================================
// Snapshot builder
// =====================================================

function buildPartyRolesSnapshot(sc: ServiceCaseWithParties): PartyRolesSnapshot {
  return {
    customerId: sc.customer_id,
    ordererCustomerId: sc.orderer_customer_id,
    endCustomerId: sc.end_customer_id,
    payerCustomerId: sc.payer_customer_id,
    siteCustomerId: sc.site_customer_id || null,
    siteContactId: sc.site_contact_id || null,
    purchasedFromCustomerId: sc.purchased_from_customer_id,
    billingMode: sc.billing_mode,
  }
}

function pickExternalEmail(candidate: { email?: string | null } | null): string | null {
  if (!candidate?.email) return null
  const n = normalizeEmail(candidate.email)
  if (!n) return null
  if (isInternalEmail(n)) return null
  return n
}

// =====================================================
// Recommended-route computation
// =====================================================

/**
 * For task_practical / service-case confirmation:
 * Anbefaling = site_contact > site_customer > end_customer > orderer > payer > customer.
 *
 * Rationale: operativ/praktisk besked skal foerst til den der fysisk
 * skal vaere paa stedet (site_contact), saa til den slutkunde der
 * ejer anlaegget, saa til bestilleren, saa til betaler. Dette er
 * "hvor fremtidig routing ville have ramt" — IKKE det vi faktisk
 * sender til.
 */
function recommendForServiceCaseConfirmation(
  sc: ServiceCaseWithParties
): RecommendedRoute {
  const candidates: Array<{
    label: string
    role: RecommendedRoute['recipientRole']
    customer?: CustomerLike | null
    contact?: ContactLike | null
    customerId?: string | null
    contactId?: string | null
  }> = [
    { label: 'site_contact', role: 'site_contact', contact: sc.site_contact, contactId: sc.site_contact?.id },
    { label: 'site_customer', role: 'site_customer', customer: sc.site_customer, customerId: sc.site_customer?.id },
    { label: 'end_customer', role: 'site_customer', customer: sc.end_customer, customerId: sc.end_customer?.id },
    { label: 'orderer_customer', role: 'ordering_contact', customer: sc.orderer_customer, customerId: sc.orderer_customer?.id },
    { label: 'payer_customer', role: 'paying_customer', customer: sc.payer_customer, customerId: sc.payer_customer?.id },
    { label: 'customer', role: 'paying_customer', customer: sc.customer, customerId: sc.customer?.id },
  ]

  for (const c of candidates) {
    const target = (c.contact || c.customer) ?? null
    const email = pickExternalEmail(target)
    if (!email) continue
    const toName =
      (c.contact?.name as string | undefined) ||
      (c.customer?.company_name as string | undefined) ||
      null
    return {
      toEmail: email,
      toName,
      recipientRole: c.role,
      intent: 'task_practical',
      reason: `Phase 6a recommend: ${c.label} (sagspartner-prioritet)`,
      resolvedFromCustomerId: c.customerId || null,
      resolvedFromContactId: c.contactId || null,
    }
  }

  return {
    toEmail: null,
    recipientRole: 'unresolved',
    intent: 'task_practical',
    reason: 'Phase 6a recommend: ingen ekstern email fundet paa nogen sagspartner',
    unresolved: true,
    errorCode: 'NO_PARTY_EMAIL',
  }
}

/**
 * For besigtigelse:
 * Samme prioritet som service-case confirmation, men intent='besigtigelse'.
 */
function recommendForBesigtigelse(
  sc: ServiceCaseWithParties | null,
  fallbackCustomer: CustomerLike | null
): RecommendedRoute {
  if (sc) {
    const sub = recommendForServiceCaseConfirmation(sc)
    return { ...sub, intent: 'besigtigelse', reason: sub.reason.replace('Phase 6a', 'Phase 6a besigtigelse') }
  }
  const email = pickExternalEmail(fallbackCustomer)
  if (email) {
    return {
      toEmail: email,
      toName: fallbackCustomer?.company_name || null,
      recipientRole: 'paying_customer',
      intent: 'besigtigelse',
      reason: 'Phase 6a recommend: besigtigelse uden sag — falder paa customer.email',
      resolvedFromCustomerId: fallbackCustomer?.id || null,
    }
  }
  return {
    toEmail: null,
    recipientRole: 'unresolved',
    intent: 'besigtigelse',
    reason: 'Phase 6a recommend: ingen sag og ingen customer-email',
    unresolved: true,
    errorCode: 'NO_PARTY_EMAIL',
  }
}

// =====================================================
// Divergence comparator
// =====================================================

function compareRoutes(
  current: MailRoute,
  recommended: RecommendedRoute
): { divergence: RoutingDivergence; reason: string } {
  if (recommended.unresolved || !recommended.toEmail) {
    return {
      divergence: 'error',
      reason: recommended.reason,
    }
  }

  const curEmail = normalizeEmail(current.toEmail)
  const recEmail = normalizeEmail(recommended.toEmail)

  if (curEmail !== recEmail) {
    return {
      divergence: 'recipient',
      reason: `Recipient ville aendres: ${curEmail || '(tom)'} -> ${recEmail}`,
    }
  }
  if (current.recipientRole !== recommended.recipientRole) {
    return {
      divergence: 'role_only',
      reason: `Samme email, anden rolle-label: ${current.recipientRole} -> ${recommended.recipientRole}`,
    }
  }
  return { divergence: 'none', reason: 'Nuvaerende og anbefalet route er identiske' }
}

// =====================================================
// Public API
// =====================================================

/**
 * Beregn route-preview for en service-case confirmation.
 *
 * @param caseId  service_cases.id
 * @param currentRoute  MailRoute returneret af eksisterende resolver
 * @returns RoutePreview eller null hvis sagen ikke kunne loades
 */
export async function getServiceCaseRoutePreview(
  caseId: string,
  currentRoute: MailRoute
): Promise<RoutePreview | null> {
  try {
    validateUUID(caseId, 'caseId')
  } catch {
    return null
  }

  const sc = await loadServiceCaseWithParties(caseId)
  if (!sc) return null

  const partyRoles = buildPartyRolesSnapshot(sc)
  const recommended = recommendForServiceCaseConfirmation(sc)
  const { divergence, reason } = compareRoutes(currentRoute, recommended)

  return {
    current: {
      toEmail: currentRoute.toEmail,
      recipientRole: currentRoute.recipientRole,
      reason: currentRoute.reason,
    },
    recommended,
    divergence,
    divergenceReason: reason,
    partyRoles,
  }
}

/**
 * Beregn route-preview for en besigtigelse.
 *
 * Besigtigelse-flowet kan have serviceCaseId=null (sendt fra kundekortet
 * uden sag), saa vi falder tilbage paa customer-row.
 */
export async function getBesigtigelseRoutePreview(
  customerId: string,
  serviceCaseId: string | null,
  currentRoute: MailRoute
): Promise<RoutePreview | null> {
  try {
    validateUUID(customerId, 'customerId')
    if (serviceCaseId) validateUUID(serviceCaseId, 'serviceCaseId')
  } catch {
    return null
  }

  const supabase = createAdminClient()

  let sc: ServiceCaseWithParties | null = null
  if (serviceCaseId) {
    sc = await loadServiceCaseWithParties(serviceCaseId)
  }

  // Fetch customer separately for case-less besigtigelse fallback.
  let fallbackCustomer: CustomerLike | null = null
  if (!sc) {
    const { data } = await supabase
      .from('customers')
      .select('id, company_name, email')
      .eq('id', customerId)
      .maybeSingle()
    fallbackCustomer = (data as CustomerLike | null) || null
  }

  const partyRoles: PartyRolesSnapshot = sc
    ? buildPartyRolesSnapshot(sc)
    : { customerId }

  const recommended = recommendForBesigtigelse(sc, fallbackCustomer)
  const { divergence, reason } = compareRoutes(currentRoute, recommended)

  return {
    current: {
      toEmail: currentRoute.toEmail,
      recipientRole: currentRoute.recipientRole,
      reason: currentRoute.reason,
    },
    recommended,
    divergence,
    divergenceReason: reason,
    partyRoles,
  }
}

/**
 * Convenience-wrapper: byg log-meta-extras for shadow-log.
 *
 * Caller passer denne struktur ind i logMailRoute's meta-parameter
 * uden at skulle kende det interne shape.
 */
export interface ShadowLogMetaExtras {
  shadow_only: true
  party_roles: PartyRolesSnapshot
  current_route: { to: string; role: string }
  recommended_route: {
    to: string | null
    role: string
    reason: string
    error_code?: string
  }
  routing_divergence: RoutingDivergence
  divergence_reason: string
}

export async function buildShadowLogMeta(
  preview: RoutePreview
): Promise<ShadowLogMetaExtras> {
  return {
    shadow_only: true,
    party_roles: preview.partyRoles,
    current_route: {
      to: preview.current.toEmail,
      role: preview.current.recipientRole,
    },
    recommended_route: {
      to: preview.recommended.toEmail,
      role: preview.recommended.recipientRole,
      reason: preview.recommended.reason,
      ...(preview.recommended.errorCode ? { error_code: preview.recommended.errorCode } : {}),
    },
    routing_divergence: preview.divergence,
    divergence_reason: preview.divergenceReason,
  }
}

// =====================================================
// Future scope (NOT implemented in Phase 6a)
// =====================================================
//
// Tilbud (resolveOfferMailRoute) og faktura (resolveInvoiceMailRoute)
// preview kraever at offers/invoices faar parti-rolle-kolonner i en
// kommende migration (Phase 6c/6d). Indtil dette er paa plads ville
// recommended altid = current, og preview giver ingen mening.
//
// Naar Phase 6c/6d er klar, foeges hertil:
//   - getOfferRoutePreview(offerId, currentRoute)
//   - getInvoiceRoutePreview(invoiceId, currentRoute, isReminder)
//
// Med samme strikte regler: read-only, ingen ramme paa faktisk
// recipient, kun shadow-log.
