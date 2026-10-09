/**
 * Sagsrentabilitetens kosttal. Ingen DB.
 *   npx tsx scripts/profitability-figures-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareOfferToActual } from '../src/lib/cases/offer-vs-actual'
import { compareByAbsDeviation, profitabilityFigures, sumLabourCost } from '../src/lib/cases/profitability-figures'
import { computeRealizedDb } from '../src/lib/cases/realized-db'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

// U88: tilbudt 5.000, faktisk 660, afvigelse −4.340. Timer uden registrering er ikke et hul.
const u88 = compareOfferToActual(
  [
    { id: 'L', description: 'Montage', quantity: 10, unit: 'timer', cost_price: 400 },
    { id: 'K', description: 'RP kabel', quantity: 50, unit: 'm', cost_price: 10 },
    { id: 'T', description: 'RP tavle', quantity: 1, unit: 'stk', cost_price: 500 },
  ],
  [
    { id: 'm1', description: 'rp kabel', quantity: 60, unit: 'm', total_cost: 600 },
    { id: 'm2', description: 'RP ekstra', quantity: 2, unit: 'stk', total_cost: 60 },
  ],
  { hours: 0, cost: null },
)
const u88f = profitabilityFigures(u88.rows, [])
ok(u88f.offered_cost === 5000 && u88f.actual_cost === 660 && u88f.cost_deviation === -4340 && u88f.db_cost === 660, 'komplet sag beholder 4.340 kr afvigelse', JSON.stringify(u88f))

// Brugt linje uden kost. Totalen sætter den til 0. Rapporten gør ikke.
const hole = compareOfferToActual(
  [
    { id: 'A', description: 'Kabel', quantity: 1, unit: 'm', cost_price: 100 },
    { id: 'B', description: 'Tavle', quantity: 1, unit: 'stk', cost_price: 500 },
  ],
  [
    { id: 'a', description: 'Kabel', quantity: 1, unit: 'm', total_cost: 100, source_offer_line_id: 'A' },
    { id: 'b', description: 'Tavle', quantity: 1, unit: 'stk', total_cost: null, source_offer_line_id: 'B' },
  ],
  { hours: 0, cost: null },
)
const holef = profitabilityFigures(hole.rows, [])
ok(holef.actual_cost == null && holef.cost_deviation == null && holef.db_cost == null, 'manglende faktisk kost er ikke 0')
ok(hole.totals.actual_cost != null && hole.totals.actual_cost !== holef.actual_cost, 'rapporten bruger ikke totalen der sætter manglende kost til 0', String(hole.totals.actual_cost))

ok(sumLabourCost([400, null]) == null && sumLabourCost([400, 0]) === 400 && sumLabourCost([]) === 0, 'én time uden kost gør lønkosten ukendt, gemt 0 bliver stående')
const labour = compareOfferToActual(
  [{ id: 'L', description: 'Montage', quantity: 2, unit: 'timer', cost_price: 400 }],
  [],
  { hours: 2, cost: sumLabourCost([400, null]) },
)
const labourf = profitabilityFigures(labour.rows, [])
ok(labourf.actual_cost == null && labourf.db_cost == null && labourf.offered_cost === 800, 'delvis lønkost tilbageholder faktisk kost og DB')

const known = compareOfferToActual(
  [],
  [{ id: 'm', description: 'Kabel', quantity: 1, unit: 'stk', total_cost: 100 }],
  { hours: 0, cost: null },
)
const otherMissing = profitabilityFigures(known.rows, [null])
ok(otherMissing.actual_cost === 100 && otherMissing.db_cost == null, 'øvrig uden kost tilbageholder kun DB')
const otherKnown = profitabilityFigures(known.rows, [-20])
ok(otherKnown.db_cost === 80 && otherKnown.actual_cost === 100, 'kendt øvrig kost indgår i DB, ikke i den viste faktiske kost')

// U91: materiale 600, faktura 1.000, kreditnota 200, kladde 5.000 → DB 200
const u91 = compareOfferToActual(
  [],
  [{ id: 'm', description: 'RDB kabel', quantity: 1, unit: 'stk', total_cost: 600 }],
  { hours: 0, cost: null },
)
const u91f = profitabilityFigures(u91.rows, [])
const u91db = computeRealizedDb([
  { total_amount: 1000, status: 'sent', invoice_type: 'standard', voided_at: null },
  { total_amount: 200, status: 'sent', invoice_type: 'credit', voided_at: null },
  { total_amount: 5000, status: 'draft', invoice_type: 'standard', voided_at: null },
], u91f.db_cost ?? 0, false)
const shown = u91f.db_cost != null && u91db.issued_invoice_count > 0 ? u91db.realized_db : null
ok(u91f.db_cost === 600 && u91db.net_invoiced_ex_vat === 800 && shown === 200, 'U91 realiseret DB er 200 når kosten er kendt', String(shown))

const sorted = [null, -500, 10, null].sort(compareByAbsDeviation)
ok(sorted[0] === -500 && sorted[1] === 10 && sorted[2] == null && sorted[3] == null, 'ukendt afvigelse sorteres sidst')

const action = readFileSync(join(process.cwd(), 'src/lib/actions/reports.ts'), 'utf8')
const start = action.indexOf('export async function getProjectProfitability')
const body = action.slice(start, action.indexOf('export async function getTeamProductivity'))
ok(body.includes('sumLabourCost(') && body.includes('profitabilityFigures('), 'rapporten kalder de rene kosttal')
ok(body.includes("supabase.from('invoices').select('id, case_id, total_amount, status, invoice_type, voided_at').in('case_id', caseIds).order('id').range(from, to)"), 'fakturaer hentes side for side')
ok(body.includes("supabase.from('case_other_costs').select('id, case_id, total_cost').in('case_id', caseIds).order('id').range(from, to)"), 'øvrige hentes side for side')
ok(body.indexOf("hasPermission('economy.view')") >= 0 && body.indexOf('createAdminClient()') > body.indexOf("hasPermission('economy.view')"), 'kost læses efter economy.view')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle sagsrentabilitetstests bestået')
process.exitCode = bad ? 1 : 0
