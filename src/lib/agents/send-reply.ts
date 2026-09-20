/**
 * Agent Core — mail.send_reply capability (FORBEREDT, ikke live).
 *
 * side_effect_class='send_external' => ALTID hard-blocked af approval-modellen
 * (Executor + DB-trigger). Confidence kan ALDRIG bypasse approval.
 *
 * Transport: KUN via sendEmailViaGraph (systemets ene choke point). Ingen
 * parallel mail-sender. Kraever et reviewet draft (ikke-tomt body).
 *
 * Dobbelt-afsendelse forhindres af Executor's claim (kun én execution kan
 * flytte status planned/awaiting_approval/approved -> executing). Uvist
 * transport-resultat (exception) => { uncertain:true } => Executor saetter
 * 'needs_verification' og retryer ALDRIG automatisk.
 */

import { sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import type { CapabilityContext, CapabilityResult } from '@/types/agent-core.types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface SendReplyPayload {
  email_id?: string
  to?: string
  subject?: string
  body?: string
}
export interface PreparedSend {
  to: string
  subject: string
  body: string
}

/** Server-side validering. Alt afvist HER betyder DEFINITIVT intet sendt. */
export function prepareSendReply(
  payload: SendReplyPayload,
): { ok: true; prepared: PreparedSend } | { ok: false; error: string } {
  const to = (payload.to ?? '').trim()
  const subject = (payload.subject ?? '').trim()
  const body = (payload.body ?? '').trim()
  if (!to || !EMAIL_RE.test(to)) return { ok: false, error: 'ugyldig modtager-adresse' }
  if (!subject) return { ok: false, error: 'tomt emne' }
  if (body.length < 5) return { ok: false, error: 'tomt/mangelfuldt udkast — reviewet draft paakraevet' }
  if (body.length > 50000) return { ok: false, error: 'udkast for langt' }
  return { ok: true, prepared: { to, subject, body } }
}

export type MailTransport = (p: PreparedSend) => Promise<{ ok: boolean; messageId?: string }>

function bodyToHtml(body: string): string {
  const esc = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return esc.replace(/\r?\n/g, '<br>')
}

/** Default transport = det eneste choke point. */
const defaultTransport: MailTransport = async ({ to, subject, body }) => {
  const res = await sendEmailViaGraph({ to, subject, html: bodyToHtml(body), text: body })
  return { ok: res.success, messageId: res.messageId }
}

/**
 * Udfoer send_reply. transport injiceres i tests (default = Graph choke point).
 * Returnerer uncertain=true ved exception (uvist om sendt) => aldrig auto-retry.
 */
export async function executeSendReply(
  ctx: CapabilityContext,
  transport: MailTransport = defaultTransport,
): Promise<CapabilityResult> {
  const prep = prepareSendReply((ctx.action.payload ?? {}) as SendReplyPayload)
  if (!prep.ok) return { ok: false, error: prep.error } // definitivt: intet sendt

  try {
    const r = await transport(prep.prepared)
    if (r.ok) {
      return { ok: true, data: { sent_to: prep.prepared.to, subject: prep.prepared.subject, message_id: r.messageId ?? null } }
    }
    // Transporten sagde EKSPLICIT ikke-sendt (kendt fejl, foer dispatch) -> failed.
    return { ok: false, error: 'transport afviste afsendelse (kendt fejl, intet sendt)' }
  } catch (err) {
    // UVIST: vi ved ikke om Graph naaede at sende -> kraev menneskelig kontrol.
    return { ok: false, uncertain: true, error: `uvist transport-resultat: ${err instanceof Error ? err.message : 'ukendt'}` }
  }
}
