/**
 * Unit-test (ingen DB) for PE-7 fælles DB-tærskler (lib/profit/db-thresholds.ts).
 *   npx tsx scripts/db-thresholds-test.ts
 */
import { resolveDbThresholds, dbLevel, dbRisk, DEFAULT_DB_THRESHOLDS } from '../src/lib/profit/db-thresholds'

let bad = 0
const ok = (c: boolean, label: string, note = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }

// Prod 2026-10-14 (prod-db-thresholds.ts): kun minimum_db=20 og default_db_target=35 er sat
const prod = resolveDbThresholds([
  { setting_key: 'default_db_target', setting_value: { label: 'Mål-DB', percentage: 35 } },
  { setting_key: 'minimum_db', setting_value: { label: 'Minimum DB', percentage: 20 } },
])
ok(prod.red === 10 && prod.yellow === 20 && prod.green === 35 && prod.minimum === 20 && prod.target === 35, 'prod-indstillinger giver de hidtidige værdier (10/20/35)', JSON.stringify(prod))
ok(JSON.stringify(resolveDbThresholds([])) === JSON.stringify(DEFAULT_DB_THRESHOLDS), 'ingen rækker → standarder')
{
  const t = resolveDbThresholds([{ setting_key: 'db_red_threshold', setting_value: { percentage: 12 } }, { setting_key: 'db_green_threshold', setting_value: { percentage: 30 } }])
  ok(t.red === 12 && t.green === 30, 'indstillede trafiklys-grænser bruges')
}
{
  const t = resolveDbThresholds([{ setting_key: 'db_red_threshold', setting_value: { percentage: '12' } }, { setting_key: 'db_red_threshold', setting_value: null }, { setting_key: 'ukendt', setting_value: { percentage: 1 } }])
  ok(t.red === 10, 'ugyldige værdier og ukendte nøgler ignoreres')
}
ok(dbLevel(9.99, prod) === 'red' && dbLevel(10, prod) === 'yellow' && dbLevel(34.9, prod) === 'yellow' && dbLevel(35, prod) === 'green', 'farveniveau: < rød = rød, < grøn = gul, ellers grøn')
ok(dbRisk(9, prod) === 'high' && dbRisk(15, prod) === 'medium' && dbRisk(20, prod) === 'low', 'AI-risiko: samme 10/20 som før')
ok(dbLevel(-5, prod) === 'red', 'negativ DB er rød')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ DB-tærskler ok')
process.exitCode = bad ? 1 : 0
