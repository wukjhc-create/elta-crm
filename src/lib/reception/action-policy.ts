/**
 * AI-receptionist fase 2 — DETERMINISTISK handlings-politik. Bevidst IKKE 'use server'.
 *
 * Afgør for hver tilsigtet handling: auto (udføres af aktøren ai_receptionist), proposal (kræver menneskelig
 * godkendelse), handoff (obligatorisk menneske — hele henvendelsen), forbidden (findes ikke for AI'en).
 * LLM'en kan kun FORESLÅ handlingstyper; alt passerer evaluateAction, og ukendte typer er forbudte.
 */
import type { DisclosureLevel } from './disclosure'
import type { IdentityState, CaseMatchState, Urgency } from './contract'
import type { Signals } from './signals'

export const RECEPTION_ACTIONS = [
  'find_customer', 'find_contact', 'find_case',
  'create_customer_proposal', 'create_case_proposal',
  'append_communication', 'create_task', 'create_callback', 'create_planning_request',
  'request_documents', 'mark_handled',
] as const
export type ReceptionAction = (typeof RECEPTION_ACTIONS)[number]

/** Forretningsbindende tilsagn — AI'en har intet værktøj til dem; de ender ALTID som forbidden */
export const FORBIDDEN_COMMITMENTS = [
  'quote_binding_price', 'promise_date', 'warranty_decision', 'compliance_answer',
  'cancel_order', 'alter_invoice', 'dispatch_emergency', 'contract_commitment',
] as const
export type ForbiddenCommitment = (typeof FORBIDDEN_COMMITMENTS)[number]

export type PolicyOutcome = 'auto' | 'proposal' | 'handoff' | 'forbidden'

export type HandoffReason =
  | 'safety_emergency' | 'urgent_outage' | 'customer_dispute' | 'unhappy_customer' | 'human_requested'
  | 'low_confidence' | 'ambiguous_identity' | 'identity_read_error' | 'commercial_negotiation'
  | 'invoice_change' | 'cancellation' | 'warranty' | 'compliance' | 'verification_failed' | 'transcript_unavailable'

export interface PolicyContext {
  identity: IdentityState
  caseState: CaseMatchState
  level: DisclosureLevel
  confidence: number
  urgency: Urgency
  signals: Signals
  /** Kanalen kunne ikke levere indhold (fx transskription mangler) */
  contentUnavailable?: boolean
  verificationFailed?: boolean
}

export const CONFIDENCE_THRESHOLD = 0.7

export interface PolicyDecision {
  action: string
  outcome: PolicyOutcome
  reasons: string[]
}

/** Handlinger der kun logger/læser — tilladt selv under handoff (så mennesket får konteksten) */
const ALWAYS_SAFE = new Set<string>(['append_communication', 'find_customer', 'find_contact'])
/** Handlinger der knytter noget til en bestemt kunde */
const CUSTOMER_BOUND = new Set<string>(['create_task', 'create_callback', 'create_planning_request', 'request_documents', 'create_case_proposal', 'find_case'])

/** Henvendelses-niveau: kræver situationen et menneske? (samme svar uanset handling) */
export function handoffReasons(ctx: PolicyContext): HandoffReason[] {
  const r: HandoffReason[] = []
  const s = ctx.signals
  if (s.safetyEmergency || ctx.urgency === 'emergency') r.push('safety_emergency')
  if (s.outage) r.push('urgent_outage')
  if (s.dispute) r.push('customer_dispute')
  if (s.unhappy) r.push('unhappy_customer')
  if (s.humanRequested) r.push('human_requested')
  if (s.invoiceChange) r.push('invoice_change')
  if (s.cancellationRequest) r.push('cancellation')
  if (s.warrantyQuestion) r.push('warranty')
  if (s.complianceQuestion) r.push('compliance')
  if (ctx.identity === 'ambiguous') r.push('ambiguous_identity')
  if (ctx.identity === 'read_error') r.push('identity_read_error')
  if (ctx.verificationFailed) r.push('verification_failed')
  if (ctx.contentUnavailable) r.push('transcript_unavailable')
  if (ctx.confidence < CONFIDENCE_THRESHOLD) r.push('low_confidence')
  return [...new Set(r)]
}

