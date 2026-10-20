/**
 * Afsendernavnet i revisionsloggen kan krympe.
 * Navnet er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-audit-actor-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
const wrapped = '<span className="text-gray-500 break-words min-w-0">· {a.actor_name}</span>'
const bare = '<span className="text-gray-500">· {a.actor_name}</span>'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'afsenderen kan krympe')
ok(after.includes('· {a.actor_name}'), 'navnet bliver')
ok(view.split(bare).length === 1, 'den bare afsender er vaek')
ok(!view.includes(bare), 'den bare afsender er vaek')
ok(view.includes('<p className="text-xs text-gray-400 break-words min-w-0">Ingen log-poster endnu. De vises her, når fakturaen ændres.</p>'), 'tom historik bliver')
ok(view.includes('<span className="text-gray-500 shrink-0 break-words min-w-0">{fmtDate(a.created_at)} {a.created_at.slice(11, 19)}</span>'), 'tidspunktet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-audit-actor-wrap-test')
