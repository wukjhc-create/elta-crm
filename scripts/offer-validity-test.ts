/** Unit: tilbuds gyldighed (hele "gyldig til"-dagen i dansk tid). Kør: npx tsx scripts/offer-validity-test.ts */
import { isOfferExpired, canCustomerRespond } from '../src/lib/offers/validity'
let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${got} forventet=${want}`}`) }
eq('sidste dag kl. 01:30 dansk (23:30Z dagen før) — gyldig', isOfferExpired('2026-10-15', new Date('2026-10-14T23:30:00Z')), false)
eq('sidste dag kl. 23:59 dansk — gyldig', isOfferExpired('2026-10-15', new Date('2026-10-15T21:59:00Z')), false)
eq('dagen efter kl. 00:01 dansk — udløbet', isOfferExpired('2026-10-15', new Date('2026-10-15T22:01:00Z')), true)
eq('vintertid: sidste dag 23:30 dansk (22:30Z) — gyldig', isOfferExpired('2026-11-20', new Date('2026-11-20T22:30:00Z')), false)
eq('vintertid: dagen efter 00:30 dansk (23:30Z) — udløbet', isOfferExpired('2026-11-20', new Date('2026-11-20T23:30:00Z')), true)
eq('timestamp-værdi tolkes som dato', isOfferExpired('2026-10-15T00:00:00+00:00', new Date('2026-10-15T12:00:00Z')), false)
eq('ingen udløbsdato — aldrig udløbet', isOfferExpired(null), false)
eq('kladde kan ikke besvares', canCustomerRespond('draft', null), false)
eq('accepteret kan ikke besvares igen', canCustomerRespond('accepted', null), false)
eq('sendt + gyldig kan besvares', canCustomerRespond('sent', '2099-01-01'), true)
eq('set + udløbet kan ikke besvares', canCustomerRespond('viewed', '2020-01-01'), false)
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle tilbudsgyldigheds-tests PASS')
process.exitCode = fail ? 1 : 0
