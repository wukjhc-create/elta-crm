/**
 * C1a — validering af klassifikationsfeedback. Ren logik (ingen DB, ikke 'use server').
 *
 * Feedback gemmes adskilt fra driften (audit_logs, action 'classification_feedback', entity incoming_email) og ændrer
 * aldrig mailen, kunden, sagen eller henvendelsen. Serveren klassificerer selv mailen igen ved indsendelse — klientens
 * "forudsagte" værdier bruges aldrig.
 */
import {
  CASE_REFERENCES, INQUIRY_TYPES, PROPOSED_ACTIONS, SENDER_TYPES,
  type CaseReference, type InquiryClassification, type InquiryType, type ProposedAction, type SenderType,
} from './inquiry-classifier'

export const FEEDBACK_VERDICTS = ['correct', 'partial', 'wrong', 'cannot_assess'] as const
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number]

export const FEEDBACK_VERDICT_LABELS: Record<FeedbackVerdict, string> = {
  correct: 'Korrekt', partial: 'Delvist korrekt', wrong: 'Forkert', cannot_assess: 'Kan ikke vurderes',
}

export const FEEDBACK_ACTION = 'classification_feedback'
export const FEEDBACK_ENTITY_TYPE = 'incoming_email'
export const FEEDBACK_NOTE_MAX = 500

export interface CorrectedClassification {
  senderType?: SenderType
  inquiryType?: InquiryType
  caseReference?: CaseReference
  proposedAction?: ProposedAction
}

export interface FeedbackInput {
  emailId: string
  verdict: string
  corrected?: Record<string, unknown> | null
  note?: string | null
}

export type FeedbackValidation =
  | { ok: true; verdict: FeedbackVerdict; corrected: CorrectedClassification; note: string | null }
  | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DIMS = {
  senderType: SENDER_TYPES, inquiryType: INQUIRY_TYPES, caseReference: CASE_REFERENCES, proposedAction: PROPOSED_ACTIONS,
} as const

/**
 * Validér feedback mod den klassifikation serveren selv har beregnet.
 * - correct / cannot_assess: ingen rettelser tilladt (ignoreres ikke — afvises, så data ikke bliver tvetydige)
 * - partial / wrong: mindst én dimension skal være rettet til en GYLDIG værdi, der afviger fra forudsigelsen
 * - wrong kræver at mindst én dimension afviger; partial kræver at mindst én dimension stadig er uændret
 */
export function validateFeedback(input: FeedbackInput, predicted: InquiryClassification): FeedbackValidation {
  if (!UUID.test(String(input.emailId ?? ''))) return { ok: false, error: 'Ugyldig mail' }
  const verdict = input.verdict as FeedbackVerdict
  if (!(FEEDBACK_VERDICTS as readonly string[]).includes(verdict)) return { ok: false, error: 'Vælg en vurdering' }
  const note = input.note == null ? null : String(input.note).trim().slice(0, FEEDBACK_NOTE_MAX) || null
  const raw = input.corrected ?? {}
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Ugyldig rettelse' }
  const corrected: CorrectedClassification = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v == null || v === '') continue
    if (!(k in DIMS)) return { ok: false, error: `Ukendt dimension: ${k}` }
    const allowed = DIMS[k as keyof typeof DIMS] as readonly string[]
    if (typeof v !== 'string' || !allowed.includes(v)) return { ok: false, error: `Ugyldig værdi for ${k}` }
    if (v !== (predicted as unknown as Record<string, string>)[k]) (corrected as Record<string, string>)[k] = v
  }
  const changed = Object.keys(corrected).length
  if (verdict === 'correct' || verdict === 'cannot_assess') {
    if (changed) return { ok: false, error: 'Rettelser kan kun angives ved "Delvist korrekt" eller "Forkert"' }
    return { ok: true, verdict, corrected: {}, note }
  }
  if (!changed) return { ok: false, error: 'Angiv den korrekte klassifikation for mindst én dimension' }
  if (verdict === 'partial' && changed === Object.keys(DIMS).length) return { ok: false, error: 'Alle fire dimensioner er rettet — vælg "Forkert"' }
  return { ok: true, verdict, corrected, note }
}
