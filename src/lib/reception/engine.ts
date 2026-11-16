/**
 * AI-receptionist fase 2 — RECEPTION ENGINE (én tur). Kanal-uafhængig: telefon, web-chat, portal, mail og SMS bruger
 * samme motor via porte. Bevidst IKKE 'use server' og uden DB/netværk — alt I/O kommer gennem `EnginePorts`.
 *
 *   besked → identitet (deterministisk) → oplysningsniveau (deterministisk) → signaler + intent (nøgleord, evt. LLM
 *   som kan tilføje men aldrig fjerne signaler) → sag → planlagte handlinger → POLITIK (deterministisk) → handoff → svar
 *
 * Motoren UDFØRER intet. Den returnerer en plan, som lib/reception/crm-actions udfører (auto) eller gemmer som forslag.
 */
import type { CaseMatchState, Channel, Team, Urgency } from './contract'
import { clip } from './contract'
import type { IdentityInput, IdentityResult } from './identity-match'
import { canDisclose, disclosureLevel, verifyFacts, MAX_VERIFICATION_ATTEMPTS, type CandidateFacts, type ClaimedFacts, type DisclosureLevel, type VerificationOutcome } from './disclosure'
import { classifyIntent, detectSignals, INTENTS, maxUrgency, urgencyFor, type Classification, type Intent, type Signals } from './signals'
import { evaluateAction, handoffReasons, impliedCommitments, replyViolations, type ForbiddenCommitment, type HandoffReason, type PolicyOutcome } from './action-policy'
import { emergencyReply } from './emergency-policy'

export interface ReceptionMessage {
  channel: Channel
  /** null = indholdet kunne ikke leveres (fx transskription mangler) — bliver ALDRIG behandlet som en tom besked */
  text: string | null
  sender: IdentityInput
  claimed?: ClaimedFacts
  /** Kun portal-adapteren (gyldigt token) eller en fremtidig engangskode må sætte denne */
  strongVerification?: boolean
  failedVerificationAttempts?: number
  /** Stabil nøgle for samtalen (idempotens for foreslåede handlinger) */
  conversationKey: string
}

export interface OpenCase { id: string; caseNumber: string | null; title: string; statusLabel: string }

export type PortResult<T> = { ok: true; value: T } | { ok: false; error: string }

export interface LlmClassification { intent: string; confidence: number; proposedActions?: string[] }

export interface EnginePorts {
  identify: (input: IdentityInput) => Promise<IdentityResult>
  candidateFacts: (customerId: string) => Promise<PortResult<CandidateFacts>>
  openCases: (customerId: string) => Promise<PortResult<OpenCase[]>>
  /** Valgfri LLM-klassifikation (via den fælles AI-klient). Fejl → nøgleordsresultatet bruges, og det noteres. */
  classify?: (text: string, keywordResult: Classification) => Promise<PortResult<LlmClassification>>
}

export interface PlannedAction {
  type: string
  outcome: PolicyOutcome
  reasons: string[]
  payload: Record<string, unknown>
  idempotencyKey: string
  /** Hvem foreslog handlingen: motorens deterministiske planlægger eller LLM'en */
  proposedBy: 'planner' | 'llm'
}

export interface Handoff {
  reasons: HandoffReason[]
  team: Team
  urgency: Urgency
  suggestedNextAction: string
}

export interface ReceptionTurn {
  identity: IdentityResult
  level: DisclosureLevel
  verification: VerificationOutcome
  needsVerification: boolean
  intent: Intent
  confidence: number
  classificationSource: Classification['source']
  llmError: string | null
  signals: Signals
  urgency: Urgency
  caseMatch: { state: CaseMatchState; candidateId: string | null; openCaseCount: number }
  commitmentsRefused: ForbiddenCommitment[]
  actions: PlannedAction[]
  handoff: Handoff | null
  title: string
  summary: string
  reply: string
  /** Interne advarsler (fx LLM utilgængelig) — vises for medarbejderen, aldrig for kunden */
  notes: string[]
}

export const INTENT_LABEL: Record<Intent, string> = {
  service_fault: 'Fejl/service', new_installation_inquiry: 'Nyt anlæg/tilbud', existing_case_status: 'Status på sag',
  appointment_request: 'Ønsker besøg/tid', callback_request: 'Ønsker opringning', invoice_question: 'Faktura',
  offer_question: 'Tilbud', general_question: 'Spørgsmål', supplier_or_spam: 'Leverandør/spam',
  emergency_safety: 'NØD/sikkerhed', other: 'Andet',
}

