/**
 * Ren-logik-test af matchSentItem (Graph sentItems-korrelation).
 *   npx tsx scripts/graph-matchsentitem-test.ts
 * Ingen Graph-kald, ingen mail.
 */
import { matchSentItem, type SentItemRow } from '../src/lib/services/microsoft-graph'

let fails = 0
const assert = (cond: boolean, label: string) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) fails++ }

const since = '2026-09-20T07:00:00Z'
const rows: SentItemRow[] = [
  { id: 'x', subject: 'Andet emne', sentDateTime: '2026-09-20T07:30:00Z', toRecipients: [{ emailAddress: { address: 'a@x.dk' } }], conversationId: 'cx' },
  { id: 'y', subject: 'ELTA CRM Agent Core – testmail', sentDateTime: '2026-09-20T07:28:00Z', toRecipients: [{ emailAddress: { address: 'kontakt@eltasolar.dk' } }], conversationId: 'cy' },
  { id: 'z', subject: 'ELTA CRM Agent Core – testmail', sentDateTime: '2026-09-20T06:00:00Z', toRecipients: [{ emailAddress: { address: 'kontakt@eltasolar.dk' } }], conversationId: 'cz' },
]
const crit = { subject: 'ELTA CRM Agent Core – testmail', recipient: 'kontakt@eltasolar.dk', sentSinceIso: since }

const m = matchSentItem(rows, crit)
assert(m?.id === 'y', 'matcher korrekt (subject+modtager+indenfor vindue) => y')
assert(matchSentItem(rows, { ...crit, recipient: 'anden@x.dk' }) === undefined, 'forkert modtager => ingen match')
assert(matchSentItem(rows, { ...crit, subject: 'Findes ikke' }) === undefined, 'forkert subject => ingen match')
// kun det gamle (z) er indenfor subject+modtager men uden for vindue -> ingen match
assert(matchSentItem([rows[2]], crit) === undefined, 'uden for tidsvindue (stale) => ingen match')
assert(matchSentItem([], crit) === undefined, 'tom liste => ingen match')

console.log(`\n${fails === 0 ? '✅ ALLE MATCHSENTITEM-TESTS PASS' : `❌ ${fails} FEJL`}`)
process.exit(fails === 0 ? 0 : 1)
