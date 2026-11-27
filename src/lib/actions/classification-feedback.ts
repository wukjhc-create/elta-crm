'use server'

/**
 * C1a klassifikationsfeedback (Henrik 2026-11-26). Kun med settings.manage (standard kun admin) og CLASSIFICATION_FEEDBACK_ENABLED='true'.
 *
 * - getEmailClassificationAction: beregner den deterministiske C1-klassifikation for én mail (read-only) + tidligere
 *   feedback på mailen. Ændrer intet.
 * - submitClassificationFeedbackAction: gemmer en vurdering (korrekt/delvist/forkert/kan ikke vurderes + evt. korrekt
 *   klassifikation) som en audit-række (action 'classification_feedback', entity 'incoming_email'). Serveren klassificerer
 *   mailen igen selv — klientens værdier bruges aldrig som "forudsagt".
 *
 * Feedback og klassifikation påvirker ALDRIG mailflowet: ingen skrivning i incoming_emails, conversations, kunder eller sager.
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { createAdminClient } from '@/lib/supabase/admin'
import { classificationFeedbackEnabled, CLASSIFICATION_FEEDBACK_DISABLED_TEXT } from '@/lib/classification/feature-flag'
import { loadEmailClassification } from '@/lib/classification/load-email-classification'
import { explainClassification, type InquiryClassification } from '@/lib/classification/inquiry-classifier'
import {
  FEEDBACK_ACTION, FEEDBACK_ENTITY_TYPE, FEEDBACK_SCHEMA, isSameFeedback, validateFeedback,
  type CorrectedClassification, type FeedbackVerdict,
} from '@/lib/classification/feedback'

type R<T> = { success: true; data: T } | { success: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface EmailClassificationView {
  classification: InquiryClassification
  explanation: string[]
  previous: Array<{ verdict: FeedbackVerdict; corrected: CorrectedClassification; at: string; mine: boolean; version: string; revision: number; isCorrection: boolean }>
}

/** Gate: flag + `settings.manage` (standard kun admin). Returnerer brugerens id eller en fejltekst. */
async function requireAdminClassificationCtx(): Promise<{ userId: string } | { error: string }> {
  if (!classificationFeedbackEnabled()) return { error: CLASSIFICATION_FEEDBACK_DISABLED_TEXT }
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('settings.manage')) return { error: 'Kun administratorer kan se og vurdere klassifikationen' }
    return { userId: ctx.userId }
  } catch {
    return { error: 'Ikke logget ind' }
  }
}

export async function getEmailClassificationAction(emailId: string): Promise<R<EmailClassificationView>> {
  if (!UUID.test(String(emailId ?? ''))) return { success: false, error: 'Ugyldig mail' }
  const g = await requireAdminClassificationCtx()
  if ('error' in g) return { success: false, error: g.error }
  const db = createAdminClient()
  const c = await loadEmailClassification(db, emailId)
  if (!c.ok) return { success: false, error: c.error }
  const prev = await db.from('audit_logs').select('user_id, metadata, created_at')
    .eq('action', FEEDBACK_ACTION).eq('entity_type', FEEDBACK_ENTITY_TYPE).eq('entity_id', emailId)
    .order('created_at', { ascending: false }).limit(5)
  const previous = ((prev.data ?? []) as Array<{ user_id: string | null; metadata: Record<string, unknown> | null; created_at: string }>).map((r) => ({
    verdict: String(r.metadata?.verdict ?? '') as FeedbackVerdict,
    corrected: (r.metadata?.corrected ?? {}) as CorrectedClassification,
    at: r.created_at,
    mine: r.user_id === g.userId,
    version: String(r.metadata?.version ?? ''),
    revision: Number(r.metadata?.revision ?? 1) || 1,
    isCorrection: typeof r.metadata?.supersedes === 'string',
  }))
  return { success: true, data: { classification: c.classification, explanation: explainClassification(c.classification), previous } }
}

export async function submitClassificationFeedbackAction(input: {
  emailId: string
  verdict: string
  corrected?: Record<string, unknown> | null
  note?: string | null
}): Promise<R<{ saved: true; unchanged: boolean; revision: number }>> {
  if (!UUID.test(String(input?.emailId ?? ''))) return { success: false, error: 'Ugyldig mail' }
  const g = await requireAdminClassificationCtx()
  if ('error' in g) return { success: false, error: g.error }
  const db = createAdminClient()
  const c = await loadEmailClassification(db, input.emailId)
  if (!c.ok) return { success: false, error: c.error }
  const v = validateFeedback(input, c.classification)
  if (!v.ok) return { success: false, error: v.error }
  const p = c.classification
  // Gentagne indsendelser: brugerens seneste vurdering på mailen. Identisk (samme version, vurdering, rettelse og note)
  // → ingen ny række. Ellers en ny række med revision + supersedes = den forrige række (rettelsen kan identificeres;
  // C0 tæller kun seneste vurdering pr. mail og bruger, så også et dobbeltklik fra to faner forvrider ikke målingen).
  const lastRes = await db.from('audit_logs').select('id, metadata')
    .eq('action', FEEDBACK_ACTION).eq('entity_type', FEEDBACK_ENTITY_TYPE).eq('entity_id', input.emailId).eq('user_id', g.userId)
    .order('created_at', { ascending: false }).limit(1)
  if (lastRes.error) return { success: false, error: 'Feedback kunne ikke gemmes. Prøv igen.' }
  const last = (lastRes.data ?? [])[0] as { id: string; metadata: Record<string, unknown> | null } | undefined
  if (last && isSameFeedback(last.metadata, { version: p.version, verdict: v.verdict, corrected: v.corrected, note: v.note })) {
    return { success: true, data: { saved: true, unchanged: true, revision: Number(last.metadata?.revision ?? 1) || 1 } }
  }
  const revision = last ? (Number(last.metadata?.revision ?? 1) || 1) + 1 : 1
  const res = await insertAuditRow({
    user_id: g.userId,
    entity_type: FEEDBACK_ENTITY_TYPE,
    entity_id: input.emailId,
    action: FEEDBACK_ACTION,
    action_description: `Klassifikationsfeedback: ${v.verdict}`,
    metadata: {
      schema: FEEDBACK_SCHEMA,
      version: p.version,
      predicted: { senderType: p.senderType, inquiryType: p.inquiryType, caseReference: p.caseReference, proposedAction: p.proposedAction },
      rules: p.rules.map((r) => `${r.dimension}:${r.rule}`),
      doubts: p.doubts,
      verdict: v.verdict,
      corrected: v.corrected,
      note: v.note,
      revision,
      supersedes: last?.id ?? null,
    },
  })
  if (res.error) return { success: false, error: 'Feedback kunne ikke gemmes. Prøv igen.' }
  return { success: true, data: { saved: true, unchanged: false, revision } }
}
