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
  const { data: offer } = await supabase
    .from('offers')
    .select(`
      id, offer_number, customer_id,
      customers ( id, company_name, email )
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

  const customerJoin = (offer as { customers?: { id?: string; company_name?: string; email?: string } | null }).customers
  const payerName = customerJoin?.company_name || null
  const fromMailbox = defaultFromMailbox()

  // 1. Override (manual)
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
      customerId: offer.customer_id,
      serviceCaseId: null,
      customerContactId: ctx.customerContactIdOverride || null,
      reason: buildRouteReason('offer', 'manual', {
        payerName,
        manualNote: `Tilbud ${offer.offer_number}`,
      }),
      isInternalAllowed: false,
    }
    return toResult(route)
  }

  // 2. Billing contact under betaler
  const { data: billingContact } = await supabase
    .from('customer_contacts')
    .select('id, name, email')
    .eq('customer_id', offer.customer_id)
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
      customerId: offer.customer_id,
      serviceCaseId: null,
      customerContactId: billingContact.id as string,
      reason: buildRouteReason('offer', 'billing_contact', {
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
    intent: 'offer',
    customerId: offer.customer_id,
    serviceCaseId: null,
    customerContactId: null,
    reason: buildRouteReason('offer', 'paying_customer', { payerName }),
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
// 7. resolveInternalNotificationRoute (Phase 3)
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
 */
export async function logMailRoute(
  route: MailRoute,
  outcome: 'sent' | 'blocked' | 'failed',
  meta?: Record<string, unknown>
): Promise<void> {
  try {
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
        ...(meta || {}),
      },
    })
  } catch {
    // Audit-log fejl maa ikke blokere selve send-flowet
  }
}