export function evaluateAction(action: string, ctx: PolicyContext): PolicyDecision {
  if ((FORBIDDEN_COMMITMENTS as readonly string[]).includes(action)) {
    return { action, outcome: 'forbidden', reasons: ['forretningsbindende tilsagn — kun et menneske'] }
  }
  if (!(RECEPTION_ACTIONS as readonly string[]).includes(action)) {
    return { action, outcome: 'forbidden', reasons: ['ukendt handling'] }
  }
  if (ALWAYS_SAFE.has(action)) return { action, outcome: 'auto', reasons: [] }

  const hr = handoffReasons(ctx)
  if (action === 'mark_handled') return { action, outcome: 'proposal', reasons: ['kun et menneske afslutter en henvendelse'] }
  // Kunde-/sagsforslag er ALTID forslag (beslutning 4), og under handoff stadig forslag (mennesket ser dem)
  if (action === 'create_customer_proposal') {
    if (ctx.identity === 'unique_match') return { action, outcome: 'forbidden', reasons: ['kunden findes allerede (unikt match)'] }
    if (ctx.identity === 'read_error') return { action, outcome: 'handoff', reasons: ['kundeopslag fejlede — kan ikke udelukke dublet'] }
    return { action, outcome: 'proposal', reasons: ['nye kunder oprettes kun efter godkendelse'] }
  }
  if (hr.length) return { action, outcome: 'handoff', reasons: hr }

  if (CUSTOMER_BOUND.has(action) && ctx.identity !== 'unique_match') {
    // Uden en entydig kunde-kandidat kan intet knyttes til en kunde automatisk
    if (action === 'create_callback' || action === 'create_task') return { action, outcome: 'proposal', reasons: ['ingen entydig kunde — opgaven knyttes ved godkendelse'] }
    if (action === 'create_case_proposal') return { action, outcome: 'proposal', reasons: ['ny sag oprettes kun efter godkendelse'] }
    return { action, outcome: 'handoff', reasons: ['ingen entydig kunde'] }
  }
  switch (action) {
    case 'find_case':
      return { action, outcome: 'auto', reasons: [] }
    case 'create_case_proposal':
      return { action, outcome: 'proposal', reasons: ['nye sager oprettes som forslag'] }
    case 'request_documents':
      // Selve linket sendes ikke i fase 2; kontoret godkender og deler det
      return { action, outcome: 'proposal', reasons: ['upload-link kræver godkendelse; ekstern afsendelse er slået fra'] }
    case 'create_task':
    case 'create_callback':
    case 'create_planning_request':
      if (ctx.caseState === 'several_open') return { action, outcome: 'proposal', reasons: ['flere åbne sager — et menneske vælger sagen'] }
      return { action, outcome: 'auto', reasons: [] }
  }
  return { action, outcome: 'forbidden', reasons: ['ikke dækket af politikken'] }
}

/** Hvilke forbudte tilsagn ligger i en henvendelse (til svar-tekst + audit) */
export function impliedCommitments(s: Signals): ForbiddenCommitment[] {
  const out: ForbiddenCommitment[] = []
  if (s.priceRequest) out.push('quote_binding_price')
  if (s.dateRequest) out.push('promise_date')
  if (s.warrantyQuestion) out.push('warranty_decision')
  if (s.complianceQuestion) out.push('compliance_answer')
  if (s.cancellationRequest) out.push('cancel_order')
  if (s.invoiceChange) out.push('alter_invoice')
  if (s.safetyEmergency) out.push('dispatch_emergency')
  return out
}

/** Svar-værn: tekst til kunden må ikke indeholde beløb, løfte-datoer eller garanti-/compliance-tilsagn */
const PROMISE_PATTERNS: RegExp[] = [
  /\d[\d.,]*\s*(kr\.?|kroner|dkk|,-)/i,
  /\b(vi|montøren|teknikeren) (kommer|installerer|er færdige?)\b[^.]*\b(i morgen|på (mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|\d{1,2}\.\s?\w+|den \d{1,2})/i,
  /\b(er dækket af|omfattet af) garanti/i,
  /\bdet (må|er lovligt|er tilladt)\b/i,
  /\b(annulleret|krediteret|faktura(en)? er (ændret|rettet))\b/i,
  /\bvi sender (en|nogen) (montør|tekniker|vagt) (nu|med det samme|straks)\b/i,
]
export function replyViolations(text: string): string[] {
  return PROMISE_PATTERNS.filter((p) => p.test(text)).map((p) => p.source)
}
