/**
 * Fakturalistens side kan krympe. Sidehoved og lister bliver.
 *   npx tsx scripts/incoming-invoice-page-shell-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/incoming-invoices/list-client.tsx', 'utf8')
const wrapped = '<div className="p-4 md:p-6 space-y-4 break-words min-w-0">'
const bare = '<div className="p-4 md:p-6 space-y-4">'
const actions = '<div className="flex items-start justify-between flex-wrap gap-2 break-words min-w-0">'
const shellAt = view.indexOf(wrapped)
const actionsAt = view.indexOf(actions)
ok(view.split(wrapped).length === 2, 'siden kan krympe')
ok(shellAt >= 0 && actionsAt >= 0 && shellAt < actionsAt, 'siden staar over handlingsraekken')
ok(view.split(bare).length === 1, 'den bare side er vaek')
ok(!view.includes(bare), 'den bare side er vaek')
ok(view.includes('<h1 className="text-2xl font-semibold break-words min-w-0">Indgående fakturaer</h1>'), 'overskriften bliver')
ok(view.includes('data-testid="incoming-invoices-mobile-list"'), 'mobilisten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-page-shell-wrap-test')
