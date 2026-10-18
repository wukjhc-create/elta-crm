/**
 * Skrivebordets sagsstatus ombrydes. Statusordene er uændret.
 *   npx tsx scripts/aftercalc-desktop-status-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { SERVICE_CASE_STATUS_LABELS } from '../src/types/service-cases.types'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(SERVICE_CASE_STATUS_LABELS.converted === 'Konverteret til Ordre', 'konverteret bliver')
ok(SERVICE_CASE_STATUS_LABELS.closed === 'Lukket', 'lukket bliver')

const view = readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const tableStart = view.indexOf('hidden md:block overflow-x-auto')
const desk = tableStart >= 0 ? view.slice(tableStart) : ''
const at = desk.indexOf('SERVICE_CASE_STATUS_LABELS[r.status as ServiceCaseStatus] ?? r.status')
const row = at >= 0 ? desk.slice(at - 80, at + 220) : ''
ok(row.includes('text-gray-700 break-words min-w-0'), 'status ombrydes')
ok(row.includes('SERVICE_CASE_STATUS_LABELS[r.status as ServiceCaseStatus] ?? r.status'), 'tabellen bruger de samme ord')
ok(row.includes('data-testid="aftercalc-invoiced-state"'), 'faktureringsstatus bliver')
ok(row.includes('invoicedStateLabel(r.invoiced_state)'), 'faktureringsordet er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'status klippes ikke')

const mobile = view.slice(view.indexOf('data-testid="aftercalc-overview-mobile"'), tableStart)
ok(mobile.includes('data-testid="aftercalc-mobile-status"'), 'kortets status bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-desktop-status-wrap-test')
