/**
 * Sagsnavnet i mail-detaljen kan krympe. Sagsnummer, titel og href bliver.
 *   npx tsx scripts/mail-case-link-wrap-test.ts
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
const id = 'data-testid="mail-case-link"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 100, at + 10) : ''
const cell = 'className="font-semibold text-blue-700 hover:underline break-words min-w-0"'
const bare = 'className="font-semibold text-blue-700 hover:underline"'
ok(row.includes('className="font-semibold'), 'det er sagsnavnet')
ok(row.includes('break-words min-w-0'), 'sagsnavnet kan krympe')
ok(row.includes('text-blue-700'), 'farven bliver')
ok(row.includes('hover:underline'), 'understregningen bliver')
ok(!row.includes('href'), 'href er et andet sted')
ok(!row.includes('currentCase'), 'sagsdata er et andet sted')
ok(!row.includes('Sag'), 'sagteksten er et andet sted')
ok(!row.includes('mail-case-icon'), 'ikonet er et andet sted')
ok(!row.includes('Briefcase'), 'kufferten er et andet sted')
ok(!row.includes('mail-case-actions'), 'handlingsraekken er et andet sted')
ok(!row.includes('Vælg'), 'vaelg sag er et andet sted')
ok(!row.includes('text-gray-600'), 'graa sag er et andet sted')
ok(!row.includes('text-amber-700'), 'ingen-sager er et andet sted')
ok(!row.includes('return'), 'return er et andet sted')
ok(view.split(id).length === 2, 'linket findes en gang')
ok(view.split(cell).length === 2, 'linkklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare linkklasse er vaek')
ok(view.split('data-testid="mail-case-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.split('data-testid="mail-case-frame"').length === 2, 'ramme-id kolliderer ikke')
ok(view.split('data-testid="mail-case-actions"').length === 2, 'handlings-id kolliderer ikke')
ok(view.split('data-testid="mail-case-picker-load-error"').length === 3, 'fejl-id kolliderer ikke')
ok(view.includes('href={`/dashboard/orders/${currentCase.id}`}'), 'href bliver')
ok(view.includes('{currentCase.case_number}'), 'sagsnummeret bliver')
ok(view.includes('{currentCase.title}'), 'titlen paa sagen bliver')
ok(view.includes('title="Vælg sag"'), 'vaelg-titlen bliver')
ok(view.includes('max-w-[280px] truncate'), 'vaelgeren bliver klippet')
ok(view.includes('className="text-gray-600">Ingen sag tilknyttet'), 'ingen sag bliver')
ok(view.includes('data-testid="mail-case-icon"'), 'ikonet bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-case-link-wrap-test')
