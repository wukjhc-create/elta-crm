/**
 * Forslagsboksen i mail-detaljen kan krympe. Teksten Mulige matches bliver.
 *   npx tsx scripts/mail-suggest-box-wrap-test.ts
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
const id = 'data-testid="mail-suggest-box"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 100, at + 10) : ''
const bare = 'className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-2"'
const cell = 'className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-2 break-words min-w-0" data-testid="mail-suggest-box"'
ok(row.includes('<div '), 'det er boksen')
ok(row.includes('bg-gray-50 border border-gray-200 rounded-md p-3 space-y-2'), 'boksen bliver graa')
ok(row.includes('break-words min-w-0'), 'boksen kan krympe')
ok(!row.includes('pt-2 border-t'), 'ydre ramme er et andet sted')
ok(!row.includes('AlertCircle'), 'ikonet er et andet sted')
ok(!row.includes('Mulige matches'), 'overskriften er et andet sted')
ok(!row.includes('company_name'), 'kundenavnet er et andet sted')
ok(view.split(id).length === 2, 'boksen findes en gang')
ok(view.split(cell).length === 2, 'boksklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.includes('Mulige matches (forslag)'), 'overskriften bliver')
ok(view.includes('break-words">{detectedCustomer.company_name}'), 'fundet kunde ombrydes stadig')
ok(view.includes('break-words">{s.company_name}'), 'forslag ombrydes stadig')
ok(view.includes('Kobl'), 'kobl bliver')
ok(view.includes('data-testid="mail-reply-msg"'), 'svaret bliver')
ok(view.includes('data-testid="mail-graph-diag-line"'), 'diagnoselinjen bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-suggest-box-wrap-test')
