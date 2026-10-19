/**
 * Mailbroedtekstens rullefelt kan krympe. Indholdet bliver.
 *   npx tsx scripts/mail-body-scroll-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')
const id = 'data-testid="mail-body-scroll"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 70, at + 10) : ''
const bare = '<div className="flex-1 overflow-y-auto p-5">'
const cell = '<div className="flex-1 overflow-y-auto p-5 break-words min-w-0" data-testid="mail-body-scroll">'
ok(row.includes('<div'), 'det er rullefeltet')
ok(row.includes('break-words min-w-0'), 'rullefeltet kan krympe')
ok(!row.includes('mail-inquiry'), 'kortet er et andet sted')
ok(!row.includes('mail-body-html'), 'html er et andet sted')
ok(!row.includes('WebInquiry'), 'henvendelsen er et andet sted')
ok(view.split(id).length === 2, 'rullefeltet findes en gang')
ok(view.split(cell).length === 2, 'rulleklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare rullefelt er vaek')
ok(view.includes('data-testid="mail-inquiry-frame"'), 'kortet bliver')
ok(view.includes('data-testid="mail-body-html"'), 'html bliver')
ok(view.includes('data-testid="mail-body-plain"'), 'teksten bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-status-icon"'), 'statusikonet bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-body-scroll-wrap-test')
