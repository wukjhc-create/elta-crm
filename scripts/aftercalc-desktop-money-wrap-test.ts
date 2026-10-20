/**
 * Skrivebordets tilbudt og faktisk beløb ombrydes. kr() og pct() er uændret.
 *   npx tsx scripts/aftercalc-desktop-money-wrap-test.ts
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
const mobile = view.slice(view.indexOf('data-testid="aftercalc-overview-mobile"'), deskStart)

const cell = (call: string) => {
  const at = desk.indexOf(call)
  return at >= 0 ? desk.slice(at - 90, at) : ''
}

for (const call of ['{kr(r.quoted_revenue)}', '{kr(r.actual_revenue)}', '{pct(r.quoted_db_pct)}', '{pct(r.actual_db_pct)}']) {
  const near = cell(call)
  ok(near.includes('break-words min-w-0'), `${call} ombrydes`)
  ok(desk.includes(call), `${call} bliver`)
}
ok(mobile.split('tabular-nums text-gray-900 break-words').length - 1 === 4, 'mobilens fire beløb er uændret')
ok(mobile.includes('<dd className="tabular-nums text-gray-900 break-words min-w-0">{kr(r.quoted_revenue)}</dd>'), 'tilbudt mobilbeloeb kan krympe')
ok(mobile.includes('<dd className="tabular-nums text-gray-900 break-words">{kr(r.actual_revenue)}</dd>'), 'faktisk mobilbeloeb bliver')
ok(mobile.includes('<dd className="tabular-nums text-gray-900 break-words">{pct(r.quoted_db_pct)}</dd>'), 'tilbudt db bliver')
ok(mobile.includes('<dd className="tabular-nums text-gray-900 break-words">{pct(r.actual_db_pct)}</dd>'), 'faktisk db bliver')
ok(desk.includes('varianceText(r.db_variance, r.db_variance_pct_points)'), 'afvigelsesteksten bliver')
ok(!desk.includes(' truncate') && !desk.includes('truncate '), 'beløbene klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-desktop-money-wrap-test')
