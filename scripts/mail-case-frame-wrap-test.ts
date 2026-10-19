/**
 * Sagsvaelgerens ramme i mail-detaljen kan krympe. Vaelg sag bliver.
 *   npx tsx scripts/mail-case-frame-wrap-test.ts
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
const id = 'data-testid="mail-case-frame"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 140, at + 10) : ''
const cell = 'className="flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 p-2.5 rounded-md flex-wrap break-words min-w-0" data-testid="mail-case-frame"'
const bare = 'className="flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 p-2.5 rounded-md flex-wrap"'
ok(row.includes('<div'), 'det er rammen')
ok(row.includes('break-words min-w-0'), 'rammen kan krympe')
ok(row.includes('bg-blue-50'), 'farven bliver')
ok(!row.includes('Briefcase'), 'ikonet er et andet sted')
ok(!row.includes('Sag'), 'sagteksten er et andet sted')
ok(!row.includes('mail-case-actions'), 'handlingsraekken er et andet sted')
ok(!row.includes('Vælg'), 'vaelg sag er et andet sted')
ok(!row.includes('truncate'), 'vaelgeren er et andet sted')
ok(!row.includes('text-gray-600'), 'graa sag er et andet sted')
ok(!row.includes('return'), 'return er et andet sted')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(cell).length === 2, 'rammeklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare ramme er vaek')
ok(view.split('data-testid="mail-case-actions"').length === 2, 'handlings-id kolliderer ikke')
ok(view.split('data-testid="mail-case-picker-load-error"').length === 3, 'fejl-id kolliderer ikke')
ok(view.includes('title="Vælg sag"'), 'titlen bliver')
ok(view.includes('max-w-[280px] truncate'), 'vaelgeren bliver klippet')
ok(view.includes('className="text-gray-600 break-words min-w-0" data-testid="mail-empty-case">Ingen sag tilknyttet'), 'ingen sag bliver')
ok(view.includes('<Briefcase'), 'ikonet bliver')
ok(view.includes('data-testid="mail-case-actions"'), 'handlingsraekken bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-case-frame-wrap-test')
