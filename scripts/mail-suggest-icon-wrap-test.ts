/**
 * Ikonet ved Mulige matches i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-suggest-icon-wrap-test.ts
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
const id = 'data-testid="mail-suggest-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 10) : ''
const bare = '<AlertCircle className="w-3.5 h-3.5" />'
const cell = '<AlertCircle className="w-3.5 h-3.5 break-words min-w-0" data-testid="mail-suggest-icon" />'
ok(row.includes('<AlertCircle'), 'det er ikonet')
ok(row.includes('w-3.5 h-3.5'), 'stoerrelsen bliver')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('mail-suggest-title'), 'overskriften er et andet sted')
ok(!row.includes('Mulige matches'), 'teksten er et andet sted')
ok(!row.includes('mail-suggest-box'), 'boksen er et andet sted')
ok(!row.includes('mail-restore-icon'), 'relevant-ikonet er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.split('data-testid="mail-suggest-title"').length === 2, 'overskrift-id kolliderer ikke')
ok(view.split('data-testid="mail-suggest-box"').length === 2, 'boks-id kolliderer ikke')
ok(view.split('data-testid="mail-restore-icon"').length === 2, 'relevant-id kolliderer ikke')
ok(view.includes('Mulige matches (forslag)'), 'teksten bliver')
ok(view.includes('data-testid="mail-suggest-title"'), 'overskriften bliver')
ok(view.includes('data-testid="mail-restore-icon"'), 'relevant-ikonet bliver')
ok(view.includes('Markér som relevant'), 'relevant-teksten bliver')
ok(view.includes('data-testid="mail-reply-msg"'), 'svaret bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-suggest-icon-wrap-test')
