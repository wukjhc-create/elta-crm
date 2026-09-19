/**
 * Ren-logik-test af Mailagent confidence-modellen (ingen DB).
 *   npx tsx scripts/agent-confidence-test.ts
 */
import { scoreLinkConfidence, reviewPriority, type CustomerCandidate } from '../src/lib/agents/mail-confidence'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }

const cust = (id: string, signals: CustomerCandidate['signals']): CustomerCandidate => ({
  id, company_name: 'Kunde ' + id, customer_number: 'C' + id, email: id + '@x.dk', signals,
})

// high: enkelt entydigt email-match
const high = scoreLinkConfidence([cust('1', [{ kind: 'email', detail: 'a@x.dk', strong: true }])])
assert(high.level === 'high' && !high.conflicts, 'enkelt email-match => high', high.level)

// medium: enkelt telefon-match (ingen email)
const med = scoreLinkConfidence([cust('1', [{ kind: 'phone', detail: '12345678', strong: true }])])
assert(med.level === 'medium', 'enkelt telefon-match => medium', med.level)

// low: kun navne-match
const low = scoreLinkConfidence([cust('1', [{ kind: 'name', detail: 'Bo', strong: false }])])
assert(low.level === 'low' && !low.conflicts, 'kun navn => low', low.level)

// conflicts: flere kandidater => altid low + conflicts
const multi = scoreLinkConfidence([
  cust('1', [{ kind: 'email', detail: 'a@x.dk', strong: true }]),
  cust('2', [{ kind: 'email', detail: 'a@x.dk', strong: true }]),
])
assert(multi.level === 'low' && multi.conflicts && multi.candidateCount === 2, 'flere kandidater => low + conflicts', `${multi.level}/${multi.conflicts}`)

// no match
const none = scoreLinkConfidence([])
assert(none.level === 'low' && none.candidateCount === 0 && !none.conflicts, 'ingen match => low, 0 kandidater')

// reviewPriority-ordning: conflicts > low > medium > high
assert(
  reviewPriority('low', true) > reviewPriority('low', false) &&
  reviewPriority('low', false) > reviewPriority('medium', false) &&
  reviewPriority('medium', false) > reviewPriority('high', false),
  'reviewPriority: conflicts > low > medium > high',
)

console.log(`\n${fails === 0 ? '✅ ALLE CONFIDENCE-TESTS PASS' : `❌ ${fails} FEJL`}`)
process.exit(fails === 0 ? 0 : 1)
