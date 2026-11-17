/**
 * Fase 3A — web-chattens svar. Bevidst IKKE 'use server'. Rækkefølge (politik før model, altid):
 *   1. NØD → PRÆCIS den godkendte nød-tekst (emergency-policy.ts). Aldrig model.
 *   2. Motorens svar ved handoff, bekræftelsesspørgsmål eller afviste tilsagn (pris/dato/garanti/compliance) — fast.
 *   3. Vidensspørgsmål (knowledge.ts): kendt fakta ordret; ukendt ⇒ "en medarbejder vender tilbage". Aldrig gæt.
 *   4. Ellers motorens faste kvittering.
 *   Valgfrit (RECEPTION_WEBCHAT_AI_REPLY_ENABLED, kun staging): den fælles AI-klient må OMFORMULERE trin 3/4 — med KUN
 *   det deterministiske svar + kendte fakta som input. Resultatet efterkontrolleres (ingen tal/URL'er der ikke stod i
 *   input, ingen løfter, ingen el-instruktioner, ingen ukendte fakta); fejler kontrollen, bruges det faste svar.
 *   Modellen kan derfor aldrig tilsidesætte politikken eller oplyse noget kundespecifikt.
 */
import type { ReceptionTurn } from '../engine'
import { replyViolations } from '../action-policy'
import { emergencyReply, UNAPPROVED_SAFETY_INSTRUCTION } from '../emergency-policy'
import { isKnown, knowledgeAnswer, knowledgeQuestion, RECEPTION_KNOWLEDGE, type KnowledgeFact, type KnowledgeKey } from '../knowledge'

export type ReplySource = 'emergency' | 'policy' | 'knowledge' | 'standard' | 'ai'

export interface WebChatReply { text: string; source: ReplySource; aiRejected?: string }

export interface ComposeInput {
  turn: Pick<ReceptionTurn, 'handoff' | 'needsVerification' | 'commitmentsRefused' | 'reply' | 'intent'>
  text: string
  /** Mangler den besøgende kontaktoplysninger, bedes der om dem (deterministisk) */
  hasContact: boolean
  knowledge?: Record<KnowledgeKey, KnowledgeFact>
  /** Valgfri omformulering (fælles AI-klient). Fejl/afvisning ⇒ fast svar. */
  rephrase?: (base: string, facts: Record<string, string>) => Promise<string | null>
}

const ASK_CONTACT = 'Skriv gerne dit navn og telefonnummer eller din e-mail, så en medarbejder kan vende tilbage til dig.'

/** Efterkontrol af et AI-formuleret svar */
export function aiReplyViolations(candidate: string, base: string, facts: Record<string, string>): string[] {
  const out: string[] = []
  if (!candidate.trim() || candidate.length > 600) out.push('length')
  if (replyViolations(candidate).length) out.push('policy')
  if (UNAPPROVED_SAFETY_INSTRUCTION.test(candidate)) out.push('safety_instruction')
  const allowed = `${base} ${Object.values(facts).join(' ')}`
  for (const n of candidate.match(/\d+/g) ?? []) if (!allowed.includes(n)) { out.push('new_number'); break }
  if (/https?:\/\/|www\./i.test(candidate) && !/https?:\/\/|www\./i.test(allowed)) out.push('new_url')
  if (/@/.test(candidate) && !allowed.includes('@')) out.push('new_email')
  return out
}

export async function composeWebChatReply(input: ComposeInput): Promise<WebChatReply> {
  const k = input.knowledge ?? RECEPTION_KNOWLEDGE
  if (input.turn.handoff?.reasons.includes('safety_emergency')) return { text: emergencyReply(), source: 'emergency' }
  const q = knowledgeQuestion(input.text)
  // Et vidensspørgsmål har lav INTENT-sikkerhed, men svaret er deterministisk (vidensbasen). Kun når lav sikkerhed er
  // den ENESTE grund til handoff; nød, menneske, afviste tilsagn og bekræftelse går altid forud. Internt handoff består.
  const onlyLowConfidence = !!input.turn.handoff && input.turn.handoff.reasons.every((r) => r === 'low_confidence')
  if ((input.turn.handoff && !(q && onlyLowConfidence)) || input.turn.needsVerification || input.turn.commitmentsRefused.length) {
    const base = input.turn.reply
    return { text: input.hasContact || input.turn.needsVerification ? base : `${base} ${ASK_CONTACT}`, source: 'policy' }
  }
  let base: string
  let source: ReplySource
  if (q) {
    const a = knowledgeAnswer(q, k)
    base = a.known ? a.text : `${a.text}${input.hasContact ? '' : ` ${ASK_CONTACT}`}`
    source = 'knowledge'
  } else {
    base = input.hasContact ? input.turn.reply : `${input.turn.reply} ${ASK_CONTACT}`
    source = 'standard'
  }
  if (!input.rephrase) return { text: base, source }
  const facts: Record<string, string> = {}
  for (const [key, f] of Object.entries(k)) if (isKnown(f)) facts[key] = f.value
  try {
    const cand = await input.rephrase(base, facts)
    if (!cand) return { text: base, source }
    const v = aiReplyViolations(cand, base, facts)
    return v.length ? { text: base, source, aiRejected: v.join(',') } : { text: cand.trim(), source: 'ai' }
  } catch {
    return { text: base, source }
  }
}
