import type { ActionContext, ActionResult } from '@/types/automation.types'
import { BRAND_COMPANY_NAME } from '@/lib/brand'

interface EmailConfig {
  to?: string
  subject?: string
  body_html?: string
  /** When set, pull recipient from this field of the event payload (e.g. "customer.email"). */
  to_from_payload?: string
}

export async function runSendEmail(ctx: ActionContext): Promise<ActionResult> {
  const cfg = (ctx.rule.action_config || {}) as EmailConfig

  let to = cfg.to
  if (!to && cfg.to_from_payload) {
    to = readPath(ctx.event.payload, cfg.to_from_payload) as string | undefined
  }
  if (!to) return { ok: false, message: 'no recipient resolved from rule config' }

  const subject = cfg.subject || `Notifikation fra ${BRAND_COMPANY_NAME}`
  const html = cfg.body_html || `<p>${escape(subject)}</p>`

  if (ctx.event.globalDryRun || ctx.rule.dry_run) {
    return { ok: true, message: 'dry_run', data: { to, subject } }
  }

  const { isGraphConfigured, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
  if (!isGraphConfigured()) return { ok: false, message: 'Graph not configured' }

  const result = await sendEmailViaGraph({ to, subject, html })
  return {
    ok: result.success,
    message: result.success ? 'sent' : (result.error || 'send failed'),
    data: { to, subject, error: result.error },
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

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
