/**
 * N66: unit-tests for afsenderdomæne → leverandør (src/lib/invoice-control/sender-domain.ts).
 *   npx tsx scripts/sender-domain-test.ts
 */
import { senderDomain, suppliersForDomain, websiteHost } from '../src/lib/invoice-control/sender-domain'

let failed = 0
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '❌'} ${name}${ok ? '' : ` — fik ${JSON.stringify(got)}, ville have ${JSON.stringify(want)}`}`)
}

eq('domæne fra adresse', senderDomain('Faktura@Sieg.DK'), 'sieg.dk')
eq('domæne fra "Navn <adr>"', senderDomain('Sieg A/S <faktura@sieg.dk>'), 'sieg.dk')
eq('www fjernes', senderDomain('x@www.seva.dk'), 'seva.dk')
eq('gratis-mail er intet signal', senderDomain('hans@gmail.com'), null)
eq('live.dk er intet signal', senderDomain('a@live.dk'), null)
eq('ugyldig adresse', senderDomain('ingen-snabel-a'), null)
eq('tom', senderDomain(null), null)

eq('host fra url', websiteHost('https://www.sieg.dk/kontakt'), 'sieg.dk')
eq('host uden protokol', websiteHost('willems.dk'), 'willems.dk')
eq('host med port', websiteHost('http://seva.dk:8080'), 'seva.dk')
eq('ikke en host', websiteHost('Ring til os'), null)

const sup = [
  { id: 'a', website: 'https://www.sieg.dk', contact_email: null },
  { id: 'b', website: null, contact_email: 'ordre@seva.dk' },
  { id: 'c', website: 'xsieg.dk', contact_email: null },
  { id: 'd', website: null, contact_email: 'lars@gmail.com' },
]
eq('website-match', suppliersForDomain('sieg.dk', sup).map((s) => s.id), ['a'])
eq('underdomæne matcher', suppliersForDomain('faktura.sieg.dk', sup).map((s) => s.id), ['a'])
eq('kontakt-mail-match', suppliersForDomain('seva.dk', sup).map((s) => s.id), ['b'])
eq('ingen delvis navne-match (xsieg ≠ sieg)', suppliersForDomain('xsieg.dk', sup).map((s) => s.id), ['c'])
eq('gratis-mail på leverandøren matcher aldrig', suppliersForDomain('gmail.com', sup).map((s) => s.id), [])

if (failed) { console.log(`❌ ${failed} fejlede`); process.exit(1) }
console.log('✅ alle afsenderdomæne-tests bestået')
