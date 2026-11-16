/**
 * AI-receptionist fase 2 — lokal tekst-simulator (før stemme). Ingen DB, intet netværk, ingen afsendelse.
 *   npx tsx scripts/reception-simulator.ts            (alle scenarier)
 *   npx tsx scripts/reception-simulator.ts "Min tekst" 20304050
 * besked → identitet → niveau → intent/signaler → politik → foreslåede CRM-handlinger → handoff → svar
 * Samme motor kører i Henvendelser-simulatoren mod det rigtige CRM (simulateReception, staging).
 */
import { runReceptionTurn } from '../src/lib/reception/engine'
import { replyViolations } from '../src/lib/reception/action-policy'
import { fakePorts, SCENARIOS } from './reception-fixtures'

async function show(name: string, text: string | null, phone?: string, claimed?: { postalCode?: string; streetName?: string; caseNumber?: string }) {
  const t = await runReceptionTurn({ channel: 'phone', text, sender: { phone: phone ?? null }, claimed, conversationKey: `sim:${name}` }, fakePorts())
  console.log(`\n■ ${name}\n  Besked:    ${text ?? '(transskription mangler)'}${phone ? `  [nummer ${phone}]` : ''}${claimed ? `  [oplyst ${JSON.stringify(claimed)}]` : ''}`)
  console.log(`  Identitet: ${t.identity.state} · niveau L${t.level}${t.verification !== 'not_attempted' ? ` · bekræftelse ${t.verification}` : ''}`)
  console.log(`  Intent:    ${t.intent} (${Math.round(t.confidence * 100)}%) · haster ${t.urgency} · sag ${t.caseMatch.state}`)
  console.log(`  Handlinger: ${t.actions.map((a) => `${a.type}=${a.outcome}`).join(', ')}`)
  if (t.commitmentsRefused.length) console.log(`  Afviste tilsagn: ${t.commitmentsRefused.join(', ')}`)
  console.log(`  Handoff:   ${t.handoff ? `${t.handoff.reasons.join(', ')} → ${t.handoff.team} (${t.handoff.suggestedNextAction})` : 'nej'}`)
  console.log(`  Svar:      ${t.reply}${replyViolations(t.reply).length ? '  ⚠ LØFTE I SVAR' : ''}`)
}

async function main() {
  const [text, phone] = process.argv.slice(2)
  if (text) return show('Egen besked', text, phone)
  for (const s of SCENARIOS) await show(s.name, s.text, s.phone, s.claimed)
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
