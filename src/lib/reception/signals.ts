/**
 * AI-receptionist fase 2 — deterministiske SIGNALER og intent-klassifikation (nøgleord). Bevidst IKKE 'use server'.
 *
 * Signalerne køres ALTID før og uafhængigt af en evt. LLM: en LLM kan tilføje en intent, men aldrig fjerne et
 * sikkerheds-/klage-/menneske-signal eller sænke hastegraden (se engine.mergeClassification).
 */
import type { Urgency } from './contract'

export const INTENTS = [
  'service_fault', 'new_installation_inquiry', 'existing_case_status', 'appointment_request', 'callback_request',
  'invoice_question', 'offer_question', 'general_question', 'supplier_or_spam', 'emergency_safety', 'other',
] as const
export type Intent = (typeof INTENTS)[number]

export interface Signals {
  /** Fare for liv/brand: brand, røg, gnister, stød, strømførende dele, vand i tavlen … */
  safetyEmergency: boolean
  /** Ingen strøm / anlæg nede — hastende, men ikke i sig selv livsfare */
  outage: boolean
  dispute: boolean
  unhappy: boolean
  humanRequested: boolean
  priceRequest: boolean
  dateRequest: boolean
  warrantyQuestion: boolean
  complianceQuestion: boolean
  cancellationRequest: boolean
  invoiceChange: boolean
  photosMentioned: boolean
}

const has = (t: string, res: RegExp[]) => res.some((r) => r.test(t))

const R = {
  safety: [/\bbr(æ|ae)nd(er|t)?\b/, /\bild\b/, /\br(ø|oe)g\b/, /\bgnist/, /\bst(ø|oe)d\b/, /f(å|aa)(et|r) (et )?st(ø|oe)d/, /str(ø|oe)mf(ø|oe)rende/, /lugter? (af )?(br(æ|ae)ndt|brand|sviden)/, /vand i (el)?tavlen/, /smelte[td]?/, /\bgl(ø|oe)der\b/, /\bknitre/, /\bkortslut/],
  outage: [/ingen str(ø|oe)m/, /str(ø|oe)msvigt/, /str(ø|oe)mmen er g(å|aa)et/, /hfi.*(sl(å|aa)r|sprunget)/, /rcd.*(sl(å|aa)r|sprunget)/, /relæet (er )?sl(å|aa)et/, /sikringen (er )?sprunget/],
  dispute: [/\bklage/, /\buenig/, /forkert(e)? faktura/, /faktura(en)? er forkert/, /\bsnyd/, /\badvokat/, /\bforbrugerklage/, /n(æ|ae)vnet/, /betaler ikke/, /n(æ|ae)gter at betale/],
  unhappy: [/utilfreds/, /\bvred\b/, /\bsur\b/, /elendig/, /for d(å|aa)rligt/, /skuffet/, /urimelig/, /tredje gang/],
  human: [/tale med (en )?(medarbejder|menneske|person|rigtig)/, /stil (mig )?om/, /et menneske/, /ikke (tale med )?en (robot|maskine|bot)/, /\bmedarbejder\b.*\bnu\b/],
  price: [/\bpris(en|er)?\b/, /hvad koster/, /\bkoste(r)?\b/, /\btilbud\b/, /\brabat/, /\bbeløb/],
  date: [/\bhvorn(å|aa)r\b/, /\bdato/, /\bkommer (mont(ø|oe)ren|teknikeren|i)\b/, /\btidspunkt/, /\bn(æ|ae)ste uge\b/, /\binstallationsdato/, /\bf(æ|ae)rdig\b/],
  warranty: [/\bgaranti/, /\breklamation/, /\breklamere/],
  compliance: [/\blovlig/, /\bm(å|aa) jeg (selv)?\b/, /\bgodkendt\b/, /sikkerhedsstyrelsen/, /\boverholder\b/, /\breglerne\b/, /\bautoriseret\b/],
  cancellation: [/\bannuller/, /\bopsig/, /\bafbestil/, /\bfortryd/],
  invoiceChange: [/faktura.*(ændr|kredit|nedsæt|forkert|fejl)/, /(ændr|kredit|nedsæt).*faktura/, /kreditnota/],
  photos: [/\bbillede/, /\bfoto/, /\bvedh(æ|ae)ft/],
}

