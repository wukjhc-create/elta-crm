/**
 * Statusmaerket i mail-detaljen kan krympe. Statusteksten bliver.
 *   npx tsx scripts/mail-status-badge-wrap-test.ts
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
const id = 'data-testid="mail-status-badge"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 130, at + 10) : ''
const bare = '<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.cls}`}>'
const cell = '<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium break-words min-w-0 ${c.cls}`} data-testid="mail-status-badge">'
ok(row.includes('<span'), 'det er maerket')
ok(row.includes('break-words min-w-0'), 'maerket kan krympe')
ok(!row.includes('c.label'), 'teksten er et andet sted')
ok(!row.includes('mail-status-icon'), 'ikonet er et andet sted')
ok(!row.includes('mail-unread'), 'ulaest er et andet sted')
ok(view.split(id).length === 2, 'maerket findes en gang')
ok(view.split(cell).length === 2, 'maerkeklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare maerke er vaek')
ok(view.includes('{c.label}'), 'statusteksten bliver')
ok(view.includes('data-testid="mail-status-icon"'), 'statusikonet bliver')
ok(view.includes('data-testid="mail-unread-badge"'), 'ulaest bliver')
ok(view.includes('data-testid="mail-body-scroll"'), 'rullefeltet bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-status-badge-wrap-test')
