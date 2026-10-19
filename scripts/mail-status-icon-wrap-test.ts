/**
 * Statusikonet i mail-detaljen kan krympe. Statusteksten bliver.
 *   npx tsx scripts/mail-status-icon-wrap-test.ts
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
const id = 'data-testid="mail-status-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 50, at + 10) : ''
const bare = '<Icon className="w-3 h-3" />'
const cell = '<Icon className="w-3 h-3 break-words min-w-0" data-testid="mail-status-icon" />'
ok(row.includes('<Icon'), 'det er ikonet')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('c.label'), 'teksten er et andet sted')
ok(!row.includes('rounded-full'), 'maerket er et andet sted')
ok(!row.includes('w-5'), 'filikonet er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.includes('{c.label}'), 'statusteksten bliver')
ok(view.includes('data-testid="mail-unlink-x"'), 'fjern-ikonet bliver')
ok(view.includes('data-testid="mail-pending-dl-icon"'), 'download-ikonet bliver')
ok(view.includes('<Icon className="w-5 h-5 text-gray-400 group-hover:text-blue-500 shrink-0" />'), 'filikonet bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-status-icon-wrap-test')
