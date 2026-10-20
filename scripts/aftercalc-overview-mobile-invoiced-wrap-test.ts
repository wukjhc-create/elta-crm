/**
 * Faktureringstilstanden paa efterkalkulationens mobilkort kan krympe. Tekst og filtre bliver.
 *   npx tsx scripts/aftercalc-overview-mobile-invoiced-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const view = readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const id = 'data-testid="aftercalc-invoiced-state"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 57, at + 10) : ''
const bare = 'className="text-xs text-gray-600 break-words"'
const cell = 'className="text-xs text-gray-600 break-words min-w-0" data-testid="aftercalc-invoiced-state"'
const desktop = 'className="text-[11px] text-gray-500 break-words min-w-0" data-testid="aftercalc-invoiced-state"'
ok(row.startsWith('<p'), 'det er mobilkortets faktureringstilstand')
ok(row.includes('break-words min-w-0'), 'faktureringstilstanden kan krympe')
ok(row.includes('text-xs text-gray-600'), 'tekstklassen bliver')
ok(!row.includes('invoicedStateLabel'), 'teksten er et andet sted')
ok(!row.includes('kr('), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(cell).length === 2, 'mobilklassen findes en gang')
ok(view.split(id).length === 3, 'statussen findes paa kort og i tabel')
ok(view.split(desktop).length === 2, 'skrivebordsraekken kan krympe')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok((view.match(/invoicedStateLabel\(r\.invoiced_state\)/g) ?? []).length === 2, 'teksten bruges to steder')
ok(view.includes('<p className="text-xs text-gray-600 break-words min-w-0" data-testid="aftercalc-variance-filter">'), 'afvigelsesfilteret kan krympe')
ok(view.split('tabular-nums text-gray-900 break-words').length - 1 === 4, 'mobilens fire beloeb bliver')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt omsaetning bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
const warn = 'data-testid="aftercalc-mobile-warning"'
const wat = view.indexOf(warn)
const wrow = wat >= 0 ? view.slice(wat - 63, wat + 10) : ''
ok(wrow.startsWith('<p'), 'advarslens vindue bliver')
ok(wrow.includes('break-words min-w-0'), 'advarslen kan stadig krympe')
ok(!wrow.includes(id), 'advarslen er ikke faktureringstilstanden')
ok(!wrow.includes('\n'), 'advarslens vindue har ikke linjeskift')
const status = 'data-testid="aftercalc-mobile-status"'
const sat = view.indexOf(status)
const srow = sat >= 0 ? view.slice(sat - 80, sat + 140) : ''
ok(srow.includes('break-words min-w-0'), 'sagsstatus kan stadig krympe')
ok(srow.includes('SERVICE_CASE_STATUS_LABELS[r.status as ServiceCaseStatus] ?? r.status'), 'sagsordene bliver')
ok(!srow.includes(id), 'sagsstatus er ikke faktureringstilstanden')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-mobile-invoiced-wrap-test')
