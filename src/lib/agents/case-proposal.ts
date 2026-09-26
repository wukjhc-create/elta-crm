/**
 * Agent Core — case.propose_from_email (Fase 4: intern create efter approval).
 *
 * Mailagenten FORESLÅR en service-sag for en mail der er koblet til en kunde.
 * Først efter menneskelig approval (og kun med enabled agent) kalder Executor
 * handleren her, som opretter sagen via den eksisterende, idempotente
 * createCaseFromEmail (dedup paa source_email_id + UNIQUE-index fra 00074).
 * Sagen oprettes som FORSLAG (is_proposal=true) — et menneske bekræfter den i
 * sagsmodulet. Ingen mail sendes, ingen opgaver/noter oprettes, intet eksternt.
 *
 * Tamper/stale-sikring: handleren opretter kun sagen, hvis mailen stadig er
 * koblet til PRÆCIS den kunde forslaget blev lavet for.
 */

import { createCaseFromEmail, detectIntent, detectPriority } from '@/lib/services/auto-case'
import type { CaseIntent, CasePriority } from '@/lib/services/auto-case'
import type { CapabilityContext, CapabilityResult } from '@/types/agent-core.types'

export interface CaseProposalPayload {
  email_id: string
  customer_id: string
  proposed_title: string
  intent: CaseIntent
  priority: CasePriority
}

export interface CaseProposalMail {
  id: string
  subject: string | null
  body_text: string | null
  body_preview: string | null
  customer_id: string | null
}

const mailBody = (m: CaseProposalMail) => m.body_text || m.body_preview || ''

/**
 * Byg forslaget (ren funktion; ingen DB). Returnerer null naar der ikke skal
 * foreslås en sag: mailen er ikke koblet til en kunde, eller der findes allerede en sag.
 */
export function buildCaseProposal(mail: CaseProposalMail, hasExistingCase: boolean): CaseProposalPayload | null {
  if (!mail.customer_id || hasExistingCase) return null
  const subject = mail.subject || '(Intet emne)'
  const intent = detectIntent(subject, mailBody(mail))
  return {
    email_id: mail.id,
    customer_id: mail.customer_id,
    proposed_title: subject,
    intent,
    priority: detectPriority(subject, mailBody(mail), intent),
  }
}

/** Sag der allerede er oprettet fra mailen (dedup-noeglen er source_email_id). */
export async function findExistingCaseForEmail(admin: CapabilityContext['admin'], emailId: string): Promise<string | null> {
  const { data } = await admin.from('service_cases').select('id').eq('source_email_id', emailId).limit(1).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/** Handler (kaldes KUN af Executor efter approval-gating). */
export async function executeCaseProposal(ctx: CapabilityContext): Promise<CapabilityResult> {
  const p = (ctx.action.payload ?? {}) as Partial<CaseProposalPayload>
  if (!p.email_id || !p.customer_id) return { ok: false, error: 'mangler email_id/customer_id i payload' }

  const { data: mail, error } = await ctx.admin
    .from('incoming_emails')
    .select('id, subject, body_text, body_preview, customer_id')
    .eq('id', p.email_id)
    .maybeSingle()
  if (error || !mail) return { ok: false, error: 'mailen findes ikke' }
  const m = mail as CaseProposalMail
  if (m.customer_id !== p.customer_id) {
    return { ok: false, error: 'mailens kundekobling er aendret siden forslaget — koer Mailagenten igen' }
  }

  const existing = await findExistingCaseForEmail(ctx.admin, m.id)
  if (existing) {
    return { ok: true, data: { case_id: existing, created: false, already_existed: true, email_id: m.id } }
  }

  const caseId = await createCaseFromEmail(
    { id: m.id, subject: m.subject || '(Intet emne)', body: mailBody(m), intent: p.intent, priority: p.priority },
    p.customer_id,
    ctx.admin,
  )
  if (!caseId) return { ok: false, error: 'sagen kunne ikke oprettes' }
  return { ok: true, data: { case_id: caseId, created: true, is_proposal: true, email_id: m.id, customer_id: p.customer_id } }
}