const IDENTITY_REASONS = new Set<HandoffReason>(['ambiguous_identity', 'identity_read_error'])

export const HANDOFF_NEXT: Record<HandoffReason, string> = {
  safety_emergency: 'Ring kunden op NU — vurder fare og evt. vagt',
  urgent_outage: 'Ring kunden op hurtigst muligt (ingen strøm)',
  customer_dispute: 'Bogholderi/ledelse kontakter kunden om uenigheden',
  unhappy_customer: 'Serviceleder kontakter kunden',
  human_requested: 'Ring kunden tilbage',
  low_confidence: 'Læs henvendelsen og vælg næste skridt',
  ambiguous_identity: 'Vælg den rigtige kunde',
  identity_read_error: 'Kundeopslag fejlede — find kunden manuelt',
  commercial_negotiation: 'Salg kontakter kunden',
  invoice_change: 'Bogholderi vurderer fakturaen',
  cancellation: 'Kontoret håndterer annullering',
  warranty: 'Serviceleder vurderer garanti/reklamation',
  compliance: 'Autoriseret installatør svarer på det tekniske/lovgivningsmæssige',
  verification_failed: 'Bekræft kundens identitet ved opringning',
  transcript_unavailable: 'Indholdet mangler — ring kunden op',
}

function teamFor(intent: Intent, s: Signals, reasons: HandoffReason[]): Team {
  if (s.safetyEmergency || s.outage || intent === 'emergency_safety' || intent === 'service_fault') return 'service'
  if (s.dispute || s.invoiceChange || intent === 'invoice_question') return 'bogholderi'
  if (intent === 'new_installation_inquiry' || intent === 'offer_question' || reasons.includes('commercial_negotiation')) return 'salg'
  return 'kontor'
}

/** LLM må tilføje/forfine intent — aldrig fjerne et nød-signal eller sænke hastegraden; uenighed sænker confidence */
export function mergeClassification(kw: Classification, llm: LlmClassification | null): Classification {
  if (!llm || kw.intent === 'emergency_safety') return kw
  if (!(INTENTS as readonly string[]).includes(llm.intent)) return { ...kw, confidence: Math.min(kw.confidence, 0.5), source: 'keywords+llm' }
  const c = Number.isFinite(llm.confidence) ? Math.max(0, Math.min(1, llm.confidence)) : 0
  const intent = llm.intent as Intent
  if (kw.intent !== 'other' && kw.intent !== intent && kw.confidence >= 0.85) return { intent: kw.intent, confidence: Math.min(c, 0.6), matchedIntents: kw.matchedIntents, source: 'keywords+llm' }
  return { intent, confidence: kw.intent === 'other' ? c : Math.max(c, kw.confidence), matchedIntents: kw.matchedIntents, source: 'keywords+llm' }
}

function planFor(intent: Intent, s: Signals, idState: IdentityResult['state'], caseState: CaseMatchState, team: Team): Array<{ type: string; payload: Record<string, unknown> }> {
  const p: Array<{ type: string; payload: Record<string, unknown> }> = [{ type: 'append_communication', payload: {} }]
  const noCustomer = idState === 'no_match' || idState === 'insufficient_information'
  switch (intent) {
    case 'service_fault':
      p.push(caseState === 'exact' ? { type: 'create_task', payload: { title: 'Servicehenvendelse på sag', team } } : { type: 'create_case_proposal', payload: { title: 'Servicehenvendelse', team } })
      p.push({ type: 'request_documents', payload: { kind: 'photos' } })
      break
    case 'new_installation_inquiry':
      if (noCustomer) p.push({ type: 'create_customer_proposal', payload: {} })
      p.push({ type: 'create_task', payload: { title: 'Tilbudsforespørgsel', team: 'salg' } })
      break
    case 'existing_case_status':
      p.push({ type: 'find_case', payload: {} })
      if (s.dateRequest) p.push({ type: 'create_planning_request', payload: { title: 'Kunden spørger til besøgstidspunkt', team: 'kontor' } })
      break
    case 'appointment_request':
      p.push({ type: 'create_planning_request', payload: { title: 'Ønsker besøg/tid', team: 'kontor' } })
      break
    case 'callback_request':
    case 'general_question':
    case 'other':
      p.push({ type: 'create_callback', payload: { team } })
      break
    case 'invoice_question':
      p.push({ type: 'create_task', payload: { title: 'Fakturaspørgsmål', team: 'bogholderi' } })
      break
    case 'offer_question':
      p.push({ type: 'create_task', payload: { title: 'Spørgsmål til tilbud', team: 'salg' } })
      break
    case 'emergency_safety':
    case 'supplier_or_spam':
      break
  }
  return p
}

