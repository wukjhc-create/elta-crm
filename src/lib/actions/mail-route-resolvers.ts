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
 * Phase 2 udvider med offer/invoice/reminder/besigtigelse/fuldmagt.
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
