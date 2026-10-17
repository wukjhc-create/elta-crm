/**
 * Unit-test (ingen DB) for kalkulation → tilbudslinjer (00219, Henrik 2026-10-14):
 *   hidden_included tæller i tilbudsprisen som ÉN linje "Øvrige materialer og ydelser" (med kost); excluded tæller ikke;
 *   avance/rabat-linjer beregnes af grundlaget; ældre rækker uden offer_mode udledes af show_on_offer.
 *   npx tsx scripts/calc-import-lines-test.ts
 */
import { buildCalculationImportLines, HIDDEN_INCLUDED_LINE_DESCRIPTION } from '../src/lib/offers/calc-import-lines'

let bad = 0
const ok = (c: boolean, label: string, note = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
const sum = (xs: Array<{ total: number }>) => Math.round(xs.reduce((s, l) => s + l.total, 0) * 100) / 100

const rows = [
  { description: 'Synlig A', quantity: 1, sale_price: 6000, cost_price: 3600, total: 6000, offer_mode: 'visible' },
  { description: 'Synlig B', quantity: 2, sale_price: 2000, cost_price: 1200, total: 4000, offer_mode: 'visible' },
  { description: 'Skjult 1', quantity: 1, sale_price: 1500, cost_price: 900, total: 1500, offer_mode: 'hidden_included' },
  { description: 'Skjult 2', quantity: 2, sale_price: 250, cost_price: 150, total: 500, offer_mode: 'hidden_included' },
  { description: 'Udeladt', quantity: 1, sale_price: 500, cost_price: 300, total: 500, offer_mode: 'excluded' },
]
const lines = buildCalculationImportLines({ rows, offerId: 'o', calculationId: 'c', startPosition: 3, marginPercentage: 20, discountPercentage: 10 })
const desc = lines.map((l) => l.description)
ok(desc.includes('Synlig A') && desc.includes('Synlig B'), 'synlige rækker får egne linjer')
ok(!desc.includes('Skjult 1') && !desc.includes('Skjult 2'), 'skjulte rækker vises ikke enkeltvis')
const hiddenLine = lines.find((l) => l.description === HIDDEN_INCLUDED_LINE_DESCRIPTION)
ok(!!hiddenLine && hiddenLine.total === 2000, 'skjult-men-medregnet samles i "Øvrige materialer og ydelser" (2.000)', `${hiddenLine?.total}`)
ok(!!hiddenLine && hiddenLine.cost_price === 1200, 'samlelinjen bærer kosten (900 + 2×150 = 1.200)', `${hiddenLine?.cost_price}`)
ok(!desc.includes('Udeladt'), 'udeladt række er ikke med')
const margin = lines.find((l) => l.description.startsWith('Avance'))
const discount = lines.find((l) => l.description.startsWith('Rabat'))
ok(margin?.total === 2400, 'avance af grundlaget (12.000 × 20 % = 2.400)', `${margin?.total}`)
ok(discount?.total === -1440, 'rabat efter avance ((12.000 + 2.400) × 10 % = 1.440)', `${discount?.total}`)
ok(sum(lines) === 12960, 'tilbuddets netto = kalkulationens netto (12.960)', `${sum(lines)}`)
ok(lines[0].position === 3 && lines.every((l, i) => l.position === 3 + i), 'positioner fortløbende fra start')

const legacy = buildCalculationImportLines({
  rows: [{ description: 'Gammel synlig', quantity: 1, sale_price: 100, total: 100, show_on_offer: true }, { description: 'Gammel skjult', quantity: 1, sale_price: 50, total: 50, show_on_offer: false }],
  offerId: 'o', calculationId: 'c', startPosition: 0, marginPercentage: 0, discountPercentage: 0,
})
ok(sum(legacy) === 150 && legacy.some((l) => l.description === HIDDEN_INCLUDED_LINE_DESCRIPTION), 'række uden offer_mode: show_on_offer=false → skjult-men-medregnet')
ok(buildCalculationImportLines({ rows: [{ description: 'x', total: 1, offer_mode: 'excluded' }], offerId: 'o', calculationId: 'c', startPosition: 0, marginPercentage: 0, discountPercentage: 0 }).length === 0, 'kun udeladte rækker → ingen linjer')
const noCost = buildCalculationImportLines({ rows, offerId: 'o', calculationId: 'c', startPosition: 0, marginPercentage: 0, discountPercentage: 0, includeCostPrices: false })
ok(noCost.every((l) => l.cost_price === null), 'uden kost: ingen kostpriser på linjerne')

// OF-9 (2026-10-17): kalkulationens rækkefølge (position) og sektioner som overskrifter
const ordered = buildCalculationImportLines({
  rows: [
    { position: 3, description: 'Stikkontakt', quantity: 2, sale_price: 100, total: 200, offer_mode: 'visible' },
    { position: 1, row_type: 'section', description: 'Køkken', quantity: 1, sale_price: 0, total: 0, offer_mode: 'visible' },
    { position: 2, description: 'Kabel', quantity: 10, sale_price: 12, total: 120, offer_mode: 'visible' },
  ],
  offerId: 'o', calculationId: 'c', startPosition: 0, marginPercentage: 0, discountPercentage: 0,
})
ok(ordered.map((l) => l.description).join('|') === 'Køkken|Kabel|Stikkontakt', 'linjer i kalkulationens rækkefølge', ordered.map((l) => l.description).join('|'))
const sec = ordered.find((l) => l.description === 'Køkken')
ok(!!sec && sec.line_type === 'section' && sec.quantity === 0 && sec.total === 0, 'sektionsrække → overskrift (0 stk, 0 kr)', JSON.stringify(sec))
ok(sum(ordered) === 320, 'sektion påvirker ikke summen', String(sum(ordered)))

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ kalkulation→tilbud-linjer ok')
process.exitCode = bad ? 1 : 0
