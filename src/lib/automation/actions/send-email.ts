import type { ActionContext, ActionResult } from '@/types/automation.types'
import { BRAND_COMPANY_NAME } from '@/lib/brand'
import { isValidEmail, isInternalEmail, normalizeEmail } from '@/lib/services/mail-routing'
import { escapeHtml } from '@/lib/utils/html-escape'

/**
 * Sprint 8H Phase 5 — generic automation send-email.
 *
 * Routes IKKE gennem mail-router fordi recipient-konteksten kommer fra
 * rule_config / event-payload uden domain-kontekst (kunde, sag,
 * tilbud). Whitelisted som bevidst direkte kald, men har minimum
 * input-validering:
 *   - tom recipient -> reject
 *   - ugyldig email-syntaks -> reject
 *   - @eltasolar.dk intern -> reject (medmindre config.allow_internal=true)
 */
interface EmailConfig {
  to?: string
  subject?: string
  body_html?: string
  /** When set, pull recipient from this field of the event payload (e.g. "customer.email"). */
  to_from_payload?: string
  /** Eksplicit tilladelse til at sende til @eltasolar.dk. Default false. */
  allow_internal?: boolean
}

export async function runSendEmail(ctx: ActionContext): Promise<ActionResult> {
  const cfg = (ctx.rule.action_config || {}) as EmailConfig

  let to = cfg.to
  if (!to && cfg.to_from_payload) {
    to = readPath(ctx.event.payload, cfg.to_from_payload) as string | undefined
  }
  if (!to) return { ok: false, message: 'no recipient resolved from rule config' }

  const toNormalized = normalizeEmail(to)
  if (!toNormalized) {
    return { ok: false, message: 'empty recipient after normalization', data: { to } }
  }
  if (!isValidEmail(toNormalized)) {
    return { ok: false, message: 'invalid recipient email syntax', data: { to: toNormalized } }
  }
  if (isInternalEmail(toNormalized) && !cfg.allow_internal) {
    return {
      ok: false,
      message: 'internal recipient blocked (set allow_internal=true to override)',
      data: { to: toNormalized },
    }
  }

  const subject = cfg.subject || `Notifikation fra ${BRAND_COMPANY_NAME}`
  const html = cfg.body_html || `<p>${escapeHtml(subject)}</p>`

  if (ctx.event.globalDryRun || ctx.rule.dry_run) {
    return { ok: true, message: 'dry_run', data: { to: toNormalized, subject } }
  }

  const { isGraphConfigured, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
  if (!isGraphConfigured()) return { ok: false, message: 'Graph not configured' }

  const result = await sendEmailViaGraph({ to: toNormalized, subject, html })
  return {
    ok: result.success,
    message: result.success ? 'sent' : (result.error || 'send failed'),
    data: { to: toNormalized, subject, error: result.error },
  }
}

function readPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  let cur: unknown = obj
  for (const p of path.split('.')) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p]
    } else return undefined
  }
  return cur
}

