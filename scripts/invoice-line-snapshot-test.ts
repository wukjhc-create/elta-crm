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

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle fakturalinje-tests bestået')
process.exitCode = bad ? 1 : 0