/**
 * Svaret bygges KUN af faste skabeloner. Nød: præcis den godkendte nød-tekst (emergency-policy.ts) — intet andet.
 * Kundeoplysninger følger disclosure.ts: L2 = status-KATEGORI for én åben sag (ingen titel, intet sagsnummer, ingen
 * datoer/navne/beløb); L3 tilføjer sagsnummeret. L0/L1 bekræfter intet om kundeforholdet.
 */
function composeReply(t: { handoff: Handoff | null; intent: Intent; level: DisclosureLevel; needsVerification: boolean; refused: ForbiddenCommitment[]; caseForStatus: OpenCase | null; identityKnown: boolean }): string {
  if (t.handoff?.reasons.includes('safety_emergency')) return emergencyReply()
  const parts: string[] = []
  if (t.refused.includes('quote_binding_price')) parts.push('Jeg kan ikke give en pris her, men din forespørgsel går videre, så du kan få et skriftligt tilbud.')
  if (t.refused.includes('promise_date')) parts.push('Jeg kan ikke love et tidspunkt — det gør planlægningen, når de kontakter dig.')
  if (t.refused.includes('warranty_decision')) parts.push('Spørgsmål om garanti vurderes af en medarbejder.')
  if (t.refused.includes('compliance_answer')) parts.push('Tekniske og lovgivningsmæssige spørgsmål besvares af en autoriseret installatør.')
  if (t.needsVerification) parts.push('For at kunne fortælle om din sag skal jeg lige bekræfte to ting: postnummer og vejnavn på adressen — eller dit sagsnummer og postnummeret.')
  else if (t.caseForStatus && canDisclose(t.level, 'case_status')) {
    const nr = canDisclose(t.level, 'case_numbers') && t.caseForStatus.caseNumber ? ` ${t.caseForStatus.caseNumber}` : ''
    parts.push(`Din sag${nr} har status: ${t.caseForStatus.statusLabel}.`)
  }
  if (t.handoff) parts.push('Jeg sender din henvendelse videre til en medarbejder, som vender tilbage hurtigst muligt.')
  else parts.push('Tak for din henvendelse. Jeg har noteret den, og en medarbejder følger op.')
  const text = parts.join(' ')
  // Sidste værn: ingen beløb, løfte-datoer, garanti-/compliance-tilsagn — ellers neutral standardtekst
  return replyViolations(text).length ? 'Tak for din henvendelse. En medarbejder vender tilbage hurtigst muligt.' : text
}

