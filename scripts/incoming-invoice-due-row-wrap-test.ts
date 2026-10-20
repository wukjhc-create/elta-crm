/**
 * Forfaldsfilterets raekke paa fakturalisten kan krympe. Knapperne bliver.
 *   npx tsx scripts/incoming-invoice-due-row-wrap-test.ts
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
const id = '<div className="flex flex-wrap items-center gap-2 break-words min-w-0">'
const bare = '<div className="flex flex-wrap items-center gap-2">'
const label = '<span className="text-xs text-gray-500 break-words min-w-0">Forfald:</span>'
const at = view.indexOf(id)
const labelAt = at >= 0 ? view.indexOf(label, at) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && labelAt >= at ? view.slice(at, labelAt + label.length) : ''
ok(row.startsWith('<div'), 'det er en raekke')
ok(row.includes('break-words min-w-0'), 'raekken kan krympe')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'etiketten staar i raekken')
ok(between.indexOf(id) === between.lastIndexOf(id), 'det er den naermeste raekke')
ok(between.includes(label), 'etiketten kan stadig krympe')
ok(view.indexOf(id) === view.lastIndexOf(id), 'raekken findes en gang')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(bare).length === 1, 'den bare raekke er vaek')
ok(!view.includes(bare), 'den bare raekke er vaek')
ok(view.includes('>Alle</button>'), 'alle-knappen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-due-row-wrap-test')
