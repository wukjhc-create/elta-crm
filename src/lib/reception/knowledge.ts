/**
 * Fase 3A — ÉN kanonisk vidensbase for receptionisten (web-chat nu; telefon/SMS senere). Bevidst IKKE 'use server'.
 *
 * Regler:
 *   - Firmafakta står KUN her — aldrig hårdkodet i prompts eller svar-skabeloner andre steder.
 *   - En fakta er 'known' KUN med en kilde. Alt andet er 'unknown' og forbliver ukendt: receptionisten svarer så, at en
 *     medarbejder vender tilbage — den gætter aldrig (ingen åbningstider, områder, priser eller svartider fra fantasien).
 *   - Priser, datoer, garanti- og lovgivningssvar er ALDRIG viden her (politik: action-policy.ts / replyViolations).
 * Henrik udfylder de ukendte felter (docs/runbooks/ELTA_COMMUNICATION_HUB_PHASE_3A.md §9). Indtil da er de null.
 */

export type KnowledgeKey =
  | 'company_name' | 'business_area' | 'contact_email' | 'website' | 'contact_phone' | 'opening_hours' | 'service_area'
  | 'products_services' | 'service_visit_process' | 'customer_preparation' | 'photo_requirements' | 'response_time'
  | 'escalation_emergency' | 'escalation_human'

export interface KnowledgeFact {
  label: string
  value: string | null
  /** Hvor værdien kommer fra (fx "Henrik 2026-11-20", "CLAUDE.md"). null ⇔ ukendt. */
  source: string | null
}

export const RECEPTION_KNOWLEDGE: Record<KnowledgeKey, KnowledgeFact> = {
  company_name: { label: 'Firma', value: 'Elta Solar ApS', source: 'CLAUDE.md (projektinfo)' },
  business_area: { label: 'Vi laver', value: 'el- og solcelleinstallationer', source: 'CLAUDE.md (projektinfo)' },
  contact_email: { label: 'E-mail', value: 'kontakt@eltasolar.dk', source: 'kontaktpostkassen der synkroniseres (GRAPH_MAILBOX)' },
  website: { label: 'Hjemmeside', value: 'eltasolar.dk', source: 'firmaets maildomæne' },
  contact_phone: { label: 'Telefon', value: null, source: null },
  opening_hours: { label: 'Åbningstider', value: null, source: null },
  service_area: { label: 'Område vi dækker', value: null, source: null },
  products_services: { label: 'Ydelser i detaljer', value: null, source: null },
  service_visit_process: { label: 'Sådan foregår et servicebesøg', value: null, source: null },
  customer_preparation: { label: 'Det skal du have klar', value: null, source: null },
  photo_requirements: { label: 'Billeder/dokumenter vi beder om', value: null, source: null },
  response_time: { label: 'Svartid', value: null, source: null },
  // Nød er en GODKENDT, fast politik (emergency-policy.ts) — teksten står dér, ikke her
  escalation_emergency: { label: 'Nød', value: 'fast nød-tekst (emergency-policy.ts)', source: 'Henrik-godkendt nød-tekst (00249-preflight)' },
  escalation_human: { label: 'Medarbejder', value: 'henvendelsen gives videre til en medarbejder, som vender tilbage', source: 'politik (engine.ts)' },
}

export function isKnown(f: KnowledgeFact): f is KnowledgeFact & { value: string; source: string } {
  return f.value !== null && f.source !== null && f.value.trim().length > 0
}

/** De felter Henrik mangler at levere (til runbooken og til en senere admin-side) */
export function missingKnowledge(k: Record<KnowledgeKey, KnowledgeFact> = RECEPTION_KNOWLEDGE): KnowledgeKey[] {
  return (Object.keys(k) as KnowledgeKey[]).filter((key) => !isKnown(k[key]))
}

/** Deterministisk: hvilket vidensfelt spørger den besøgende om? (nøgleord, ikke LLM). null = intet vidensspørgsmål. */
// Unicode-ordgrænser: JavaScripts \b kender ikke æ/ø/å (fx "åbningstider" ville aldrig matche)
const w = (alts: string) => new RegExp(`(?<![\\p{L}\\p{N}])(${alts})(?![\\p{L}\\p{N}])`, 'iu')
const QUESTIONS: Array<{ key: KnowledgeKey; re: RegExp }> = [
  { key: 'opening_hours', re: w('åbningstid\\p{L}*|åben|åbent|lukker|lukket') },
  { key: 'contact_phone', re: w('telefonnummer|telefon ?nr|hvilket nummer|ringe til jer|jeres nummer') },
  { key: 'contact_email', re: w('e-?mail(adresse)?|mailadresse|skrive til jer') },
  { key: 'service_area', re: w('område|kommer i (ud )?til|dækker i|kører i til|langt væk') },
  { key: 'service_visit_process', re: w('hvordan foregår|servicebesøg|hvad sker der når') },
  { key: 'customer_preparation', re: w('have klar|forberede|skal jeg gøre inden') },
  { key: 'photo_requirements', re: w('billede\\p{L}*|foto\\p{L}*|dokumentation') },
  { key: 'response_time', re: w('hvor hurtigt|svartid|hvornår svarer|hvor lang tid') },
  { key: 'products_services', re: w('hvad laver i|hvilke ydelser|tilbyder i|kan i hjælpe med') },
]
export function knowledgeQuestion(text: string): KnowledgeKey | null {
  for (const q of QUESTIONS) if (q.re.test(text)) return q.key
  return null
}

/** Svar på et vidensspørgsmål — kendt fakta ordret; ukendt ⇒ ærligt "det kan en medarbejder svare på" */
export function knowledgeAnswer(key: KnowledgeKey, k: Record<KnowledgeKey, KnowledgeFact> = RECEPTION_KNOWLEDGE): { text: string; known: boolean } {
  const f = k[key]
  if (isKnown(f)) return { text: `${f.label}: ${f.value}.`, known: true }
  return { text: `Det kan jeg desværre ikke svare sikkert på her (${f.label.toLowerCase()}). En medarbejder vender tilbage til dig.`, known: false }
}
