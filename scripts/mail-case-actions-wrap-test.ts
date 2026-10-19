/**
 * Handlingsraekken ved sagsvaelgeren kan krympe. title Vaelg sag bliver.
 *   npx tsx scripts/mail-case-actions-wrap-test.ts
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
const id = 'data-testid="mail-case-actions"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = 'className="ml-auto flex items-center gap-2 shrink-0 break-words min-w-0" data-testid="mail-case-actions"'
ok(row.includes('<div'), 'det er raekken')
ok(row.includes('break-words min-w-0'), 'raekken kan krympe')
ok(row.includes('ml-auto'), 'ml-auto bliver')
ok(!row.includes('Vælg'), 'vaelg sag er et andet sted')
ok(!row.includes('title='), 'titlen er et andet sted')
ok(!row.includes('<select'), 'select er et andet sted')
ok(!row.includes('mail-case-picker-load-error'), 'fejl-id er et andet sted')
ok(!row.includes('mail-linked-customer-actions'), 'kunderaekken er et andet sted')
ok(!row.includes('Ingen sag'), 'ingen sag er et andet sted')
ok(!row.includes('text-gray-600'), 'graa sag er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkeklassen findes en gang')
ok(view.split('className="ml-auto flex items-center gap-2 shrink-0"').length === 1, 'den bare raekke er vaek')
ok(view.split('data-testid="mail-linked-customer-actions"').length === 2, 'kunderaekke-id kolliderer ikke')
ok(view.split('data-testid="mail-case-picker-load-error"').length === 3, 'fejl-id kolliderer ikke')
ok(view.includes('title="Vælg sag"'), 'titlen bliver')
ok(view.includes('max-w-[280px] truncate'), 'vaelgeren bliver klippet')
ok(view.includes('className="text-gray-600">Ingen sag tilknyttet'), 'ingen sag bliver')
ok(view.includes('data-testid="mail-case-picker-load-error"'), 'fejl-id bliver')
ok(view.includes('data-testid="mail-linked-customer-actions"'), 'kunderaekken bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-case-actions-wrap-test')
