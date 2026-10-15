/**
 * Unit-tests for DB pr. kunde / pr. måned (src/lib/profit/profitability-groups.ts). Ingen DB.
 *   npx tsx scripts/profitability-groups-test.ts
 */
import { monthKeyCph, profitByClosedMonth, profitByCustomer, type GroupInputRow } from '../src/lib/profit/profitability-groups'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }
const row = (o: Partial<GroupInputRow>): GroupInputRow => ({ customer_id: 'k1', customer_name: 'Kunde 1', status: 'closed', closed_at: '2026-09-15T10:00:00Z', net_invoiced: 0, realized_db: null, ...o })

const rows = [
  row({ net_invoiced: 10000, realized_db: 3000 }),
  row({ net_invoiced: 5000, realized_db: -500, closed_at: '2026-10-02T09:00:00Z' }),
  row({ customer_id: 'k2', customer_name: 'Kunde 2', net_invoiced: 20000, realized_db: 8000 }),
  row({ customer_id: 'k2', customer_name: 'Kunde 2', status: 'in_progress', closed_at: null, net_invoiced: 0, realized_db: null }),
  // lukket 30/9 kl. 23:30 dansk tid = 21:30 UTC → september
  row({ customer_id: 'k3', customer_name: 'Kunde 3', closed_at: '2026-09-30T21:30:00Z', net_invoiced: 1000, realized_db: 100 }),
  // lukket 31/10 kl. 23:30 UTC = 1/11 dansk tid → november
  row({ customer_id: 'k3', customer_name: 'Kunde 3', closed_at: '2026-10-31T23:30:00Z', net_invoiced: 1000, realized_db: 200 }),
]
const c = profitByCustomer(rows)
ok(c.length === 3 && c[0].key === 'k2' && c[0].realized_db === 8000 && c[0].cases === 1, 'pr. kunde: kun fakturerede sager, største DB først', JSON.stringify(c.map((g) => [g.key, g.cases, g.realized_db])))
const k1 = c.find((g) => g.key === 'k1')
ok(!!k1 && k1.net_invoiced === 15000 && k1.realized_db === 2500 && k1.realized_db_pct === 16.7, 'kunde 1: 2.500 / 15.000 = 16,7 %', JSON.stringify(k1))

ok(monthKeyCph('2026-09-30T21:30:00Z') === '2026-09' && monthKeyCph('2026-10-31T23:30:00Z') === '2026-11', 'måned i dansk tid (ikke UTC)')
const m = profitByClosedMonth(rows)
ok(m.map((g) => g.key).join(',') === '2026-11,2026-10,2026-09', 'måneder nyeste først', m.map((g) => g.key).join(','))
const sep = m.find((g) => g.key === '2026-09')
ok(!!sep && sep.cases === 3 && sep.realized_db === 11100 && sep.label === 'sep 2026', 'september: 3 lukkede sager', JSON.stringify(sep))
ok(profitByClosedMonth([row({ status: 'in_progress', realized_db: 5 })]).length === 0, 'åbne sager tæller ikke i måned')
ok(profitByCustomer([]).length === 0, 'tom liste')

console.log(bad ? `\n${bad} FEJL` : '\nalle bestået')
process.exitCode = bad ? 1 : 0
