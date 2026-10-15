/**
 * Unit-tests for manglende satser (src/lib/employees/rate-gaps.ts, 00230). Ingen DB.
 *   npx tsx scripts/rate-gaps-test.ts
 */
import { employeeRateGap, rateGapText } from '../src/lib/employees/rate-gaps'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }

ok(JSON.stringify(employeeRateGap({ hourly_rate: 495, cost_rate: 300, real_hourly_cost: null }, 'real_hourly_cost', null)) === '{"missingSale":false,"missingCost":false}', 'alt sat')
ok(employeeRateGap({ hourly_rate: null, cost_rate: null, real_hourly_cost: null }, null, null).missingSale && employeeRateGap({ hourly_rate: null, cost_rate: null, real_hourly_cost: null }, null, null).missingCost, 'intet sat → begge mangler')
ok(!employeeRateGap({ hourly_rate: 500, cost_rate: null, real_hourly_cost: '280.5' }, 'real_hourly_cost', null).missingCost, 'real kost dækker kost')
ok(!employeeRateGap({ hourly_rate: 500, cost_rate: null, real_hourly_cost: null }, 'fixed_standard_rate', 350).missingCost, 'fast firmasats dækker kost')
ok(employeeRateGap({ hourly_rate: 500, cost_rate: null, real_hourly_cost: null }, 'internal_cost_rate', 350).missingCost, 'fast sats tæller ikke ved anden basis')
ok(!employeeRateGap({ hourly_rate: 0, cost_rate: 0, real_hourly_cost: null }, null, null).missingSale, 'eksplicit 0 er en sats (ikke manglende)')
ok(rateGapText({ missingSale: true, missingCost: true }) === 'Mangler timepris og kostpris' && rateGapText({ missingSale: false, missingCost: false }) === null, 'tekster')

console.log(bad ? `\n${bad} FEJL` : '\nalle bestået')
process.exitCode = bad ? 1 : 0
