/**
 * Unit-tests for isForwardedEmail (src/lib/services/email-intelligence.ts) — kun eksplicitte videresendelser. Ingen DB/AI.
 *   npx tsx scripts/forwarded-detect-test.ts
 */
import { isForwardedEmail } from '../src/lib/services/email-intelligence'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }
const mk = (subject: string, bodyText: string) => ({ subject, senderEmail: 'kunde@firma.dk', senderName: 'Kunde', bodyText, bodyHtml: null, bodyPreview: null })

ok(isForwardedEmail(mk('VS: Tilbud', 'se nedenfor')), 'emne VS: = videresendt')
ok(isForwardedEmail(mk('Fwd: pris', '')), 'emne Fwd: = videresendt')
ok(isForwardedEmail(mk('Henvendelse', '---------- Videresendt besked ----------\nFra: Jens <j@x.dk>')), 'eksplicit markør i brødtekst')
ok(!isForwardedEmail(mk('SV: Tilbud', 'Tak, det passer fint.\n\nFra: Henrik <hc@eltasolar.dk>\nSendt: 6. okt.')), 'Outlook-svar med citeret Fra: er IKKE videresendt')
ok(!isForwardedEmail(mk('Re: aftale', 'Ok!\n> From: Elta <kontakt@eltasolar.dk>')), 'svar med citeret From: er IKKE videresendt')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle videresendelses-tests bestået')
process.exitCode = bad ? 1 : 0
