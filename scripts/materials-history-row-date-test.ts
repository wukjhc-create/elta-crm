/**
 * Hver prishistorik-række viser effective_from i dansk tid. Beløbene er uændret.
 *   npx tsx scripts/materials-history-row-date-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { latestStoredHistoryDate, storedHistoryDate } from '../src/lib/materials/latest-stored-history-date'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(storedHistoryDate(null) === null, 'null er ingen dato')
ok(storedHistoryDate(undefined) === null, 'udefineret er ingen dato')
ok(storedHistoryDate('ikke-en-dato') === null, 'ugyldig dato springes over')
ok(storedHistoryDate('2026-03-15T12:00:00Z') === '15.3.2026', 'middag er samme dag')
ok(storedHistoryDate('2026-06-02T22:30:00Z') === '3.6.2026', 'dansk dato over UTC-midnat')
ok(latestStoredHistoryDate([{ effective_from: '2026-06-02T22:30:00Z' }]) === storedHistoryDate('2026-06-02T22:30:00Z'), 'seneste række bruger samme dato')

const view = readFileSync(join('src', 'app', 'dashboard', 'settings', 'kalkia', 'materials', 'materials-catalog-client.tsx'), 'utf8')
ok(view.includes('storedHistoryDate(history.effective_from)'), 'rækken kalder den danske dato')
ok(view.includes('data-testid="materials-history-date"'), 'rækkedatoen kan findes')
ok(!view.includes("toLocaleDateString('da-DK')"), 'rækken bruger ikke lokal tid uden zone')
ok(view.includes("formatCurrency(history.cost_price, 'DKK', 2)"), 'kostbeløbet er uændret')
ok(view.includes("formatCurrency(history.sale_price, 'DKK', 2)"), 'salgsbeløbet er uændret')
ok(view.includes('Ingen prisændringer registreret'), 'tom liste er uændret')

const helper = readFileSync(join('src', 'lib', 'materials', 'latest-stored-history-date.ts'), 'utf8')
ok(helper.includes("timeZone: 'Europe/Copenhagen'"), 'datoen er København')
ok(!helper.includes('formatCurrency') && !helper.includes('cost_price'), 'hjælperen læser ikke priser')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  materials-history-row-date-test')
