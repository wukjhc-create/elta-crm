/**
 * Telefon-tallet i mailforslag kan krympe. Nummeret bliver.
 *   npx tsx scripts/mail-phone-value-wrap-test.ts
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
const id = 'data-testid="mail-phone-value"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 10) : ''
const bare = '<strong>{detectedPhone}</strong>'
const cell = '<strong className="break-words min-w-0" data-testid="mail-phone-value">{detectedPhone}</strong>'
ok(row.includes('<strong'), 'det er telefon-tallet')
ok(row.includes('break-words min-w-0'), 'tallet kan krympe')
ok(!row.includes('detectedPhone'), 'nummeret er et andet sted')
ok(!row.includes('Telefon'), 'teksten er et andet sted')
ok(!row.includes('mail-found-phone'), 'linjen er et andet sted')
ok(!row.includes('detectedOrderId'), 'ordren er et andet sted')
ok(view.split(id).length === 2, 'tallet findes en gang')
ok(view.split(cell).length === 2, 'talklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare tal er vaek')
ok(view.includes('Telefon fundet i email'), 'teksten bliver')
ok(view.includes('{detectedPhone}'), 'nummeret bliver')
ok(view.includes('<strong>{detectedOrderId}</strong>'), 'ordre-tallet bliver')
ok(view.includes('data-testid="mail-found-phone"'), 'telefonlinjen bliver')
ok(view.includes('data-testid="mail-found-order"'), 'ordre-linjen bliver')
ok(view.includes('Kobl'), 'kobl bliver')
ok(view.includes('data-testid="mail-reply-msg"'), 'svaret bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-phone-value-wrap-test')
