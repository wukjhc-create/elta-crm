/**
 * Prishistorik siger datoen på den senest lagrede række. Tom liste opfinder ingen pris.
 *   npx tsx scripts/materials-latest-stored-date-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { latestStoredHistoryDate } from '../src/lib/materials/latest-stored-history-date'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(latestStoredHistoryDate([]) === null, 'tom liste har ingen dato')
ok(latestStoredHistoryDate([{ effective_from: null }]) === null, 'manglende dato er ingen dato')
ok(latestStoredHistoryDate([{ effective_from: 'ikke-en-dato' }]) === null, 'ugyldig dato springes over')
ok(latestStoredHistoryDate([{ effective_from: '2026-03-15T12:00:00Z' }]) === '15.3.2026', 'lagret dato')
ok(latestStoredHistoryDate([{ effective_from: '2026-06-02T22:30:00Z' }]) === '3.6.2026', 'dansk dato over midnat')
const mixed = latestStoredHistoryDate([
  { effective_from: '2026-01-02T00:00:00Z' },
  { effective_from: '2026-03-15T12:00:00Z' },
])
ok(mixed === '15.3.2026', 'seneste lagrede dato vinder')
ok(latestStoredHistoryDate([{ effective_from: '2026-03-15T12:00:00Z' }, { effective_from: '2026-01-02T00:00:00Z' }]) === '15.3.2026', 'rækkefølgen er ligegyldig')
ok(mixed !== null && !mixed.includes('kr'), 'datoen er ikke en pris')

const helper = readFileSync(join('src', 'lib', 'materials', 'latest-stored-history-date.ts'), 'utf8')
ok(!helper.includes('formatCurrency') && !helper.includes('cost_price') && !helper.includes('sale_price'), 'hjælperen læser ikke priser')

const view = readFileSync(join('src', 'app', 'dashboard', 'settings', 'kalkia', 'materials', 'materials-catalog-client.tsx'), 'utf8')
ok(view.includes('latestStoredHistoryDate(priceHistory)'), 'kataloget kalder datoen')
ok(view.includes('data-testid="materials-latest-stored-date"'), 'datoen kan findes')
ok(view.includes('Senest lagret {latestStoredDate}'), 'teksten er senest lagret')
const emptyStart = view.indexOf('priceHistory.length === 0 ? (')
const elseStart = view.indexOf(') : (', emptyStart)
const emptyBranch = emptyStart >= 0 && elseStart > emptyStart ? view.slice(emptyStart, elseStart) : ''
ok(emptyBranch.includes('Ingen prisændringer registreret'), 'tom liste er uændret')
ok(!emptyBranch.includes('materials-latest-stored-date'), 'tom liste siger ikke en dato')
ok(view.includes('formatCurrency(history.cost_price'), 'lagret kost vises stadig')
ok(view.includes('formatCurrency(history.sale_price'), 'lagret salgspris vises stadig')
ok(!view.includes('nuværende pris') && !view.includes('dagens pris'), 'ingen opfundet nutidspris')

const action = readFileSync(join('src', 'lib', 'actions', 'component-intelligence.ts'), 'utf8')
ok(action.includes(".order('effective_from', { ascending: false })"), 'hentningen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  materials-latest-stored-date-test')
