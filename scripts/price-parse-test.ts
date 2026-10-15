/**
 * Unit-test (ingen DB) for GP-13 prisparser (lib/import/price-parse.ts).   npx tsx scripts/price-parse-test.ts
 */
import { parsePrice, detectDecimalSeparator } from '../src/lib/import/price-parse'
import { parseDanishNumber } from '../src/lib/services/import-engine'

let bad = 0
const eq = (label: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} → ${JSON.stringify(got)}${ok ? '' : `  (forventet ${JSON.stringify(want)})`}`) }
const v = (s: string, hint?: ',' | '.') => { const r = parsePrice(s, hint); return r.ok ? r.value : r.reason }

// Henriks eksempler — uden filhint (deterministisk, ingen gæt)
eq('"1.234" uden hint', v('1.234'), 'ambiguous')
eq('"1.234,56"', v('1.234,56'), 1234.56)
eq('"1234,56"', v('1234,56'), 1234.56)
eq('"1,234.56"', v('1,234.56'), 1234.56)
eq('"1234.56"', v('1234.56'), 1234.56)
eq('tom værdi', v(''), 'empty')
eq('"0"', v('0'), 0)
eq('ugyldig tekst "abc"', v('abc'), 'invalid')
// med filens decimaltegn
eq('"1.234" i dansk fil (decimal ,)', v('1.234', ','), 1234)
eq('"1.234" i engelsk fil (decimal .)', v('1.234', '.'), 1.234)
eq('"1,234" i dansk fil', v('1,234', ','), 1.234)
eq('"1,234" i engelsk fil', v('1,234', '.'), 1234)
// grænsetilfælde
eq('"12abc" (før: 12)', v('12abc'), 'invalid')
eq('"1.234.567"', v('1.234.567'), 1234567)
eq('"1,234,567"', v('1,234,567'), 1234567)
eq('"1 234,56" (mellemrum)', v('1 234,56'), 1234.56)
eq('"12,5"', v('12,5'), 12.5)
eq('"-45,00"', v('-45,00'), -45)
eq('"45,00-" (fortegn bagved)', v('45,00-'), -45)
eq('"1.23.4" (forkert gruppering)', v('1.23.4'), 'invalid')
eq('"1,2,3"', v('1,2,3'), 'invalid')
eq('"99,95 kr"', v('99,95 kr'), 99.95)
eq('"1.234,5.6"', v('1.234,5.6'), 'invalid')
// filhint-detektion
eq('detektion: dansk', detectDecimalSeparator(['12,50', '1.234,56', '1.234']), ',')
eq('detektion: engelsk', detectDecimalSeparator(['12.50', '1,234.56', '1,234']), '.')
eq('detektion: blandet → ingen', detectDecimalSeparator(['12,50', '12.50']), null)
eq('detektion: kun tvetydige → ingen', detectDecimalSeparator(['1.234', '2.345']), null)
// parseDanishNumber (dansk standard) er nu streng
eq('parseDanishNumber("1.234") (dansk = tusindtal)', parseDanishNumber('1.234'), 1234)
eq('parseDanishNumber("12abc")', parseDanishNumber('12abc'), null)
eq('parseDanishNumber("1.234,56")', parseDanishNumber('1.234,56'), 1234.56)
// ImportEngine: filens decimaltegn afgør tvetydige værdier; uden entydige værdier → rækkefejl (kontrol), aldrig gæt/0
async function engineTests() {
  const { ImportEngine } = await import('../src/lib/services/import-engine')
  const eng = new ImportEngine({ supplier_id: 'x', format: 'csv', delimiter: ';', column_mappings: { sku: 'varenr', name: 'navn', cost_price: 'kost' } } as never)
  const dk = await eng.parseCSV('varenr;navn;kost\nA1;Kabel;12,50\nA2;Tavle;1.234\nA3;Tom;\nA4;Skrald;abc')
  eq('dansk fil: "12,50"', dk[0].parsed.cost_price, 12.5)
  eq('dansk fil: "1.234" = 1234', dk[1].parsed.cost_price, 1234)
  eq('dansk fil: tom kost = null, ingen prisfejl', [dk[2].parsed.cost_price, dk[2].errors.some((e) => /kostpris/.test(e))], [null, false])
  eq('dansk fil: "abc" → rækkefejl, ingen pris', [dk[3].parsed.cost_price, dk[3].errors.some((e) => e.startsWith('Ugyldig kostpris'))], [null, true])
  const amb = await eng.parseCSV('varenr;navn;kost\nB1;Rør;1.234\nB2;Rør2;2.345')
  eq('fil uden entydigt decimaltegn: "1.234" → tvetydig rækkefejl', [amb[0].parsed.cost_price, amb[0].errors.some((e) => e.startsWith('Tvetydig kostpris'))], [null, true])
  const en = await eng.parseCSV('varenr;navn;kost\nC1;Kabel;12.50\nC2;Tavle;1,234.56\nC3;Rør;1.234')
  eq('engelsk fil: "1,234.56"', en[1].parsed.cost_price, 1234.56)
  eq('engelsk fil: "1.234" = 1,234', en[2].parsed.cost_price, 1.234)
}
engineTests().then(() => {
  console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ prisparser ok')
  process.exitCode = bad ? 1 : 0
})
