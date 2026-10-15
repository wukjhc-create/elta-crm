/**
 * Unit-tests for efterkalkulation på tværs af sager (src/lib/profit/aftercalc-summary.ts). Ingen DB.
 *   npx tsx scripts/aftercalc-summary-test.ts
 */
import { hoursDeviationPct, offeredDb, summarizeAftercalc, type AftercalcRow } from '../src/lib/profit/aftercalc-summary'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

// Tilbud 12.500 inkl. moms (2.500 moms) → salg 10.000; kost 7.000 → DB 3.000 = 30 %
const a = offeredDb({ final_amount: 12500, tax_amount: 2500 }, 7000)
ok(a.offered_sale === 10000 && a.offered_db === 3000 && a.offered_db_pct === 30, 'tilbudt DB ekskl. moms', JSON.stringify(a))
ok(offeredDb({ final_amount: '12500', tax_amount: '2500' }, 7000).offered_db === 3000, 'tal som tekst (PostgREST numeric)')
ok(offeredDb(null, 7000).offered_db === null, 'uden tilbud → null')
const noCost = offeredDb({ final_amount: 12500, tax_amount: 2500 }, null)
ok(noCost.offered_sale === 10000 && noCost.offered_db === null, 'uden tilbudt kost → salg men ingen DB')
ok(offeredDb({ final_amount: 0, tax_amount: 0 }, 100).offered_db_pct === null, 'salg 0 → ingen division med 0')

ok(hoursDeviationPct(10, 12) === 20 && hoursDeviationPct(10, 8) === -20, 'timeafvigelse ±')
ok(hoursDeviationPct(null, 5) === null && hoursDeviationPct(0, 5) === null, 'uden estimat → null')

const row = (o: Partial<AftercalcRow>): AftercalcRow => ({ status: 'closed', estimated_hours: null, actual_hours: 0, offered_db_pct: null, realized_db_pct: null, cost_deviation: null, ...o })
const s = summarizeAftercalc([
  row({ estimated_hours: 10, actual_hours: 12, offered_db_pct: 30, realized_db_pct: 22, cost_deviation: 500 }),
  row({ estimated_hours: 20, actual_hours: 18, offered_db_pct: 25, realized_db_pct: 27 }),
  // åben sag: tæller i tællere, men ikke i gennemsnit
  row({ status: 'in_progress', estimated_hours: 10, actual_hours: 30, offered_db_pct: 30, realized_db_pct: 5, cost_deviation: 100 }),
  row({ estimated_hours: null, actual_hours: 4 }),
], 20)
ok(s.cases === 4, 'antal sager')
ok(s.hours_basis === 2 && s.avg_hours_deviation_pct === 5, 'gns. timeafvigelse kun lukkede med estimat ((20 − 10)/2)', JSON.stringify(s))
ok(s.over_hours === 2, 'over estimat >10 % (inkl. åben sag)')
ok(s.db_basis === 2 && s.avg_db_deviation_pp === -3, 'gns. DB-afvigelse pp kun lukkede ((−8 + 2)/2)')
ok(s.low_db === 1 && s.over_cost === 2, 'under minimum-DB 20 % / over tilbudt kost')
const e = summarizeAftercalc([], 20)
ok(e.avg_hours_deviation_pct === null && e.avg_db_deviation_pp === null && e.cases === 0, 'tom liste')

console.log(bad ? `\n${bad} FEJL` : '\nalle bestået')
process.exitCode = bad ? 1 : 0
