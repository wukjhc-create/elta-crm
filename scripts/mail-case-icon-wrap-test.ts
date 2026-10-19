/**
 * Sagsikonet i mail-detaljen kan krympe. Vaelg sag bliver.
 *   npx tsx scripts/mail-case-icon-wrap-test.ts
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
const id = 'data-testid="mail-case-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = 'className="w-4 h-4 text-blue-600 shrink-0 break-words min-w-0" data-testid="mail-case-icon"'
const bare = 'className="w-4 h-4 text-blue-600 shrink-0"'
ok(row.includes('<Briefcase'), 'det er ikonet')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(row.includes('text-blue-600'), 'farven bliver')
ok(row.includes('shrink-0'), 'shrink bliver')
ok(!row.includes('mail-case-frame'), 'rammen er et andet sted')
ok(!row.includes('bg-blue-50'), 'rammefarven er et andet sted')
ok(!row.includes('Sag'), 'sagteksten er et andet sted')
ok(!row.includes('Vælg'), 'vaelg sag er et andet sted')
ok(!row.includes('mail-case-actions'), 'handlingsraekken er et andet sted')
ok(!row.includes('text-gray-600'), 'graa sag er et andet sted')
ok(!row.includes('return'), 'return er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare ikonklasse er vaek')
ok(view.split('data-testid="mail-case-frame"').length === 2, 'ramme-id kolliderer ikke')
ok(view.split('data-testid="mail-case-actions"').length === 2, 'handlings-id kolliderer ikke')
ok(view.split('data-testid="mail-case-picker-load-error"').length === 3, 'fejl-id kolliderer ikke')
ok(view.includes('title="Vælg sag"'), 'titlen bliver')
ok(view.includes('max-w-[280px] truncate'), 'vaelgeren bliver klippet')
ok(view.includes('className="text-gray-600 break-words min-w-0" data-testid="mail-empty-case">Ingen sag tilknyttet'), 'ingen sag bliver')
ok(view.includes('<Briefcase'), 'ikonet bliver')
ok(view.includes('data-testid="mail-case-frame"'), 'rammen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-case-icon-wrap-test')
