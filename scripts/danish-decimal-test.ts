/**
 * Unit-test (ingen I/O) for den fælles talparser parseDanishDecimal / toNumberDa — TZ-1/TZ-2 (2026-10-18).
 *   npx tsx scripts/danish-decimal-test.ts
 */
import { parseDanishDecimal, toNumberDa } from '../src/lib/utils/danish-number'

let bad = 0
const eq = (input: string | number | null | undefined, want: number | null) => {
  const got = parseDanishDecimal(input as string)
  const ok = got === want || (got !== null && want !== null && Math.abs(got - want) < 1e-9)
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(input)} → ${got}${ok ? '' : ` (forventet ${want})`}`)
}

// dansk
eq('1.234', 1234)
eq('1.234,56', 1234.56)
eq('1234,56', 1234.56)
eq('12.500.000', 12500000)
eq('12.500.000,5', 12500000.5)
eq('0,5', 0.5)
eq(',5', 0.5)
// eksplicit engelsk/import
eq('1,234.56', 1234.56)
eq('1234.56', 1234.56)
eq('1,234,567.89', 1234567.89)
eq('2.5', 2.5)
// negative og nul
eq('-1.234,56', -1234.56)
eq('-1234,5', -1234.5)
eq('−1.234,56', -1234.56) // typografisk minus
eq('-0', 0)
eq('0', 0)
eq('0,00', 0)
// mellemrum og kroneformat
eq(' 1 234,56 ', 1234.56)
eq('1 234,56', 1234.56)
eq('1.234,56 kr.', 1234.56)
eq('1.234,56 kr', 1234.56)
eq('kr. 1.234,56', 1234.56)
eq('DKK 1.234,56', 1234.56)
eq('1.234,56 DKK', 1234.56)
eq('1.234,-', 1234)
// tomt/ugyldigt/tvetydigt → null (aldrig 0)
eq('', null)
eq('   ', null)
eq('-', null)
eq('abc', null)
eq('1.23.4', null)
eq('12,5,6', null)
eq('12.5,6', null)
eq('1,23.45', null)
eq('1e5', null)
eq('Infinity', null)
eq('NaN', null)
eq('12a', null)
eq(null, null)
eq(undefined, null)
eq(Number.NaN, null)
eq(42.5, 42.5)

// toNumberDa: tomt/ugyldigt → NaN (ikke 0)
const nan = (label: string, v: number) => { const ok = Number.isNaN(v); if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  toNumberDa ${label} → ${v}`) }
nan('""', toNumberDa(''))
nan('"  "', toNumberDa('  '))
nan('null', toNumberDa(null))
nan('"abc"', toNumberDa('abc'))
{ const v = toNumberDa('1.250'); const ok = v === 1250; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  toNumberDa "1.250" → ${v}`) }
{ const v = toNumberDa('0'); const ok = v === 0; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  toNumberDa "0" → ${v} (eksplicit nul er stadig 0)`) }

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle talparser-tests bestået')
process.exitCode = bad ? 1 : 0
