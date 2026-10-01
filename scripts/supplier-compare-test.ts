/**
 * Unit-tests for grossist-prissammenligning (src/lib/pricing/supplier-compare.ts). Ingen DB.
 *   npx tsx scripts/supplier-compare-test.ts
 */
import { findCheaperAlternatives, normalizeEan } from '../src/lib/pricing/supplier-compare'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

const P = (id: string, sup: string, ean: string | null, cost: number | null) => ({ id, supplierId: sup, supplierName: sup.toUpperCase(), sku: `${sup}-${id}`, name: `prod ${id}`, ean, costPrice: cost })
const products = [
  P('a1', 'ao', '5701234567890', 100), P('l1', 'lm', '05701234567890', 80),   // GTIN-14 m. foranstillet 0 = samme vare
  P('a2', 'ao', '5709999999999', 50), P('l2', 'lm', '5709999999999', 55),       // LM dyrere -> ingen anbefaling
  P('a3', 'ao', '5701111111111', 200), P('l3', 'lm', '5701111111111', 199),     // 0,5 % -> under taerskel
  P('a4', 'ao', null, 10), P('l4', 'lm', '5702222222222', 0),                   // mangler EAN / kost 0
]
const lines = [
  { lineId: 'L1', description: 'Stikkontakt', quantity: 10, supplierProductId: 'a1', unitCost: 100 },
  { lineId: 'L2', description: 'Kabel', quantity: 5, supplierProductId: 'a2', unitCost: 50 },
  { lineId: 'L3', description: 'Tavle', quantity: 1, supplierProductId: 'a3', unitCost: 200 },
  { lineId: 'L4', description: 'Ukendt', quantity: 1, supplierProductId: 'a4', unitCost: 10 },
]
const r = findCheaperAlternatives(lines, products)
ok(r.length === 1 && r[0].lineId === 'L1', 'kun reel besparelse over tærskel', JSON.stringify(r.map((x) => x.lineId)))
ok(r[0].best.supplierName === 'LM' && r[0].savingPerUnit === 20 && r[0].savingTotal === 200 && r[0].savingPct === 20, 'besparelse beregnet', `${r[0].savingTotal} kr (${r[0].savingPct}%)`)
ok(normalizeEan('05701234567890') === normalizeEan('5701234567890') && normalizeEan('12') === null && normalizeEan(null) === null, 'EAN-normalisering')
ok(findCheaperAlternatives(lines, products, 0.1).some((x) => x.lineId === 'L3'), 'tærskel kan sænkes')
ok(findCheaperAlternatives([{ ...lines[0], unitCost: null }], products)[0]?.current.unitCost === 100, 'fallback til produktets kost når linjen mangler kost')
ok(JSON.stringify(findCheaperAlternatives(lines, products)) === JSON.stringify(findCheaperAlternatives([...lines].reverse(), [...products].reverse())), 'deterministisk uanset rækkefølge')

console.log(bad ? `\n❌ ${bad} FEJL` : '\n✅ ALLE PRISSAMMENLIGNINGS-TESTS PASS')
process.exit(bad ? 1 : 0)
