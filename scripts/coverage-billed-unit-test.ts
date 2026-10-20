/**
 * FC-11 (2026-10-20): dækningstallet bruger den faktisk fakturerede enhedspris (total / antal) og enhedstjek — som
 * kontrollens loader (IV-4). Ren funktion, intet netværk.
 *   npx tsx scripts/coverage-billed-unit-test.ts
 */
import { measureCoverage } from '../src/lib/invoice-control/coverage'

let bad = 0
const ok = (c: boolean, l: string, n = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${n ? `  — ${n}` : ''}`) }
const prod = { id: 'p1', supplier_sku: 'KAB123', ean: null, cost_price: 2.8, unit: 'm' }
const byId = new Map([[prod.id, prod]])
const bySupplier = new Map([['s1', [prod]]])

// 100 m à 4,00 liste, 30 % rabat → total 280 → 2,80/m = kostprisen → ingen afvigelse (før: falsk overpris)
const r1 = measureCoverage([{ id: 'i1', supplier_id: 's1', lines: [{ line_number: 1, description: 'Kabel KAB123', quantity: 100, unit_price: 4, total_price: 280, unit: 'm', supplier_product_id: 'p1', raw_line: null }] }], bySupplier, byId)
ok(r1.deviatingLines === 0 && r1.overchargeAmount === 0, 'rabat-linje: faktureret enhedspris bruges (ingen falsk afvigelse)', `afvig=${r1.deviatingLines} over=${r1.overchargeAmount}`)

// reel overpris: 100 m til 400 → 4,00/m mod 2,80
const r2 = measureCoverage([{ id: 'i2', supplier_id: 's1', lines: [{ line_number: 1, description: 'Kabel KAB123', quantity: 100, unit_price: 4, total_price: 400, unit: 'm', supplier_product_id: 'p1', raw_line: null }] }], bySupplier, byId)
ok(r2.deviatingLines === 1 && r2.overchargeAmount > 0, 'reel overpris fanges stadig', `afvig=${r2.deviatingLines} over=${r2.overchargeAmount}`)

// uden total: listeprisen bruges (bagudkompatibelt)
const r3 = measureCoverage([{ id: 'i3', supplier_id: 's1', lines: [{ line_number: 1, description: 'Kabel KAB123', quantity: 10, unit_price: 2.8, supplier_product_id: 'p1', raw_line: null }] }], bySupplier, byId)
ok(r3.deviatingLines === 0, 'uden total → enhedsprisen', `afvig=${r3.deviatingLines}`)

console.log(`\n${bad === 0 ? '✅ ALLE DÆKNINGS-TESTS PASS' : `❌ ${bad} FEJL`}`)
process.exit(bad === 0 ? 0 : 1)
