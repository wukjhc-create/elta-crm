'use server'

/**
 * Sprint 8H Phase 1B — server-side resolvers for mail-routing.
 *
 * Wrappes omkring `mail-routing.ts`-service og kalder DB for at finde
 * kontekst (kunde, sag, contacts). Returnerer MailRoute eller
 * MailRouteError-besked.
 *
 * Phase 1B implementerer kun de 3 vigtigste flows:
 *   - resolveReplyRoute       (sendQuickReply)
 *   - resolveTaskMailRoute    (sendTaskEmail)
 *   - resolveCustomerMailboxReplyRoute (customer-mailbox.replyToCustomerEmail)
 *
 * Phase 2 udvider med offer/invoice/reminder.
 *
 * Phase 3 tilfoejer resolveInternalNotificationRoute for bevidst interne
 * systemmails (admin-alerts, fuldmagt admin-notif, portal CRM-notif).
 *
 * Phase 4 tilfoejer:
 *   - resolveBesigtigelseMailRoute (kunde-bekraeftelse for besigtigelse)
 *   - resolveServiceCaseConfirmationRoute (service-case bekraeftelse)
 *   - resolveManualCustomerMailRoute (ad hoc compose med fri-tekst recipient)
 *
 * Phase 5 tilfoejer:
 *   - resolveQuoteMailRoute (quote-generator, billing > paying)
 *   - resolveFuldmagtReminderRoute (fuldmagt-rykker fra cron)
 */

import { createClient } from '@/lib/supabase/server'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import {
  type MailRoute,
  type MailRouteContext,
  type RecipientRole,
  MailRouteError,
  assertExternalRecipient,
  assertValidRecipient,
  normalizeEmail,
  pickFirstExternalEmail,
  pickFromMailbox,
  defaultFromMailbox,
  buildRouteReason,
} from '@/lib/services/mail-routing'

export interface ResolvedRouteResult {
  ok: boolean
  route?: MailRoute
  error?: string
  errorCode?: string
}

function toResult(route: MailRoute): ResolvedRouteResult {
  try {
    assertExternalRecipient(route)
    return { ok: true, route }
  } catch (err) {
    if (err instanceof MailRouteError) {
      return { ok: false, error: err.message, errorCode: err.code }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Uventet routing-fejl',
      errorCode: 'UNKNOWN',
    }
  }
}

// =====================================================
// 1. resolveReplyRoute
// =====================================================

/**
 * Bygges MailRoute for reply på en incoming_email-row.
 *
 * Logik:
 *  1. Hvis caller har sendt en eksplicit recipientOverride → brug den
 *     (efter validation). Mode='manual'.
 *  2. Ellers byg candidate-liste fra reply_to / sender_email / to_email /
 *     customers.email og vælg første eksterne.
 *  3. FROM-mailbox: hvis email.to_email er @eltasolar.dk, brug det
 *     (så svaret threader på rette indbakke); ellers default.
 *  4. assertExternalRecipient håndhæver intern-guard + self-reply-block.
 */
