/**
 * Unit-tests for parseDanishNumber (src/lib/services/import-engine.ts). Ingen DB.
 *   npx tsx scripts/danish-number-test.ts
 */
import { parseDanishNumber } from '../src/lib/services/import-engine'

let bad = 0
const eq = (input: string, want: number | null) => {
  const got = parseDanishNumber(input)
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(input)} → ${got}${ok ? '' : ` (forventet ${want})`}`)
}
eq('1.234,56', 1234.56)
eq('1 234,56', 1234.56)
eq('1 234,56', 1234.56)
eq('1.234.567', 1234567)
eq('1.234.567,89', 1234567.89)
eq('12,50', 12.5)
eq('12.50', 12.5)
eq('-1.234,50', -1234.5)
eq('12,50 kr', 12.5)
eq('', null)
eq('abc', null)
eq('1.234', 1.234) // tvetydigt — uændret adfærd (decimalpunktum)
console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle talformat-tests bestået')
process.exitCode = bad ? 1 : 0
