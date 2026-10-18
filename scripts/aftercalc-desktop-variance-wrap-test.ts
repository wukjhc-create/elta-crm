/**
 * Skrivebordets DB-afvigelse ombrydes. varianceText er uændret.
 *   npx tsx scripts/aftercalc-desktop-variance-wrap-test.ts
 */
import { readFileSync } from 'node:fs'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const deskStart = view.indexOf('hidden md:block overflow-x-auto')
const deskEnd = view.indexOf('data-testid="aftercalc-view-count"')
const desk = deskStart >= 0 && deskEnd > deskStart ? view.slice(deskStart, deskEnd) : ''
const at = desk.indexOf('varianceText(r.db_variance, r.db_variance_pct_points)')
const row = at >= 0 ? desk.slice(at - 280, at + 60) : ''
ok(row.includes('break-words min-w-0'), 'afvigelsen ombrydes')
ok(row.includes('text-gray-400'), 'ukendt afvigelse er stadig grå')
ok(row.includes('text-red-700'), 'negativ afvigelse er stadig rød')
ok(row.includes('text-emerald-700'), 'positiv afvigelse er stadig grøn')
ok(row.includes('{varianceText(r.db_variance, r.db_variance_pct_points)}'), 'teksten er uændret')
ok(view.includes("if (amount == null) return 'Kan ikke beregnes'"), 'manglende afvigelse siger stadig hvorfor')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'afvigelsen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-desktop-variance-wrap-test')
