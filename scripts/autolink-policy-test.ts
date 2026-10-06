/**
 * Unit-tests for K5 confidence-modellen (src/lib/mail/autolink-policy.ts). Ingen DB.
 *   npx tsx scripts/autolink-policy-test.ts
 */
import { decideAutoLink } from '../src/lib/mail/autolink-policy'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }
const none = { exactCustomerIds: [], contactCustomerIds: [], threadCustomerIds: [], domainCustomerIds: [] }

const d1 = decideAutoLink({ ...none, exactCustomerIds: ['A'] })
ok(d1.action === 'link' && d1.customerId === 'A' && d1.matchedOn === 'email', 'præcis kunde-e-mail → kobles', JSON.stringify(d1))
const d2 = decideAutoLink({ ...none, contactCustomerIds: ['B'] })
ok(d2.action === 'link' && d2.matchedOn === 'contact', 'præcis kontakt-e-mail → kobles')
ok(decideAutoLink({ ...none, exactCustomerIds: ['A'], contactCustomerIds: ['A'] }).action === 'link', 'samme kunde via begge → kobles')
const d4 = decideAutoLink({ ...none, exactCustomerIds: ['A', 'B'] })
ok(d4.action === 'suggest' && d4.matchedOn === 'ambiguous', 'e-mail på 2 kunder → ALDRIG auto (forslag)', JSON.stringify(d4))
ok(decideAutoLink({ ...none, exactCustomerIds: ['A'], contactCustomerIds: ['B'] }).action === 'suggest', 'kunde-e-mail A + kontakt hos B → tvetydigt')
const d6 = decideAutoLink({ ...none, threadCustomerIds: ['C'] })
ok(d6.action === 'link' && d6.matchedOn === 'thread', 'samtale med én kunde → kobles')
ok(decideAutoLink({ ...none, threadCustomerIds: ['C', 'D'] }).action === 'suggest', 'samtale med 2 kunder → forslag')
const d8 = decideAutoLink({ ...none, domainCustomerIds: ['E'] })
ok(d8.action === 'suggest' && d8.matchedOn === 'domain', 'kun domæne → forslag (kobles ikke)', JSON.stringify(d8))
ok(decideAutoLink({ ...none, domainCustomerIds: ['E', 'F'] }).action === 'suggest', 'domæne på 2 kunder → forslag')
ok(decideAutoLink({ ...none, exactCustomerIds: ['A'], domainCustomerIds: ['E', 'F'] }).action === 'link', 'præcis match vinder over domæne')
ok(decideAutoLink({ ...none, exactCustomerIds: ['A'], threadCustomerIds: ['C'] }).action === 'link' && (decideAutoLink({ ...none, exactCustomerIds: ['A'], threadCustomerIds: ['C'] }) as { customerId: string }).customerId === 'A', 'præcis e-mail vinder over samtale')
ok(decideAutoLink(none).action === 'none', 'intet match → ingenting')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle autolink-policy-tests bestået')
process.exitCode = bad ? 1 : 0
