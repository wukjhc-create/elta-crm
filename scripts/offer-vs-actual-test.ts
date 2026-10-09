/**
 * Unit-tests for N26c (src/lib/cases/offer-vs-actual.ts). Ingen DB.
 *   npx tsx scripts/offer-vs-actual-test.ts
 */
import { compareOfferToActual } from '../src/lib/cases/offer-vs-actual'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

const res = compareOfferToActual(
  [
    { id: 'L1', description: 'Montage', quantity: 10, unit: 'timer', cost_price: 400 },
    { id: 'L2', description: 'Inverter 10 kW', quantity: 1, unit: 'stk', cost_price: 8000, supplier_product_id: 'SP-INV' },
    { id: 'L3', description: 'Kabel 3x2,5', quantity: 50, unit: 'm', cost_price: 10 },
    { id: 'L4', description: 'Stikkontakt', quantity: 4, unit: 'stk', cost_price: null, supplier_cost_price_at_creation: '25' },
    { id: 'L5', description: 'Tavlekomponent', quantity: 1, unit: 'stk', cost_price: 500 },
  ],
  [
    { id: 'M1', description: 'Inverter (anden tekst)', quantity: 1, unit: 'stk', total_cost: 8100, supplier_product_id: 'SP-INV' },
    { id: 'M2', description: 'kabel  3x2,5 ', quantity: 30, unit: 'm', total_cost: 300 },
    { id: 'M3', description: 'kabel 3x2,5', quantity: 30, unit: 'm', total_cost: 300 },
    { id: 'M4', description: 'Noget andet', quantity: 1, unit: 'stk', total_cost: 75, source_offer_line_id: 'L4' },
    { id: 'M5', description: 'Ekstra beslag', quantity: 2, unit: 'stk', total_cost: 60 },
  ],
  { hours: 12, cost: 4800 },
)
const by = (k: string) => res.rows.find((r) => r.key === k)!

const lab = by('labour')
ok(lab.offered_qty === 10 && lab.actual_qty === 12 && lab.offered_cost === 4000 && lab.actual_cost === 4800, 'arbejdstimer samlet (tilbudt vs. faktisk)', JSON.stringify(lab))
ok(lab.status === 'over' && lab.cost_deviation === 800, 'arbejdstimer over budget')
ok(by('L2').match === 'supplier_product' && by('L2').status === 'as_offered', 'match på leverandørprodukt, 100 kr afvigelse inden for 2 %', JSON.stringify(by('L2')))
ok(by('L3').match === 'description' && by('L3').actual_qty === 60 && by('L3').status === 'over' && by('L3').cost_deviation === 100, 'beskrivelsesmatch summerer flere faktiske linjer', JSON.stringify(by('L3')))
ok(by('L4').match === 'offer_line' && by('L4').offered_cost === 100 && by('L4').status === 'under', 'eksplicit kobling + leverandørkost som tilbudt kost', JSON.stringify(by('L4')))
ok(by('L5').status === 'not_used' && by('L5').actual_qty === null && by('L5').cost_deviation === -500, 'tilbudt men ikke brugt')
ok(by('M5').status === 'not_offered' && by('M5').cost_deviation === 60, 'faktisk uden tilbudslinje')
ok(res.totals.offered_cost === 4000 + 8000 + 500 + 100 + 500 && res.totals.actual_cost === 4800 + 8100 + 600 + 75 + 60, 'totaler', JSON.stringify(res.totals))

const none = compareOfferToActual([], [], { hours: 0, cost: null })
ok(none.rows.length === 0 && none.totals.deviation === 0, 'tom sag → ingen rækker')
const unplanned = compareOfferToActual([{ id: 'X', description: 'Kabel', quantity: 1, unit: 'm', cost_price: 0 }], [], { hours: 3, cost: null })
ok(unplanned.rows[0].status === 'not_offered' && unplanned.rows[0].actual_qty === 3 && unplanned.rows[1].offered_cost === null, 'timer uden tilbudte timer; linje uden kost')

const missingCost = compareOfferToActual(
  [{ id: 'A', description: 'Kabel', quantity: 1, unit: 'm', cost_price: 100 }],
  [{ id: 'B', description: 'Kabel', quantity: 1, unit: 'm', total_cost: null }],
  { hours: 0, cost: null },
)
const missA = missingCost.rows.find((r) => r.key === 'A')!
ok(missA.match === 'description' && missA.actual_cost == null && missA.cost_deviation == null, 'brugt linje uden kost er ikke en besparelse på 0 kr', JSON.stringify(missA))

const strict = compareOfferToActual(
  [{ id: 'A', description: 'Kabel', quantity: 1, unit: 'm', cost_price: 100 }],
  [{ id: 'B', description: 'Kabel', quantity: 1, unit: 'm', total_cost: 80 }],
  { hours: 0, cost: null },
  { confidentOnly: true },
)
ok(strict.rows.find((r) => r.key === 'A')?.status === 'not_used' && strict.rows.find((r) => r.key === 'B')?.status === 'not_offered', 'confidentOnly matcher ikke ens tekst')
ok(strict.rows.find((r) => r.key === 'B')?.actual_cost === 80, 'ekstra linje beholder sin kost')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle tilbudt-vs-faktisk-tests bestået')
process.exitCode = bad ? 1 : 0
