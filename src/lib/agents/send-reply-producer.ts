/**
 * Agent Core — producer for mail.send_reply (P2-rest B). Bevidst IKKE 'use server'.
 *
 * Hvorfor den manglede: send_reply blev i Fase 3 bygget som transport-lag (handler + mock-tests), men
 * producer-stien blev bevidst udskudt ("no live send"). Den eneste prod-action er Fase 3-testen (intern
 * modtager, godkendt, 2026-09-20). Uden producer kunne en send_reply kun opstaa ved direkte service-role-insert.
 *
 * Denne producer er den ENESTE normale vej, og den SENDER ALDRIG:
 *   - kilde: et UDFOERT (materialiseret) mail.draft_reply — dvs. et udkast en reviewer har set/redigeret
 *   - afvises hvis udkastet stadig indeholder skabelon-pladsholderen (ikke reviewet)
 *   - modtager = den oprindelige mails afsender; emne = "Re: <emne>"; krop = det reviewede udkast
 *   - opretter en action i status awaiting_approval (hard-blocked: approval kraeves altid)
 *   - udfoerelse kraever desuden enabled mail-agent OG AGENT_LIVE_SEND_ENABLED (default OFF) — se live-gates.ts
 *   - ét aktivt afsendelsesforslag pr. mail (generations-noegle mail-send:<mail>:<n>)
 */
import { prepareSendReply } from '@/lib/agents/send-reply'
import { isWebsiteInquiry } from '@/lib/mail/website-inquiry'
import { extractFormSubmitFields } from '@/lib/utils/email-parser'

export const SEND_CAPABILITY = 'mail.send_reply'
export const TEMPLATE_PLACEHOLDER = '[BRUGER UDFYLDER'
const INACTIVE = ['rejected', 'failed', 'rolled_back']

export function replySubject(subject: string | null | undefined): string {
  const s = (subject ?? '').trim()
  if (!s) return 'Re: Din henvendelse'
  return /^(re|sv|aw)\s*:/i.test(s) ? s : `Re: ${s}`
}

export interface DraftActionLite {
  id: string
  run_id: string
  task_id: string
  capability: string
  status: string
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
}

/** Hvorfor et udkast ikke kan blive til et afsendelsesforslag — eller null. Ren funktion. */
export function sendProposalBlocker(draft: DraftActionLite): string | null {
  if (draft.capability !== 'mail.draft_reply') return 'kun et svarudkast kan forberedes til afsendelse'
  if (draft.status !== 'executed') return 'udkastet skal være gennemset og materialiseret (Udfør) før afsendelse kan forberedes'
  const body = (draft.result?.draft as string | undefined) ?? ''
  if (!body.trim()) return 'udkastet er tomt'
  if (body.includes(TEMPLATE_PLACEHOLDER)) return 'udkastet indeholder stadig skabelon-pladsholderen — udfyld det først'
  return null
}

export async function produceSendReplyProposal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  draftActionId: string,
): Promise<{ ok: true; actionId: string } | { ok: false; error: string }> {
  const { data: d } = await admin.from('agent_actions').select('id, run_id, task_id, capability, status, payload, result').eq('id', draftActionId).maybeSingle()
  if (!d) return { ok: false, error: 'udkastet findes ikke' }
  const draft = d as DraftActionLite
  const blocker = sendProposalBlocker(draft)
  if (blocker) return { ok: false, error: blocker }

  const emailId = draft.payload?.email_id as string | undefined
  if (!emailId) return { ok: false, error: 'udkastet mangler reference til mailen' }
  const { data: mail } = await admin.from('incoming_emails').select('id, subject, sender_email, body_text, body_html').eq('id', emailId).maybeSingle()
  if (!mail) return { ok: false, error: 'mailen findes ikke længere' }

  // Automatik-review: en webhenvendelse kommer fra submissions@formsubmit.co — svaret skal til kundens e-mail fra
  // formularen (vises i forslaget og godkendes), aldrig til FormSubmit. Uden gyldig e-mail i formularen: intet forslag.
  let to = String(mail.sender_email ?? '')
  if (isWebsiteInquiry({ senderEmail: mail.sender_email, subject: mail.subject })) {
    const formEmail = String(extractFormSubmitFields(mail.body_text ?? null, mail.body_html ?? null).email ?? '').trim()
    if (!/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(formEmail)) return { ok: false, error: 'webhenvendelse uden gyldig kunde-e-mail i formularen' }
    to = formEmail
  }

  const body = String(draft.result?.draft ?? '')
  const prepared = prepareSendReply({ to, subject: replySubject(mail.subject), body })
  if (!prepared.ok) return { ok: false, error: `kan ikke forberedes: ${prepared.error}` }

  const { data: existing } = await admin.from('agent_actions').select('status').eq('capability', SEND_CAPABILITY).eq('payload->>email_id', emailId)
  const rows = (existing ?? []) as Array<{ status: string }>
  if (rows.some((r) => !INACTIVE.includes(r.status))) return { ok: false, error: 'der findes allerede et afsendelsesforslag for denne mail' }
  const generation = rows.filter((r) => INACTIVE.includes(r.status)).length

  const { data: act, error } = await admin.from('agent_actions').insert({
    task_id: draft.task_id, run_id: draft.run_id, action_type: 'send_reply', capability: SEND_CAPABILITY,
    side_effect_class: 'send_external', requires_approval: true, min_approvals: 1,
    idempotency_key: `mail-send:${emailId}:${generation}`, status: 'awaiting_approval',
    payload: {
      email_id: emailId, to: prepared.prepared.to, subject: prepared.prepared.subject, body: prepared.prepared.body,
      source_draft_action_id: draft.id, confidence_level: 'medium', confidence_score: 0.6,
      rationale: 'Gennemset svarudkast klar til afsendelse. Kræver godkendelse; live afsendelse er desuden slået fra, indtil det besluttes.',
    },
  }).select('id').single()
  if (error || !act) {
    if ((error as { code?: string } | null)?.code === '23505') return { ok: false, error: 'der findes allerede et afsendelsesforslag for denne mail' }
    return { ok: false, error: (error as { message?: string } | null)?.message ?? 'kunne ikke oprette forslag' }
  }
  return { ok: true, actionId: (act as { id: string }).id }
}