export async function resolveReplyRoute(
  emailId: string,
  ctx?: MailRouteContext
): Promise<ResolvedRouteResult> {
  try {
    validateUUID(emailId, 'emailId')
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Ugyldigt emailId',
      errorCode: 'INVALID_INPUT',
    }
  }

  const supabase = await createClient()
  const { data: email } = await supabase
    .from('incoming_emails')
    .select(`
      id, subject, sender_email, sender_name, reply_to, to_email,
      conversation_id, customer_id, service_case_id,
      customers ( id, company_name, email )
    `)
    .eq('id', emailId)
    .maybeSingle()

  if (!email) {
    return { ok: false, error: 'Email ikke fundet', errorCode: 'NOT_FOUND' }
  }

  const customerJoin = (email as { customers?: { id?: string; company_name?: string; email?: string } | null }).customers
  const payerName = customerJoin?.company_name || null
  const fromMailbox = pickFromMailbox(email.to_email)

  // 1. Eksplicit override
  if (ctx?.recipientOverride && ctx.recipientOverride.trim()) {
    try {
      assertValidRecipient(ctx.recipientOverride)
    } catch (err) {
      if (err instanceof MailRouteError) {
        return { ok: false, error: err.message, errorCode: err.code }
      }
      throw err
    }
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(ctx.recipientOverride),
      toName: null,
      recipientRole: 'manual',
      intent: 'manual',
      customerId: email.customer_id || null,
      serviceCaseId: email.service_case_id || null,
      customerContactId: ctx.customerContactIdOverride || null,
      reason: buildRouteReason('manual', 'manual', {
        payerName,
        manualNote: 'Bruger valgte modtager i picker',
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 2. Candidates
  const candidates = [
    email.reply_to,
    email.sender_email,
    email.to_email,
    customerJoin?.email,
  ]
  const picked = pickFirstExternalEmail(candidates)

  if (!picked) {
    return {
      ok: false,
      error:
        'Kan ikke finde kundens mailadresse. Mailen er enten intern, eller modtageren er ikke registreret.',
      errorCode: 'NO_EXTERNAL_RECIPIENT',
    }
  }

  // Bestem intent: hvis sender_email er intern, er dette en outbound
  // mirror — vi er reply_thread (svar på vores egen tråd til kunden).
  // Ellers reply_inbound.
  const senderInternal = normalizeEmail(email.sender_email).includes('@eltasolar.dk')
  const intent = senderInternal ? 'reply_thread' : 'reply_inbound'

  const route: MailRoute = {
    fromMailbox,
    toEmail: picked,
    toName: email.sender_name || null,
    recipientRole: 'paying_customer', // bedste gæt — picker kan overrule
    intent,
    customerId: email.customer_id || null,
    serviceCaseId: email.service_case_id || null,
    customerContactId: null,
    reason: buildRouteReason(intent, 'paying_customer', {
      payerName,
    }),
    isInternalAllowed: false,
  }
  return toResult(route)
}

// =====================================================
// 2. resolveTaskMailRoute
// =====================================================

/**
 * MailRoute for sendTaskEmail. Brugeren har typisk valgt modtager via
 * RecipientPicker (recipientOverride). Hvis ingen override: brug
 * customer.email som default.
 */
export async function resolveTaskMailRoute(
  taskId: string,
  ctx?: MailRouteContext
): Promise<ResolvedRouteResult> {
  try {
    validateUUID(taskId, 'taskId')
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Ugyldigt taskId',
      errorCode: 'INVALID_INPUT',
    }
  }

  const supabase = await createClient()
  const { data: task } = await supabase
    .from('customer_tasks')
    .select(`
      id, customer_id, service_case_id,
      customers ( id, company_name, email )
    `)
    .eq('id', taskId)
    .maybeSingle()

  if (!task) {
    return { ok: false, error: 'Opgave ikke fundet', errorCode: 'NOT_FOUND' }
  }

  if (!task.customer_id) {
    return {
      ok: false,
      error: 'Opgaven har ingen tilknyttet kunde',
      errorCode: 'NO_CUSTOMER',
    }
  }

  const customerJoin = (task as { customers?: { id?: string; company_name?: string; email?: string } | null }).customers
  const payerName = customerJoin?.company_name || null
  const customerEmail = customerJoin?.email || null

  const fromMailbox = defaultFromMailbox()

  // 1. Eksplicit override
  if (ctx?.recipientOverride && ctx.recipientOverride.trim()) {
    try {
      assertValidRecipient(ctx.recipientOverride)
    } catch (err) {
      if (err instanceof MailRouteError) {
        return { ok: false, error: err.message, errorCode: err.code }
      }
      throw err
    }
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(ctx.recipientOverride),
      toName: null,
      recipientRole: 'manual',
      intent: 'manual',
      customerId: task.customer_id,
      serviceCaseId: task.service_case_id || null,
      customerContactId: ctx.customerContactIdOverride || null,
      reason: buildRouteReason('manual', 'manual', {
        payerName,
        manualNote: 'Task-mail valgt af bruger',
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 2. Default: customer.email (betaler)
  if (!customerEmail) {
    return {
      ok: false,
      error: 'Kunden mangler en email — vælg modtager manuelt',
      errorCode: 'NO_CUSTOMER_EMAIL',
    }
  }

  const route: MailRoute = {
    fromMailbox,
    toEmail: normalizeEmail(customerEmail),
    toName: customerJoin?.company_name || null,
    recipientRole: 'paying_customer',
    intent: 'task_practical',
    customerId: task.customer_id,
    serviceCaseId: task.service_case_id || null,
    customerContactId: null,
    reason: buildRouteReason('task_practical', 'paying_customer', {
      payerName,
      contactName: customerJoin?.company_name || null,
    }),
    isInternalAllowed: false,
  }
  return toResult(route)
}

// =====================================================
// 3. resolveCustomerMailboxReplyRoute
// =====================================================

/**
 * Identisk princip med resolveReplyRoute — bruges fra customer-mailbox
 * sidebar reply-flow.
 *
 * Phase 1B: deler implementation med resolveReplyRoute. Hvis flowene
 * divergerer senere, kan vi forking.
 */
export async function resolveCustomerMailboxReplyRoute(
  emailId: string,
  ctx?: MailRouteContext
): Promise<ResolvedRouteResult> {
  const result = await resolveReplyRoute(emailId, ctx)
  if (!result.ok || !result.route) return result

  // Marker reason så audit-loggen viser hvilket flow der kaldte
  const route: MailRoute = {
    ...result.route,
    reason: result.route.reason + ' [via kundesidebar]',
  }
  return { ok: true, route }
}

// =====================================================
// 4. resolveOfferMailRoute (Phase 2)
// =====================================================

/**
 * Bygger MailRoute for tilbuds-mail.
 *
 * Regler:
 *  - Default: billing_contact hvis findes, ellers paying_customer.
 *  - ALDRIG site_contact (faktura/tilbud skal til betaler, ikke
 *    arbejdspladsen).
 *  - Override fra UI er TILLADT, men recipient skal være ekstern.
 *  - fromMailbox: default GRAPH_MAILBOX (kontakt@) — tilbud sendes
 *    fra hoved-mailbox med replyTo lokalt sat af caller hvis nødvendigt.
 */
export async function resolveOfferMailRoute(
  offerId: string,
  ctx?: MailRouteContext
): Promise<ResolvedRouteResult> {
  try {
    validateUUID(offerId, 'offerId')
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Ugyldigt offerId',
      errorCode: 'INVALID_INPUT',
    }
  }

  const supabase = await createClient()
  // Sprint 12A Trin 4 — laes parti-roller + billing_mode for at vaelge
  // active party. Backfilled offers har alle parti-roller = customer_id,
  // saa adfaerden er bit-identisk med foer migrationen for gamle tilbud.
  const { data: offer } = await supabase
    .from('offers')
    .select(`
      id, offer_number, customer_id,
      orderer_customer_id, end_customer_id, payer_customer_id, billing_mode
    `)
    .eq('id', offerId)
    .maybeSingle()

  if (!offer) {
    return { ok: false, error: 'Tilbud ikke fundet', errorCode: 'NOT_FOUND' }
  }
  if (!offer.customer_id) {
    return {
      ok: false,
      error: 'Tilbud har ingen tilknyttet kunde',
      errorCode: 'NO_CUSTOMER',
    }
  }

  const fromMailbox = defaultFromMailbox()

  // 1. Override (manual) — top-prioritet, foer parti-rolle-logik
  if (ctx?.recipientOverride && ctx.recipientOverride.trim()) {
    try {
      assertValidRecipient(ctx.recipientOverride)
    } catch (err) {
      if (err instanceof MailRouteError) {
        return { ok: false, error: err.message, errorCode: err.code }
      }
      throw err
    }
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(ctx.recipientOverride),
      toName: null,
      recipientRole: 'manual',
      intent: 'offer',
      customerId: offer.customer_id as string,
      serviceCaseId: null,
      customerContactId: ctx.customerContactIdOverride || null,
      reason: buildRouteReason('offer', 'manual', {
        manualNote: `Tilbud ${offer.offer_number}`,
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 2. Sprint 12A Trin 4 — vaelg active party customer via billing_mode-switch.
  //    Hvis valgt rolle mangler, fald tilbage til customer_id (matcher
  //    backfill-paterns og bevarer no-regression for gamle tilbud).
  const billingMode = (offer.billing_mode as string | null) || 'same_as_customer'
  let activePartyCustomerId: string
  switch (billingMode) {
    case 'end_customer_pays':
      activePartyCustomerId =
        (offer.end_customer_id as string | null) || (offer.customer_id as string)
      break
    case 'third_party_pays':
      activePartyCustomerId =
        (offer.payer_customer_id as string | null) || (offer.customer_id as string)
      break
    case 'orderer_pays':
    case 'same_as_customer':
    case 'unknown':
    default:
      activePartyCustomerId =
        (offer.orderer_customer_id as string | null) || (offer.customer_id as string)
      break
  }

  // 3. Hent active-party customer + dens billing-contact
  const { data: activeCustomer } = await supabase
    .from('customers')
    .select('id, company_name, email')
    .eq('id', activePartyCustomerId)
    .maybeSingle()

  const payerName = (activeCustomer?.company_name as string | undefined) || null

  // 4. Billing contact under active party
  const { data: billingContact } = await supabase
    .from('customer_contacts')
    .select('id, name, email')
    .eq('customer_id', activePartyCustomerId)
    .eq('role', 'billing')
    .not('email', 'is', null)
    .limit(1)
    .maybeSingle()

  if (billingContact?.email && !normalizeEmail(billingContact.email as string).includes('@eltasolar.dk')) {
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(billingContact.email as string),
      toName: (billingContact.name as string | null) || null,
      recipientRole: 'billing_contact',
      intent: 'offer',
      customerId: activePartyCustomerId,
      serviceCaseId: null,
      customerContactId: billingContact.id as string,
      reason: buildRouteReason('offer', 'billing_contact', {
        payerName,
        contactName: (billingContact.name as string | null) || null,
        manualNote: `billing_mode=${billingMode}`,
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 5. Fallback: customer.email paa active party
  if (!activeCustomer?.email) {
    return {
      ok: false,
      error: 'Kunden mangler en email — sæt customer.email eller billing-kontakt',
      errorCode: 'NO_CUSTOMER_EMAIL',
    }
  }

  const route: MailRoute = {
    fromMailbox,
    toEmail: normalizeEmail(activeCustomer.email as string),
    toName: (activeCustomer.company_name as string | null) || null,
    // Sprint 12A — per audit-beslutning: brug paying_customer for alle
    // active-party-valg for backward-compat med eksisterende log-data.
    // Faktisk valgt parti-rolle er logget i shadow-meta (Phase 6a).
    recipientRole: 'paying_customer',
    intent: 'offer',
    customerId: activePartyCustomerId,
    serviceCaseId: null,
    customerContactId: null,
    reason: buildRouteReason('offer', 'paying_customer', {
      payerName,
      manualNote: `billing_mode=${billingMode}`,
    }),
    isInternalAllowed: false,
  }
  return toResult(route)
}

// =====================================================
// 5. resolveInvoiceMailRoute (Phase 2)
// =====================================================

/**
 * Som resolveOfferMailRoute, men for faktura. intent='invoice'.
 */
export async function resolveInvoiceMailRoute(
  invoiceId: string,
  ctx?: MailRouteContext & { isReminder?: boolean; fromMailboxOverride?: string }
): Promise<ResolvedRouteResult> {
  try {
    validateUUID(invoiceId, 'invoiceId')
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Ugyldigt invoiceId',
      errorCode: 'INVALID_INPUT',
    }
  }

  const supabase = await createClient()
  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, customer_id,
      customers ( id, company_name, email )
    `)
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice) {
    return { ok: false, error: 'Faktura ikke fundet', errorCode: 'NOT_FOUND' }
  }
  if (!invoice.customer_id) {
    return {
      ok: false,
      error: 'Faktura har ingen tilknyttet kunde',
      errorCode: 'NO_CUSTOMER',
    }
  }

  const customerJoin = (invoice as { customers?: { id?: string; company_name?: string; email?: string } | null }).customers
  const payerName = customerJoin?.company_name || null
  const fromMailbox = ctx?.fromMailboxOverride || defaultFromMailbox()
  const intent = ctx?.isReminder ? 'invoice_reminder' : 'invoice'

  // 1. Override
  if (ctx?.recipientOverride && ctx.recipientOverride.trim()) {
    try {
      assertValidRecipient(ctx.recipientOverride)
    } catch (err) {
      if (err instanceof MailRouteError) {
        return { ok: false, error: err.message, errorCode: err.code }
      }
      throw err
    }
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(ctx.recipientOverride),
      toName: null,
      recipientRole: 'manual',
      intent,
      customerId: invoice.customer_id,
      serviceCaseId: null,
      customerContactId: ctx.customerContactIdOverride || null,
      reason: buildRouteReason(intent, 'manual', {
        payerName,
        manualNote: `Faktura ${invoice.invoice_number}`,
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 2. Billing contact
  const { data: billingContact } = await supabase
    .from('customer_contacts')
    .select('id, name, email')
    .eq('customer_id', invoice.customer_id)
    .eq('role', 'billing')
    .not('email', 'is', null)
    .limit(1)
    .maybeSingle()

  if (billingContact?.email && !normalizeEmail(billingContact.email).includes('@eltasolar.dk')) {
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(billingContact.email),
      toName: billingContact.name || null,
      recipientRole: 'billing_contact',
      intent,
      customerId: invoice.customer_id,
      serviceCaseId: null,
      customerContactId: billingContact.id as string,
      reason: buildRouteReason(intent, 'billing_contact', {
        payerName,
        contactName: billingContact.name,
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 3. Fallback: customer.email
  if (!customerJoin?.email) {
    return {
      ok: false,
      error: 'Kunden mangler en email — sæt customer.email eller billing-kontakt',
      errorCode: 'NO_CUSTOMER_EMAIL',
    }
  }

  const route: MailRoute = {
    fromMailbox,
    toEmail: normalizeEmail(customerJoin.email),
    toName: customerJoin.company_name || null,
    recipientRole: 'paying_customer',
    intent,
    customerId: invoice.customer_id,
    serviceCaseId: null,
    customerContactId: null,
    reason: buildRouteReason(intent, 'paying_customer', { payerName }),
    isInternalAllowed: false,
  }
  return toResult(route)
}

// =====================================================
// 6. resolveOfferReminderRoute (Phase 2)
// =====================================================

/**
 * Tilbuds-rykker — samme route som tilbud, men intent='offer'
 * markeres som reminder via reason.
 */
export async function resolveOfferReminderRoute(
  offerId: string,
  ctx?: MailRouteContext
): Promise<ResolvedRouteResult> {
  const result = await resolveOfferMailRoute(offerId, ctx)
  if (!result.ok || !result.route) return result
  return {
    ok: true,
    route: {
      ...result.route,
      reason: result.route.reason + ' [rykker]',
    },
  }
}

// =====================================================
// 7. resolveBesigtigelseMailRoute (Phase 4)
// =====================================================

/**
 * Sprint 8H Phase 4 — besigtigelse/site-visit bekraeftelse til kunde.
 *
 * Recipient-prioritet:
 *   1. site_contact (hvis serviceCaseId og kontakt har email)
 *   2. site_customer (hvis serviceCaseId og leveringskunde har email)
 *   3. customer.email (paying_customer)
 *
 * intent='besigtigelse'. Maa aldrig pege paa @eltasolar.dk
 * (assertExternalRecipient enforcer).
 *
 * Bruger admin-client til DB-lookups saa resolveren ogsaa kan kaldes
 * fra portal-anon kontekst (kun read-only af kunde/kontakt-email).
 */
export async function resolveBesigtigelseMailRoute(
  customerId: string,
  serviceCaseId?: string | null,
  ctx?: MailRouteContext
): Promise<ResolvedRouteResult> {
  try {
    validateUUID(customerId, 'customerId')
    if (serviceCaseId) validateUUID(serviceCaseId, 'serviceCaseId')
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Ugyldigt id',
      errorCode: 'INVALID_INPUT',
    }
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('id, company_name, email')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer) {
    return { ok: false, error: 'Kunde ikke fundet', errorCode: 'NOT_FOUND' }
  }

  let siteContact: { id: string; name?: string | null; email?: string | null } | null = null
  let siteCustomer: { id: string; company_name?: string | null; email?: string | null } | null = null
  if (serviceCaseId) {
    const { data: caseRow } = await supabase
      .from('service_cases')
      .select(`
        id,
        site_contact:customer_contacts!service_cases_site_contact_id_fkey(id, name, email),
        site_customer:customers!service_cases_site_customer_id_fkey(id, company_name, email)
      `)
      .eq('id', serviceCaseId)
      .maybeSingle()
    if (caseRow) {
      const raw = caseRow as unknown as {
        site_contact?: Array<{ id: string; name?: string | null; email?: string | null }> | { id: string; name?: string | null; email?: string | null } | null
        site_customer?: Array<{ id: string; company_name?: string | null; email?: string | null }> | { id: string; company_name?: string | null; email?: string | null } | null
      }
      siteContact = Array.isArray(raw.site_contact) ? raw.site_contact[0] || null : raw.site_contact || null
      siteCustomer = Array.isArray(raw.site_customer) ? raw.site_customer[0] || null : raw.site_customer || null
    }
  }

  const fromMailbox = defaultFromMailbox()
  const payerName = customer.company_name || null

  // 0. Override (manual)
  if (ctx?.recipientOverride && ctx.recipientOverride.trim()) {
    try {
      assertValidRecipient(ctx.recipientOverride)
    } catch (err) {
      if (err instanceof MailRouteError) {
        return { ok: false, error: err.message, errorCode: err.code }
      }
      throw err
    }
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(ctx.recipientOverride),
      toName: null,
      recipientRole: 'manual',
      intent: 'besigtigelse',
      customerId,
      serviceCaseId: serviceCaseId || null,
      customerContactId: ctx.customerContactIdOverride || null,
      reason: buildRouteReason('besigtigelse', 'manual', {
        payerName,
        manualNote: 'Besigtigelse — manuel modtager',
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 1. site_contact
  if (siteContact?.email && !normalizeEmail(siteContact.email).includes('@eltasolar.dk')) {
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(siteContact.email),
      toName: siteContact.name || null,
      recipientRole: 'site_contact',
      intent: 'besigtigelse',
      customerId,
      serviceCaseId: serviceCaseId || null,
      customerContactId: siteContact.id,
      reason: buildRouteReason('besigtigelse', 'site_contact', {
        payerName,
        contactName: siteContact.name,
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 2. site_customer
  if (siteCustomer?.email && !normalizeEmail(siteCustomer.email).includes('@eltasolar.dk')) {
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(siteCustomer.email),
      toName: siteCustomer.company_name || null,
      recipientRole: 'site_customer',
      intent: 'besigtigelse',
      customerId,
      serviceCaseId: serviceCaseId || null,
      customerContactId: null,
      siteCustomerId: siteCustomer.id,
      reason: buildRouteReason('besigtigelse', 'site_customer', {
        payerName,
        contactName: siteCustomer.company_name,
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 3. Fallback: paying_customer
  if (!customer.email) {
    return {
      ok: false,
      error: 'Kunden mangler en email — saet customer.email eller site-kontakt',
      errorCode: 'NO_CUSTOMER_EMAIL',
    }
  }
  const route: MailRoute = {
    fromMailbox,
    toEmail: normalizeEmail(customer.email),
    toName: customer.company_name || null,
    recipientRole: 'paying_customer',
    intent: 'besigtigelse',
    customerId,
    serviceCaseId: serviceCaseId || null,
    customerContactId: null,
    reason: buildRouteReason('besigtigelse', 'paying_customer', { payerName }),
    isInternalAllowed: false,
  }
  return toResult(route)
}

// =====================================================
// 8. resolveServiceCaseConfirmationRoute (Phase 4)
// =====================================================

/**
 * Sprint 8H Phase 4 — bekraeftelse paa service-case oprettelse.
 *
 * Recipient-prioritet (samme som besigtigelse):
 *   1. site_contact
 *   2. site_customer
 *   3. paying_customer
 *
 * intent='task_practical' (praktisk kunde-bekraeftelse). billing_contact
 * bruges ALDRIG som default, da dette ikke er en faktura.
 */
export async function resolveServiceCaseConfirmationRoute(
  caseId: string,
  ctx?: MailRouteContext
): Promise<ResolvedRouteResult> {
  try {
    validateUUID(caseId, 'caseId')
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Ugyldigt caseId',
      errorCode: 'INVALID_INPUT',
    }
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()

  const { data: caseRow } = await supabase
    .from('service_cases')
    .select(`
      id, case_number, customer_id,
      customer:customers!service_cases_customer_id_fkey(id, company_name, email),
      site_customer:customers!service_cases_site_customer_id_fkey(id, company_name, email),
      site_contact:customer_contacts!service_cases_site_contact_id_fkey(id, name, email)
    `)
    .eq('id', caseId)
    .maybeSingle()
  if (!caseRow) {
    return { ok: false, error: 'Sag ikke fundet', errorCode: 'NOT_FOUND' }
  }

  const raw = caseRow as unknown as {
    case_number?: string | null
    customer_id?: string
    customer?: Array<{ id: string; company_name?: string | null; email?: string | null }> | { id: string; company_name?: string | null; email?: string | null } | null
    site_customer?: Array<{ id: string; company_name?: string | null; email?: string | null }> | { id: string; company_name?: string | null; email?: string | null } | null
    site_contact?: Array<{ id: string; name?: string | null; email?: string | null }> | { id: string; name?: string | null; email?: string | null } | null
  }
  const customer = Array.isArray(raw.customer) ? raw.customer[0] || null : raw.customer
  const siteCustomer = Array.isArray(raw.site_customer) ? raw.site_customer[0] || null : raw.site_customer
  const siteContact = Array.isArray(raw.site_contact) ? raw.site_contact[0] || null : raw.site_contact
  const customerId = raw.customer_id || customer?.id || null
  const caseNumber = raw.case_number || null
  const payerName = customer?.company_name || null
  const fromMailbox = defaultFromMailbox()

  // 0. Override
  if (ctx?.recipientOverride && ctx.recipientOverride.trim()) {
    try {
      assertValidRecipient(ctx.recipientOverride)
    } catch (err) {
      if (err instanceof MailRouteError) {
        return { ok: false, error: err.message, errorCode: err.code }
      }
      throw err
    }
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(ctx.recipientOverride),
      toName: null,
      recipientRole: 'manual',
      intent: 'task_practical',
      customerId,
      serviceCaseId: caseId,
      customerContactId: ctx.customerContactIdOverride || null,
      reason: buildRouteReason('task_practical', 'manual', {
        payerName,
        caseNumber,
        manualNote: 'Service-case bekraeftelse',
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 1. site_contact
  if (siteContact?.email && !normalizeEmail(siteContact.email).includes('@eltasolar.dk')) {
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(siteContact.email),
      toName: siteContact.name || null,
      recipientRole: 'site_contact',
      intent: 'task_practical',
      customerId,
      serviceCaseId: caseId,
      customerContactId: siteContact.id,
      reason: buildRouteReason('task_practical', 'site_contact', {
        payerName,
        contactName: siteContact.name,
        caseNumber,
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 2. site_customer
  if (siteCustomer?.email && !normalizeEmail(siteCustomer.email).includes('@eltasolar.dk')) {
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(siteCustomer.email),
      toName: siteCustomer.company_name || null,
      recipientRole: 'site_customer',
      intent: 'task_practical',
      customerId,
      serviceCaseId: caseId,
      customerContactId: null,
      siteCustomerId: siteCustomer.id,
      reason: buildRouteReason('task_practical', 'site_customer', {
        payerName,
        contactName: siteCustomer.company_name,
        caseNumber,
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 3. Fallback: paying_customer
  if (!customer?.email) {
    return {
      ok: false,
      error: 'Kunden mangler en email — saet customer.email eller site-kontakt',
      errorCode: 'NO_CUSTOMER_EMAIL',
    }
  }
  const route: MailRoute = {
    fromMailbox,
    toEmail: normalizeEmail(customer.email),
    toName: customer.company_name || null,
    recipientRole: 'paying_customer',
    intent: 'task_practical',
    customerId,
    serviceCaseId: caseId,
    customerContactId: null,
    reason: buildRouteReason('task_practical', 'paying_customer', {
      payerName,
      caseNumber,
    }),
    isInternalAllowed: false,
  }
  return toResult(route)
}

// =====================================================
// 9. resolveManualCustomerMailRoute (Phase 4)
// =====================================================

export interface ManualCustomerMailContext {
  recipientEmail: string
  customerId?: string | null
  customerContactId?: string | null
  /** Kort label til audit, fx 'Compose: tilbud-opfoelgning'. */
  manualNote?: string | null
}

/**
 * Sprint 8H Phase 4 — wrapper for compose / ad hoc kunde-mails hvor
 * brugeren manuelt har valgt eller tastet recipient.
 *
 * Validerer at recipient er ekstern (intern-guard via
 * assertExternalRecipient) og syntaks-gyldig. intent='manual'.
 * Gætter IKKE recipient — brug resolveOfferMailRoute /
 * resolveTaskMailRoute hvis kontekst er kendt.
 */
export async function resolveManualCustomerMailRoute(
  ctx: ManualCustomerMailContext
): Promise<ResolvedRouteResult> {
  try {
    assertValidRecipient(ctx.recipientEmail)
  } catch (err) {
    if (err instanceof MailRouteError) {
      return { ok: false, error: err.message, errorCode: err.code }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Ugyldig modtager',
      errorCode: 'UNKNOWN',
    }
  }

  const route: MailRoute = {
    fromMailbox: defaultFromMailbox(),
    toEmail: normalizeEmail(ctx.recipientEmail),
    toName: null,
    recipientRole: 'manual',
    intent: 'manual',
    customerId: ctx.customerId || null,
    serviceCaseId: null,
    customerContactId: ctx.customerContactId || null,
    reason: buildRouteReason('manual', 'manual', {
      manualNote: ctx.manualNote || 'Ad hoc compose',
    }),
    isInternalAllowed: false,
  }
  return toResult(route)
}

// =====================================================
// 10. resolveQuoteMailRoute (Phase 5)
// =====================================================

export interface QuoteMailContext extends MailRouteContext {
  customerId?: string | null
  /** Recipient hvis customerId mangler eller DB ikke har email — typisk
   *  input.customer.email fra quote-generator. */
  fallbackEmail: string
  quoteReference?: string | null
}

/**
 * Sprint 8H Phase 5 — quote-generator (salgs-/monteringstilbud).
 *
 * Recipient-prioritet:
 *   1. billing_contact (hvis customerId og kontakt har email)
 *   2. customer.email fra DB (paying_customer)
 *   3. fallbackEmail (input.customer.email) — markeres som manual-rolle
 *      saa quote stadig kan sendes for ad hoc kunder uden customerId.
 *
 * intent='offer'. Bruger ALDRIG site_contact — tilbud gaar til oekonomi.
 */
export async function resolveQuoteMailRoute(
  ctx: QuoteMailContext
): Promise<ResolvedRouteResult> {
  try {
    if (ctx.customerId) validateUUID(ctx.customerId, 'customerId')
    assertValidRecipient(ctx.fallbackEmail)
  } catch (err) {
    if (err instanceof MailRouteError) {
      return { ok: false, error: err.message, errorCode: err.code }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Ugyldig input',
      errorCode: 'INVALID_INPUT',
    }
  }

  const fromMailbox = defaultFromMailbox()
  const quoteRef = ctx.quoteReference || null

  // 0. Override (manual)
  if (ctx.recipientOverride && ctx.recipientOverride.trim()) {
    try {
      assertValidRecipient(ctx.recipientOverride)
    } catch (err) {
      if (err instanceof MailRouteError) {
        return { ok: false, error: err.message, errorCode: err.code }
      }
      throw err
    }
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(ctx.recipientOverride),
      toName: null,
      recipientRole: 'manual',
      intent: 'offer',
      customerId: ctx.customerId || null,
      serviceCaseId: null,
      customerContactId: ctx.customerContactIdOverride || null,
      reason: buildRouteReason('offer', 'manual', {
        manualNote: quoteRef ? `Tilbud ${quoteRef}` : 'Tilbud',
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 1/2. Brug DB hvis customerId tilgaengelig
  if (ctx.customerId) {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()
    const { data: customer } = await supabase
      .from('customers')
      .select('id, company_name, email')
      .eq('id', ctx.customerId)
      .maybeSingle()
    const payerName = customer?.company_name || null

    const { data: billingContact } = await supabase
      .from('customer_contacts')
      .select('id, name, email')
      .eq('customer_id', ctx.customerId)
      .eq('role', 'billing')
      .not('email', 'is', null)
      .limit(1)
      .maybeSingle()

    if (billingContact?.email && !normalizeEmail(billingContact.email).includes('@eltasolar.dk')) {
      const route: MailRoute = {
        fromMailbox,
        toEmail: normalizeEmail(billingContact.email),
        toName: billingContact.name || null,
        recipientRole: 'billing_contact',
        intent: 'offer',
        customerId: ctx.customerId,
        serviceCaseId: null,
        customerContactId: billingContact.id as string,
        reason: buildRouteReason('offer', 'billing_contact', {
          payerName,
          contactName: billingContact.name,
          manualNote: quoteRef ? `Tilbud ${quoteRef}` : null,
        }),
        isInternalAllowed: false,
      }
      return toResult(route)
    }

    if (customer?.email && !normalizeEmail(customer.email).includes('@eltasolar.dk')) {
      const route: MailRoute = {
        fromMailbox,
        toEmail: normalizeEmail(customer.email),
        toName: customer.company_name || null,
        recipientRole: 'paying_customer',
        intent: 'offer',
        customerId: ctx.customerId,
        serviceCaseId: null,
        customerContactId: null,
        reason: buildRouteReason('offer', 'paying_customer', {
          payerName,
          manualNote: quoteRef ? `Tilbud ${quoteRef}` : null,
        }),
        isInternalAllowed: false,
      }
      return toResult(route)
    }
  }

  // 3. Fallback: input.customer.email som manuel — quote-generator skal
  //    stadig kunne sende selv uden customerId (ad hoc CSV/manual flow).
  const route: MailRoute = {
    fromMailbox,
    toEmail: normalizeEmail(ctx.fallbackEmail),
    toName: null,
    recipientRole: 'manual',
    intent: 'offer',
    customerId: ctx.customerId || null,
    serviceCaseId: null,
    customerContactId: null,
    reason: buildRouteReason('offer', 'manual', {
      manualNote: quoteRef
        ? `Tilbud ${quoteRef} (input-email)`
        : 'Tilbud (input-email)',
    }),
    isInternalAllowed: false,
  }
  return toResult(route)
}

// =====================================================
// 11. resolveFuldmagtReminderRoute (Phase 5)
// =====================================================

/**
 * Sprint 8H Phase 5 — rykker-mail for ubesvaret fuldmagt fra cron.
 *
 * Modtager: customer.email (paying_customer). Da cron-flowet ikke har
 * sag-kontekst, bruges ikke site-prioritet. intent='fuldmagt'.
 */
export async function resolveFuldmagtReminderRoute(
  customerId: string,
  ctx?: MailRouteContext
): Promise<ResolvedRouteResult> {
  try {
    validateUUID(customerId, 'customerId')
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Ugyldigt customerId',
      errorCode: 'INVALID_INPUT',
    }
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  const { data: customer } = await supabase
    .from('customers')
    .select('id, company_name, email')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer) {
    return { ok: false, error: 'Kunde ikke fundet', errorCode: 'NOT_FOUND' }
  }

  const fromMailbox = defaultFromMailbox()
  const payerName = customer.company_name || null

  // 0. Override
  if (ctx?.recipientOverride && ctx.recipientOverride.trim()) {
    try {
      assertValidRecipient(ctx.recipientOverride)
    } catch (err) {
      if (err instanceof MailRouteError) {
        return { ok: false, error: err.message, errorCode: err.code }
      }
      throw err
    }
    const route: MailRoute = {
      fromMailbox,
      toEmail: normalizeEmail(ctx.recipientOverride),
      toName: null,
      recipientRole: 'manual',
      intent: 'fuldmagt',
      customerId,
      serviceCaseId: null,
      customerContactId: ctx.customerContactIdOverride || null,
      reason: buildRouteReason('fuldmagt', 'manual', { payerName, manualNote: 'Fuldmagt-rykker' }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  if (!customer.email) {
    return {
      ok: false,
      error: 'Kunden mangler en email — saet customer.email',
      errorCode: 'NO_CUSTOMER_EMAIL',
    }
  }

  const route: MailRoute = {
    fromMailbox,
    toEmail: normalizeEmail(customer.email),
    toName: customer.company_name || null,
    recipientRole: 'paying_customer',
    intent: 'fuldmagt',
    customerId,
    serviceCaseId: null,
    customerContactId: null,
    reason: buildRouteReason('fuldmagt', 'paying_customer', {
      payerName,
      manualNote: 'Rykker',
    }),
    isInternalAllowed: false,
  }
  return toResult(route)
}

// =====================================================
// 12. resolveInternalNotificationRoute (Phase 3)
// =====================================================

export interface InternalNotificationContext {
  /** Intern modtager — typisk @eltasolar.dk-mailbox. */
  recipientEmail: string
  customerId?: string | null
  serviceCaseId?: string | null
  /** Kort, menneske-laesbar kontekst, fx 'admin_alert:email_sync_failed'. */
  contextLabel?: string | null
}

/**
 * Sprint 8H Phase 3 — bevidst intern systemmail.
 *
 * Maa KUN bruges til:
 *   - admin-alerts (system-advarsler til admins)
 *   - fuldmagt admin-notifikation
 *   - portal/CRM intern notifikation (rejected offer, ny portal-besked)
 *   - intern medarbejder-notifikation (fx tilbud accepteret/afvist)
 *
 * Maa IKKE bruges til kunde-mails. Routen er markeret med
 * isInternalAllowed=true og bruger kun syntaks-validering — den
 * eksterne-recipient guard er bevidst ikke kaldt, saa routen kan
 * pege paa en @eltasolar.dk-mailbox.
 */
export async function resolveInternalNotificationRoute(
  ctx: InternalNotificationContext
): Promise<ResolvedRouteResult> {
  try {
    assertValidRecipient(ctx.recipientEmail)
  } catch (err) {
    if (err instanceof MailRouteError) {
      return { ok: false, error: err.message, errorCode: err.code }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Ugyldig intern modtager',
      errorCode: 'UNKNOWN',
    }
  }

  const route: MailRoute = {
    fromMailbox: defaultFromMailbox(),
    toEmail: normalizeEmail(ctx.recipientEmail),
    toName: null,
    recipientRole: 'internal_admin',
    intent: 'internal_notification',
    customerId: ctx.customerId || null,
    serviceCaseId: ctx.serviceCaseId || null,
    customerContactId: null,
    reason: buildRouteReason('internal_notification', 'internal_admin', {
      manualNote: ctx.contextLabel || null,
    }),
    isInternalAllowed: true,
  }
  return { ok: true, route }
}

// =====================================================
// Logger helper
// =====================================================

/**
 * Log en route i én ensartet form. Bruges af sender-flows efter
 * Graph-send for at lave audit-trail.
 *
 * Sprint 9F Phase 6a — meta-parameteren er stadig et frit-form
 * Record<string, unknown>. Hvis caller saetter `shadow_only: true`
 * markerer vi log-eventet som en route-preview saa det er let at
 * filtrere i Vercel-logs (search: shadow_only true). Det aendrer
 * IKKE faktisk afsendelse.
 *
 * Eksisterende callers fortsaetter uaendret — alle nye meta-felter
 * er optional og additive.
 */
export async function logMailRoute(
  route: MailRoute,
  outcome: 'sent' | 'blocked' | 'failed',
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    const shadowOnly = !!(meta && meta.shadow_only === true)
    const divergence = (meta && typeof meta.routing_divergence === 'string')
      ? meta.routing_divergence
      : undefined

    logger.info('Mail routed', {
      action: 'mail_route',
      entity: route.serviceCaseId ? 'service_cases' : 'customers',
      entityId: route.serviceCaseId || route.customerId || undefined,
      metadata: {
        intent: route.intent,
        recipient_role: route.recipientRole,
        from: route.fromMailbox,
        to: route.toEmail,
        reason: route.reason,
        outcome,
        // Phase 6a — let-filtrerbare top-level felter for log-queries.
        // Begge er undefined for legacy-callers og bliver ikke skrevet.
        ...(shadowOnly ? { shadow: true } : {}),
        ...(divergence ? { divergence } : {}),
        ...(meta || {}),
      },
    })
  } catch {
    // Audit-log fejl maa ikke blokere selve send-flowet
  }
}
