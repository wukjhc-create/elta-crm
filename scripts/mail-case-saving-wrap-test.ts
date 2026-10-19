/**
 * Gem-spinneren ved sagsvaelgeren kan krympe. Vaelg sag bliver.
 *   npx tsx scripts/mail-case-saving-wrap-test.ts
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
const id = 'data-testid="mail-case-saving"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = 'className="w-3.5 h-3.5 animate-spin text-blue-600 break-words min-w-0" data-testid="mail-case-saving"'
const bare = 'className="w-3.5 h-3.5 animate-spin text-blue-600"'
ok(row.includes('<Loader2'), 'det er spinneren')
ok(row.includes('break-words min-w-0'), 'spinneren kan krympe')
ok(row.includes('animate-spin'), 'animationen bliver')
ok(row.includes('text-blue-600'), 'farven bliver')
ok(!row.includes('isSaving'), 'betingelsen er et andet sted')
ok(!row.includes('mail-case-actions'), 'handlingsraekken er et andet sted')
ok(!row.includes('Vælg'), 'vaelg sag er et andet sted')
ok(!row.includes('truncate'), 'vaelgeren er et andet sted')
ok(!row.includes('title='), 'titlen er et andet sted')
ok(!row.includes('feedback'), 'svaret er et andet sted')
ok(!row.includes('mail-no-cases'), 'ingen-sager er et andet sted')
ok(!row.includes('return'), 'return er et andet sted')
ok(!row.includes('Kunden'), 'sagteksten er et andet sted')
ok(!row.includes('mail-case-link'), 'sagsnavnet er et andet sted')
ok(view.split(id).length === 2, 'spinneren findes en gang')
ok(view.split(cell).length === 2, 'spinnerklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare spinnerklasse er vaek')
ok(view.split('{isSaving && <Loader2').length === 2, 'betingelsen bliver')
ok(view.split('data-testid="mail-case-actions"').length === 2, 'handlings-id kolliderer ikke')
ok(view.split('data-testid="mail-case-link"').length === 2, 'link-id kolliderer ikke')
ok(view.split('data-testid="mail-no-cases"').length === 2, 'ingen-sager-id kolliderer ikke')
ok(view.split('data-testid="mail-case-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.split('data-testid="mail-case-frame"').length === 2, 'ramme-id kolliderer ikke')
ok(view.split('data-testid="mail-case-picker-load-error"').length === 3, 'fejl-id kolliderer ikke')
ok(view.includes('title="Vælg sag"'), 'titlen bliver')
ok(view.includes('max-w-[280px] truncate'), 'vaelgeren bliver klippet')
ok(view.includes('className="text-gray-600">Ingen sag tilknyttet'), 'ingen sag bliver')
ok(view.includes('Kunden har ingen sager endnu'), 'ingen-sager-teksten bliver')
ok(view.includes('{feedback}'), 'svaret bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-case-saving-wrap-test')
