/**
 * Unit-tests for leverandørfakturalinje → sagskost (lineSnapshot i src/lib/services/incoming-invoice-conversion.ts).
 *   npx tsx scripts/invoice-line-snapshot-test.ts
 */
import { lineSnapshot } from '../src/lib/services/incoming-invoice-conversion'

let bad = 0
const ok = (c: boolean, label: string, got?: unknown) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${!c && got !== undefined ? '  → ' + JSON.stringify(got) : ''}`) }
const L = (q: number | null, up: number | null, tp: number | null) => ({ description: 'Kabel', quantity: q, unit: 'm', unit_price: up, total_price: tp })

let r = lineSnapshot(L(10, 12.5, 125))
ok(r.quantity === 10 && r.unit_cost === 12.5, 'almindelig linje', r)
r = lineSnapshot(L(-2, 100, -200))
ok(r.quantity === 2 && r.unit_cost === -100, 'retur: negativt antal → antal 2 × −100 (før 1 × 0)', r)
r = lineSnapshot(L(1, -50, -50))
ok(r.quantity === 1 && r.unit_cost === -50, 'rabatlinje: negativ pris → −50', r)
r = lineSnapshot(L(-3, null, -90))
ok(r.quantity === 3 && r.unit_cost === -30, 'retur uden stk-pris → total / antal med fortegn', r)
r = lineSnapshot(L(-2, 100, null))
ok(r.quantity === 2 && r.unit_cost === -100, 'retur uden total → fortegn fra antal × pris', r)
r = lineSnapshot(L(4, null, 200))
ok(r.quantity === 4 && r.unit_cost === 50, 'mangler stk-pris → total / antal', r)
r = lineSnapshot(L(null, null, null))
ok(r.quantity === 1 && r.unit_cost === 0, 'tom linje → 1 × 0', r)
ok(r.quantity * r.unit_cost === 0 && lineSnapshot(L(-2, 100, -200)).quantity > 0, 'antal er altid > 0 (CHECK quantity > 0)')
// LF-3 (2026-10-16): totalen (efter linjerabat) vinder over listeprisen
r = lineSnapshot(L(1, 100, 70))
ok(r.quantity === 1 && r.unit_cost === 70, 'linjerabat: liste 100, total 70 → kost 70 (før 100)', r)
r = lineSnapshot(L(10, 12.5, 100))
ok(r.quantity === 10 && r.unit_cost === 10, 'rabat på flere stk: 10 × liste 12,50, total 100 → 10 pr. stk', r)
r = lineSnapshot(L(-2, 100, -140))
ok(r.quantity === 2 && r.unit_cost === -70, 'retur med rabat: −2 × 100, total −140 → 2 × −70', r)

// IV-5 (2026-10-18): afrunding af stk-kost må ikke ændre totalen
r = lineSnapshot(L(1000, 0.037, 37))
ok(r.quantity === 1 && r.unit_cost === 37 && r.unit === 'parti' && r.description.includes('1000 m'), '1000 × 0,037 = 37 kr → 1 parti à 37 (før 1000 × 0,04 = 40)', r)
r = lineSnapshot(L(3, null, 100))
ok(r.quantity * r.unit_cost === 100, '3 stk for 100 kr → total 100 (før 99,99)', r)
r = lineSnapshot(L(-3000, null, -45))
ok(r.quantity === 1 && r.unit_cost === -45, 'retur 3000 for −45 → 1 parti à −45', r)
r = lineSnapshot(L(10, 12.5, 125))
ok(r.quantity === 10 && r.unit === 'm', 'går totalen op, beholdes antal og enhed', r)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle fakturalinje-tests bestået')
process.exitCode = bad ? 1 : 0
