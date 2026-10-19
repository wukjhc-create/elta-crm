/**
 * Rammen om mailforslag i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-suggest-frame-wrap-test.ts
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
const id = 'data-testid="mail-suggest-frame"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 10) : ''
const bare = 'className="pt-2 border-t"'
const cell = 'className="pt-2 border-t break-words min-w-0" data-testid="mail-suggest-frame"'
ok(row.includes('<div '), 'det er rammen')
ok(row.includes('pt-2 border-t'), 'kanten bliver')
ok(row.includes('break-words min-w-0'), 'rammen kan krympe')
ok(!row.includes('mail-suggest-box'), 'boksen er et andet sted')
ok(!row.includes('space-y-2'), 'boksen er et andet sted')
ok(!row.includes('mail-quick-reply-frame'), 'hurtigsvar-rammen er et andet sted')
ok(!row.includes('Mulige matches'), 'teksten er et andet sted')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(cell).length === 2, 'rammeklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.split('data-testid="mail-suggest-box"').length === 2, 'boks-id kolliderer ikke')
ok(view.split('data-testid="mail-quick-reply-frame"').length === 2, 'hurtigsvar-id kolliderer ikke')
ok(view.includes('Mulige matches (forslag)'), 'teksten bliver')
ok(view.includes('data-testid="mail-suggest-box"'), 'boksen bliver')
ok(view.includes('data-testid="mail-suggest-icon"'), 'ikonet bliver')
ok(view.includes('className="pt-2 border-t space-y-2 break-words min-w-0" data-testid="mail-quick-reply-frame"'), 'hurtigsvar-rammen bliver')
ok(view.includes('data-testid="mail-reply-msg"'), 'svaret bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-suggest-frame-wrap-test')
