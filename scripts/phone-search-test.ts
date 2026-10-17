/**
 * LC-8 (review 2026-10-17): telefonsøgning på tværs af formater. Ren logik.
 *   npx tsx scripts/phone-search-test.ts
 */
import { phoneDigitsPattern } from '../src/lib/utils/phone-search'

let bad = 0
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — fik ${JSON.stringify(got)}, ville have ${JSON.stringify(want)}`}`)
}
const like = (pattern: string, value: string) => new RegExp(`^${pattern.split('%').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(value)

const p = phoneDigitsPattern('20345678')
eq('8 cifre → mønster', p, '%2%0%3%4%5%6%7%8%')
eq('matcher "20 34 56 78"', like(p!, '20 34 56 78'), true)
eq('matcher "20345678"', like(p!, '20345678'), true)
eq('+45 fjernes', phoneDigitsPattern('+45 20 34 56 78'), '%2%0%3%4%5%6%7%8%')
eq('navn → null', phoneDigitsPattern('Hansen'), null)
eq('blandet tekst → null', phoneDigitsPattern('SVC-12345'), null)
eq('for kort (kundenr.) → null', phoneDigitsPattern('1234'), null)
eq('tom → null', phoneDigitsPattern(''), null)

console.log(bad ? `❌ ${bad} fejl` : '✅ alle bestået')
process.exitCode = bad ? 1 : 0
