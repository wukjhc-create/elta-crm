/**
 * Unit-test af Relatel-foundation (P3 #15). Ingen netvaerk, ingen DB.
 *   npx tsx scripts/relatel-test.ts
 */
import { toRelatelNumber, samePhone, formatPhoneForDisplay } from '../src/lib/integrations/relatel/phone'
import { disabledRelatelClient, RELATEL_OPERATIONS, RelatelDisabledError } from '../src/lib/integrations/relatel/contract'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }

const cases: Array<[string | null, string | null]> = [
  ['12345678', '4512345678'], ['12 34 56 78', '4512345678'], ['+45 12 34 56 78', '4512345678'], ['+4512345678', '4512345678'],
  ['0045 1234 5678', '4512345678'], ['4512345678', '4512345678'], ['+46 70 123 45 67', '46701234567'], ['0046701234567', '46701234567'],
  ['1234', null], ['', null], [null, null], ['abc', null],
]
for (const [raw, want] of cases) assert(toRelatelNumber(raw) === want, `normalisér ${JSON.stringify(raw)} -> ${want}`, String(toRelatelNumber(raw)))
assert(samePhone('12 34 56 78', '+45 12345678') && samePhone('0045 12345678', '4512345678'), 'samme nummer på tværs af formater')
assert(!samePhone('12345678', '12345679') && !samePhone(null, null) && !samePhone('', ''), 'forskellige/tomme numre matcher ikke')
assert(formatPhoneForDisplay('4571999999') === '+45 71 99 99 99' && formatPhoneForDisplay('46701234567') === '+46701234567', 'visningsformat')

assert(RELATEL_OPERATIONS.sendMessage.effect === 'send_external' && RELATEL_OPERATIONS.startCall.effect === 'push_external', 'skrivende operationer er klassificeret som ekstern effekt')
;(async () => {
  let refused = 0
  for (const op of ['listCalls', 'getContactByNumber', 'startCall', 'sendMessage'] as const) {
    try { await (disabledRelatelClient[op] as (a: never) => Promise<unknown>)({} as never) } catch (e) { if (e instanceof RelatelDisabledError) refused++ }
  }
  assert(refused === 4, 'deaktiveret klient afviser alle 4 operationer (intet netværk)')
  console.log(`\n${fails === 0 ? '✅ ALLE RELATEL-TESTS PASS' : `❌ ${fails} FEJL`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