export function detectSignals(raw: string): Signals {
  const t = raw.toLowerCase()
  return {
    safetyEmergency: has(t, R.safety),
    outage: has(t, R.outage),
    dispute: has(t, R.dispute),
    unhappy: has(t, R.unhappy),
    humanRequested: has(t, R.human),
    priceRequest: has(t, R.price),
    dateRequest: has(t, R.date),
    warrantyQuestion: has(t, R.warranty),
    complianceQuestion: has(t, R.compliance),
    cancellationRequest: has(t, R.cancellation),
    invoiceChange: has(t, R.invoiceChange),
    photosMentioned: has(t, R.photos),
  }
}

const INTENT_RULES: Array<{ intent: Intent; res: RegExp[] }> = [
  { intent: 'invoice_question', res: [/\bfaktura/, /\bregning/, /\bbetaling/, /\brykker/] },
  { intent: 'existing_case_status', res: [/\b(min|vores) sag\b/, /har en sag/, /\bsag(snummer)?\b.*\bhos jer\b/, /\bsvc-?\d+/, /\bstatus\b/, /hvorn(å|aa)r kommer/] },
  { intent: 'new_installation_inquiry', res: [/tilbud p(å|aa)/, /\bsolceller\b/, /\bsolcelleanl(æ|ae)g/, /\bnyt anl(æ|ae)g/, /\bvarmepumpe/, /\bladestander/, /\binstallere\b/, /\bbatteri(løsning)?\b.*\b(købe|have|tilbud)/] },
  { intent: 'service_fault', res: [/\bg(å|aa)r offline/, /\bvirker ikke/, /\bfejl(kode|melding)?\b/, /\bdefekt/, /\bi stykker/, /\bstoppet\b/, /\bingen str(ø|oe)m/, /\bsl(å|aa)r fra/, /\balarm/, /\binverter/, /\bbatteri(et)?\b/] },
  { intent: 'appointment_request', res: [/\bbook(e)?\b/, /\baftale (et|en) (tid|besøg)/, /\bbesigtigelse/, /\bbes(ø|oe)g\b/] },
  { intent: 'callback_request', res: [/ring(e)? (mig )?(tilbage|op)/, /\bkontakt mig\b/] },
  { intent: 'offer_question', res: [/\bmit tilbud\b/, /\btilbuddet\b/, /\baccepter/] },
  { intent: 'supplier_or_spam', res: [/\bnyhedsbrev/, /\bunsubscribe/, /\bvi tilbyder\b/, /\bsamarbejde\b.*\bannonc/, /\bseo\b/] },
]

export interface Classification {
  intent: Intent
  /** 0–1. Deterministisk: én tydelig intent = 0.85, ingen = 0.3, flere konkurrerende = 0.55 */
  confidence: number
  matchedIntents: Intent[]
  source: 'keywords' | 'llm' | 'keywords+llm'
}

export function classifyIntent(raw: string, signals: Signals = detectSignals(raw)): Classification {
  if (signals.safetyEmergency) return { intent: 'emergency_safety', confidence: 0.95, matchedIntents: ['emergency_safety'], source: 'keywords' }
  const t = raw.toLowerCase()
  const matched = INTENT_RULES.filter((r) => has(t, r.res)).map((r) => r.intent)
  if (!matched.length) return { intent: signals.humanRequested ? 'callback_request' : 'other', confidence: signals.humanRequested ? 0.8 : 0.3, matchedIntents: [], source: 'keywords' }
  // Rækkefølgen i INTENT_RULES er prioritet (faktura > eksisterende sag > ny installation > fejl …)
  return { intent: matched[0], confidence: matched.length === 1 ? 0.85 : 0.7, matchedIntents: matched, source: 'keywords' }
}

export function urgencyFor(intent: Intent, s: Signals): Urgency {
  if (s.safetyEmergency || intent === 'emergency_safety') return 'emergency'
  if (s.outage || s.dispute || s.unhappy) return 'high'
  if (intent === 'supplier_or_spam') return 'low'
  return 'normal'
}

const ORDER: Urgency[] = ['low', 'normal', 'high', 'emergency']
export const maxUrgency = (a: Urgency, b: Urgency): Urgency => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b)