export async function runReceptionTurn(msg: ReceptionMessage, ports: EnginePorts): Promise<ReceptionTurn> {
  const notes: string[] = []
  const contentUnavailable = msg.text === null || !msg.text.trim()
  const text = msg.text ?? ''

  // 1. Identitet (deterministisk)
  const identity = await ports.identify(msg.sender)
  if (identity.state === 'read_error') notes.push(`kundeopslag fejlede (${identity.error}) — ikke behandlet som "ingen kunde"`)
  const candidateId = identity.state === 'unique_match' ? identity.candidates[0].customerId : null

  // 2. Bekræftelse og oplysningsniveau
  let verification: VerificationOutcome = 'not_attempted'
  let failed = msg.failedVerificationAttempts ?? 0
  const claimedComplete = !!msg.claimed && ((!!msg.claimed.postalCode && !!msg.claimed.streetName) || (!!msg.claimed.caseNumber && !!msg.claimed.postalCode))
  if (!candidateId && claimedComplete) {
    // Ingen kandidat at holde faktaene op imod → et forsøg der ikke kan lykkes (samme forløb som et forkert svar)
    verification = 'failed'
    failed += 1
  }
  if (candidateId && msg.claimed) {
    const facts = await ports.candidateFacts(candidateId)
    if (!facts.ok) notes.push('kundefakta kunne ikke læses — bekræftelse ikke mulig')
    else {
      verification = verifyFacts(facts.value, msg.claimed)
      if (verification === 'failed') failed += 1
    }
  }
  const level = disclosureLevel({ identity, channel: msg.channel, verification, strongVerification: msg.strongVerification === true, failedAttempts: failed })

  // 3. Signaler + intent (nøgleord først; LLM kan forfine, ikke fjerne)
  const signals = detectSignals(text)
  const kw = contentUnavailable ? { intent: 'other' as Intent, confidence: 0, matchedIntents: [], source: 'keywords' as const } : classifyIntent(text, signals)
  let cls = kw
  let llmError: string | null = null
  let llmActions: string[] = []
  if (ports.classify && !contentUnavailable && kw.intent !== 'emergency_safety') {
    const r = await ports.classify(text, kw)
    if (r.ok) { cls = mergeClassification(kw, r.value); llmActions = r.value.proposedActions ?? [] }
    else { llmError = r.error; notes.push(`AI-klassifikation utilgængelig (${r.error}) — nøgleordsresultat brugt`) }
  }
  const urgency = maxUrgency(urgencyFor(kw.intent, signals), urgencyFor(cls.intent, signals))

  // 4. Sag (kun for entydig kandidat)
  let caseState: CaseMatchState = 'not_applicable'
  let caseCandidate: OpenCase | null = null
  let openCaseCount = 0
  if (candidateId) {
    const oc = await ports.openCases(candidateId)
    if (!oc.ok) { caseState = 'read_error'; notes.push('sager kunne ikke læses') }
    else {
      openCaseCount = oc.value.length
      const claimedCase = msg.claimed?.caseNumber ? oc.value.find((c) => (c.caseNumber ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === String(msg.claimed!.caseNumber).replace(/[^A-Z0-9]/gi, '').toUpperCase()) : undefined
      if (claimedCase) { caseState = 'exact'; caseCandidate = claimedCase }
      else if (oc.value.length === 0) caseState = 'no_open_case'
      else if (oc.value.length === 1) { caseState = 'exact'; caseCandidate = oc.value[0] }
      else caseState = 'several_open'
    }
  }

  // 5. Politik
  const ctx = { identity: identity.state, caseState, level, confidence: cls.confidence, urgency, signals, contentUnavailable, verificationFailed: failed >= MAX_VERIFICATION_ATTEMPTS }
  const reasons = handoffReasons(ctx)
  const team = teamFor(cls.intent, signals, reasons)
  // L0 og L1 er udadtil ens: der spørges om bekræftelse UANSET om nummeret/mailen gav en kandidat (ellers afslører
  // spørgsmålet, at nummeret tilhører en kunde)
  // Review F4: identitets-baserede årsager (tvetydig/læsefejl) styrer KUN det interne handoff — aldrig svaret til
  // afsenderen, ellers kan en opkalder skelne L0 fra L1 (fx at et nummer findes hos flere kunder)
  const replyReasons = reasons.filter((r) => !IDENTITY_REASONS.has(r))
  const needsVerification = cls.intent === 'existing_case_status' && level <= 1 && !replyReasons.length
  const refused = impliedCommitments(signals)

  const planned: Array<{ type: string; payload: Record<string, unknown>; proposedBy: 'planner' | 'llm' }> = planFor(cls.intent, signals, identity.state, caseState, team).map((a) => ({ ...a, proposedBy: 'planner' as const }))
  for (const t of llmActions) if (!planned.some((p) => p.type === t)) planned.push({ type: String(t), payload: {}, proposedBy: 'llm' as const })
  const actions: PlannedAction[] = planned.map((a) => {
    const d = evaluateAction(a.type, ctx)
    const payload = { ...a.payload, ...(candidateId && d.outcome !== 'forbidden' ? { customerCandidateId: candidateId } : {}), ...(caseCandidate ? { caseCandidateId: caseCandidate.id } : {}) }
    return { type: a.type, outcome: d.outcome, reasons: d.reasons, payload, idempotencyKey: `${msg.conversationKey}:${a.type}`, proposedBy: a.proposedBy }
  })

  const handoff: Handoff | null = reasons.length
    ? { reasons, team, urgency, suggestedNextAction: HANDOFF_NEXT[reasons[0]] }
    : null

  const label = INTENT_LABEL[cls.intent]
  const summary = contentUnavailable ? 'Indholdet kunne ikke leveres (fx manglende transskription).' : `${label}: ${clip(text, 300)}`
  const reply = composeReply({
    handoff: replyReasons.length && handoff ? { ...handoff, reasons: replyReasons } : null, intent: cls.intent, level, needsVerification, refused,
    caseForStatus: cls.intent === 'existing_case_status' && caseState === 'exact' ? caseCandidate : null,
    identityKnown: identity.state === 'unique_match',
  })

  return {
    identity, level, verification, needsVerification, intent: cls.intent, confidence: cls.confidence, classificationSource: cls.source, llmError,
    signals, urgency, caseMatch: { state: caseState, candidateId: caseCandidate?.id ?? null, openCaseCount },
    commitmentsRefused: refused, actions, handoff, title: clip(`${label} — ${text || 'uden indhold'}`, 120), summary, reply, notes,
  }
}
