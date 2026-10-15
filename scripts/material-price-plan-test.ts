/**
 * Unit-test (ingen DB) for GP-8 Kalkia-materialers kostsynk (lib/suppliers/material-price-plan.ts).
 *   npx tsx scripts/material-price-plan-test.ts
 */
import { planMaterialCostUpdates } from '../src/lib/suppliers/material-price-plan'

let bad = 0
const ok = (c: boolean, label: string, note = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
const sp = new Map([['a', { id: 'a', cost_price: 120 }], ['z', { id: 'z', cost_price: 0 }], ['n', { id: 'n', cost_price: null }], ['s', { id: 's', cost_price: '80.00' }]])
const mats = [
  { id: 'm1', supplier_product_id: 'a', cost_price: 100, auto_update_price: true },
  { id: 'm2', supplier_product_id: 'z', cost_price: 90, auto_update_price: true },
  { id: 'm3', supplier_product_id: 'n', cost_price: 90, auto_update_price: true },
  { id: 'm4', supplier_product_id: 's', cost_price: 80, auto_update_price: true },
  { id: 'm5', supplier_product_id: 'a', cost_price: 100, auto_update_price: false },
  { id: 'm6', supplier_product_id: 'x', cost_price: 100, auto_update_price: true },
]
const r = planMaterialCostUpdates(mats, sp, { requireAutoUpdate: true })
ok(r.updates.length === 1 && r.updates[0].id === 'm1' && r.updates[0].cost_price === 120, 'ny kost synkroniseres', JSON.stringify(r.updates))
ok(!r.updates.some((u) => u.id === 'm2' || u.id === 'm3'), 'kost 0/ukendt overskriver aldrig en kendt kost')
ok(!r.updates.some((u) => u.id === 'm4'), 'uændret kost (også som tekst "80.00") springes over')
ok(!r.updates.some((u) => u.id === 'm5'), 'auto-opdatering slået fra respekteres')
ok(r.skipped === 5, 'sprungne tælles', String(r.skipped))
ok(!('sale_price' in (r.updates[0] as object)), 'salgsprisen røres ikke (før: overskrevet med vejl. udsalgspris)')
const all = planMaterialCostUpdates(mats, sp, { requireAutoUpdate: false })
ok(all.updates.map((u) => u.id).sort().join() === 'm1,m5', '"synk alle" uden auto-krav', all.updates.map((u) => u.id).join())
console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ materiale-kostsynk ok')
process.exitCode = bad ? 1 : 0
