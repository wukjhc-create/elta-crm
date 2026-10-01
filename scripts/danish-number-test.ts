/** Unit: dansk talinput i formularer (beløb/antal). Kør: npx tsx scripts/danish-number-test.ts */
import { parseDanishDecimal, toNumberDa } from '../src/lib/utils/danish-number'
let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${got} forventet=${want}`}`) }
eq('"1.250" er tusind to hundrede halvtreds (før: 1,25)', parseDanishDecimal('1.250'), 1250)
eq('"12.500.000"', parseDanishDecimal('12.500.000'), 12500000)
eq('"1.234,56"', parseDanishDecimal('1.234,56'), 1234.56)
eq('"1234,5"', parseDanishDecimal('1234,5'), 1234.5)
eq('"0,5" timer', parseDanishDecimal('0,5'), 0.5)
eq('"2.5" (punktum-decimal)', parseDanishDecimal('2.5'), 2.5)
eq('"1.50" (punktum-decimal)', parseDanishDecimal('1.50'), 1.5)
eq('"1 250 kr"', parseDanishDecimal('1 250 kr'), 1250)
eq('"kr. 400,00"', parseDanishDecimal('kr. 400,00'), 400)
eq('"1,234.56" (engelsk)', parseDanishDecimal('1,234.56'), 1234.56)
eq('"-300,00"', parseDanishDecimal('-300,00'), -300)
eq('"400"', parseDanishDecimal('400'), 400)
eq('",5"', parseDanishDecimal(',5'), 0.5)
eq('tom → null', parseDanishDecimal(''), null)
eq('"abc" → null', parseDanishDecimal('abc'), null)
eq('"1,2,3" → null', parseDanishDecimal('1,2,3'), null)
eq('"1.2.3" → null', parseDanishDecimal('1.2.3'), null)
eq('tal ind → samme tal', parseDanishDecimal(42.5), 42.5)
eq('toNumberDa: tom → 0 (som Number)', toNumberDa(''), 0)
eq('toNumberDa: ugyldig → NaN', Number.isNaN(toNumberDa('x')), true)
eq('toNumberDa: "1.250" → 1250', toNumberDa('1.250'), 1250)
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle dansk-tal-tests PASS')
process.exitCode = fail ? 1 : 0
