/**
 * Unit-tests for den fælles gratis-mail-liste (src/lib/email/free-mail-domains.ts). Ingen DB.
 *   npx tsx scripts/free-mail-domains-test.ts
 */
import { isFreeMailDomain } from '../src/lib/email/free-mail-domains'
import { isFreeMailAddress, senderDomain } from '../src/lib/invoice-control/sender-domain'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }

for (const d of ['hotmail.dk', 'live.dk', 'outlook.dk', 'gmx.net', 'mail.tele.dk', 'post.tele.dk', 'youmail.dk', 'gmail.com']) ok(isFreeMailDomain(d), `${d} er gratis-mail (kobles ikke på domæne)`)
ok(isFreeMailDomain('HOTMAIL.DK') && isFreeMailDomain(' www.live.dk '), 'case/whitespace/www ignoreres')
ok(!isFreeMailDomain('eltasolar.dk') && !isFreeMailDomain('sieg.dk') && !isFreeMailDomain(''), 'firmadomæner er ikke gratis-mail')
ok(isFreeMailAddress('Hanne <hanne@hotmail.dk>') && senderDomain('x@live.dk') === null, 'leverandørsignal bruger samme liste')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle gratis-mail-tests bestået')
process.exitCode = bad ? 1 : 0
