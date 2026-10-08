/**
 * Unit-tests for margin-advarslens kost/salg (src/lib/alerts/offer-margin.ts). Ingen DB.
 *   npx tsx scripts/offer-margin-test.ts
 */
import { offerCostAndSale } from '../src/lib/alerts/offer-margin'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }

// 10 stk à kost 90 / salg 100 → kost 900, salg 1000 (før: kost 90 → 91 % "margin")
const a = offerCostAndSale([{ cost_price: 90, quantity: 10, total: 1000 }])
ok(a.totalCost === 900 && a.totalSale === 1000, 'kost ganges med antal')
const b = offerCostAndSale([{ cost_price: '12.5', quantity: '4', total: '80' }, { cost_price: null, quantity: 1, total: 500 }])
ok(b.totalCost === 50 && b.totalSale === 580 && b.linesWithoutCost === 1, 'tekst-tal parses; linje uden kost tæller i salg og markeres')
ok(offerCostAndSale([]).totalCost === 0, 'tomt tilbud → 0')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle margin-tests bestået')
process.exitCode = bad ? 1 : 0
