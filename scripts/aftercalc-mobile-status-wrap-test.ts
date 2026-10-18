/**
 * Mobilstatus på efterkalk-kortet ombrydes. Statusordene er uændret.
 *   npx tsx scripts/aftercalc-mobile-status-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { SERVICE_CASE_STATUS_LABELS } from '../src/types/service-cases.types'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(SERVICE_CASE_STATUS_LABELS.new === 'Ny', 'ny bliver')
ok(SERVICE_CASE_STATUS_LABELS.in_progress === 'I gang', 'i gang bliver')
ok(SERVICE_CASE_STATUS_LABELS.pending === 'Afventer', 'afventer bliver')
ok(SERVICE_CASE_STATUS_LABELS.closed === 'Lukket', 'lukket bliver')
ok(SERVICE_CASE_STATUS_LABELS.converted === 'Konverteret til Ordre', 'konverteret bliver')

const view = readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const mobileStart = view.indexOf('data-testid="aftercalc-overview-mobile"')
const tableStart = view.indexOf('hidden md:block overflow-x-auto')
const mobile = mobileStart >= 0 && tableStart > mobileStart ? view.slice(mobileStart, tableStart) : ''
const at = mobile.indexOf('data-testid="aftercalc-mobile-status"')
const row = at >= 0 ? mobile.slice(at - 80, at + 140) : ''
ok(row.includes('break-words min-w-0'), 'status ombrydes')
ok(row.includes('SERVICE_CASE_STATUS_LABELS[r.status as ServiceCaseStatus] ?? r.status'), 'kortet bruger de samme ord')
ok(mobile.includes('data-testid="aftercalc-invoiced-state"'), 'faktureringsstatus bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'status klippes ikke')

const desk = tableStart >= 0 ? view.slice(tableStart) : ''
ok(desk.includes('SERVICE_CASE_STATUS_LABELS[r.status as ServiceCaseStatus] ?? r.status'), 'tabellen bruger de samme ord')
ok(!desk.slice(0, desk.indexOf('data-testid="aftercalc-invoiced-state"')).includes('data-testid="aftercalc-mobile-status"'), 'testid ligger kun på kortet')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-mobile-status-wrap-test')
