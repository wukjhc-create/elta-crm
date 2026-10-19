/**
 * Telefonlinjen i mailforslag kan krympe. Nummeret bliver.
 *   npx tsx scripts/mail-found-phone-wrap-test.ts
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
const id = 'data-testid="mail-found-phone"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 10) : ''
const bare = '<p className="text-xs text-gray-600">Telefon fundet i email: <strong>{detectedPhone}</strong></p>'
const cell = '<p className="text-xs text-gray-600 break-words min-w-0" data-testid="mail-found-phone">Telefon fundet i email: <strong className="break-words min-w-0" data-testid="mail-phone-value">{detectedPhone}</strong></p>'
ok(row.includes('<p '), 'det er telefonlinjen')
ok(row.includes('text-xs text-gray-600'), 'linjen bliver graa')
ok(row.includes('break-words min-w-0'), 'linjen kan krympe')
ok(!row.includes('Telefon'), 'teksten er et andet sted')
ok(!row.includes('detectedPhone'), 'nummeret er et andet sted')
ok(!row.includes('detectedOrderId'), 'ordren er et andet sted')
ok(!row.includes('mail-suggest-title'), 'overskriften er et andet sted')
ok(view.split(id).length === 2, 'linjen findes en gang')
ok(view.split(cell).length === 2, 'linjeklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare afsnit er vaek')
ok(view.includes('Telefon fundet i email'), 'teksten bliver')
ok(view.includes('{detectedPhone}'), 'nummeret bliver')
ok(view.includes('<p className="text-xs text-gray-600 break-words min-w-0" data-testid="mail-found-order">Ordre/ref fundet i email: <strong>{detectedOrderId}</strong></p>'), 'ordre-linjen bliver')
ok(view.includes('data-testid="mail-other-number"'), 'det andet nummer bliver')
ok(view.includes('data-testid="mail-match-number"'), 'e-mail-nummeret bliver')
ok(view.includes('Kobl'), 'kobl bliver')
ok(view.includes('data-testid="mail-reply-msg"'), 'svaret bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-found-phone-wrap-test')
