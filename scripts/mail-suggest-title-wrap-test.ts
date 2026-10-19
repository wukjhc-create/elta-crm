/**
 * Overskriften Mulige matches i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-suggest-title-wrap-test.ts
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
const id = 'data-testid="mail-suggest-title"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 140, at + 10) : ''
const bare = 'className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"'
const cell = 'className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 break-words min-w-0" data-testid="mail-suggest-title"'
ok(row.includes('<p '), 'det er overskriften')
ok(row.includes('uppercase tracking-wide'), 'overskriften bliver lille')
ok(row.includes('break-words min-w-0'), 'overskriften kan krympe')
ok(!row.includes('mail-suggest-box'), 'boksen er et andet sted')
ok(!row.includes('AlertCircle'), 'ikonet er et andet sted')
ok(!row.includes('Mulige matches'), 'teksten er et andet sted')
ok(!row.includes('company_name'), 'kundenavnet er et andet sted')
ok(view.split(id).length === 2, 'overskriften findes en gang')
ok(view.split(cell).length === 2, 'overskriftsklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.split('data-testid="mail-suggest-box"').length === 2, 'boks-id kolliderer ikke')
ok(view.includes('Mulige matches (forslag)'), 'teksten bliver')
ok(view.includes('<AlertCircle className="w-3.5 h-3.5 break-words min-w-0" data-testid="mail-suggest-icon" />'), 'ikonet bliver')
ok(view.includes('data-testid="mail-suggest-box"'), 'boksen bliver')
ok(view.includes('break-words min-w-0" data-testid="mail-match-name">{detectedCustomer.company_name}'), 'fundet kunde ombrydes stadig')
ok(view.includes('break-words">{s.company_name}'), 'forslag ombrydes stadig')
ok(view.includes('Kobl'), 'kobl bliver')
ok(view.includes('data-testid="mail-reply-msg"'), 'svaret bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-suggest-title-wrap-test')
