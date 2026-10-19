/**
 * Teksten om ingen sager i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-no-cases-wrap-test.ts
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
const id = 'data-testid="mail-no-cases"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 10) : ''
const cell = 'className="text-amber-700 break-words min-w-0" data-testid="mail-no-cases"'
const bare = 'className="text-amber-700"'
ok(row.includes('<span'), 'det er teksten')
ok(row.includes('break-words min-w-0'), 'teksten kan krympe')
ok(row.includes('text-amber-700'), 'farven bliver')
ok(!row.includes('Kunden'), 'sagteksten er et andet sted')
ok(!row.includes('Opret'), 'opret-teksten er et andet sted')
ok(!row.includes('strong'), 'fed tekst er et andet sted')
ok(!row.includes('mail-case-link'), 'sagsnavnet er et andet sted')
ok(!row.includes('case_number'), 'sagsnummeret er et andet sted')
ok(!row.includes('text-gray-600'), 'graa sag er et andet sted')
ok(!row.includes('mail-case-actions'), 'handlingsraekken er et andet sted')
ok(!row.includes('Vælg'), 'vaelg sag er et andet sted')
ok(!row.includes('mail-case-icon'), 'ikonet er et andet sted')
ok(!row.includes('return'), 'return er et andet sted')
ok(view.split(id).length === 2, 'teksten findes en gang')
ok(view.split(cell).length === 2, 'tekstklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare tekstklasse er vaek')
ok(view.split('data-testid="mail-case-link"').length === 2, 'link-id kolliderer ikke')
ok(view.split('data-testid="mail-case-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.split('data-testid="mail-case-frame"').length === 2, 'ramme-id kolliderer ikke')
ok(view.split('data-testid="mail-case-actions"').length === 2, 'handlings-id kolliderer ikke')
ok(view.split('data-testid="mail-case-picker-load-error"').length === 3, 'fejl-id kolliderer ikke')
ok(view.includes('Kunden har ingen sager endnu'), 'ingen-sager-teksten bliver')
ok(view.includes('&quot;Opret sag&quot;'), 'opret-teksten bliver')
ok(view.includes('href={`/dashboard/orders/${currentCase.id}`}'), 'href bliver')
ok(view.includes('title="Vælg sag"'), 'vaelg-titlen bliver')
ok(view.includes('max-w-[280px] truncate'), 'vaelgeren bliver klippet')
ok(view.includes('className="text-gray-600">Ingen sag tilknyttet'), 'ingen sag bliver')
ok(view.includes('data-testid="mail-case-link"'), 'sagsnavnet bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-no-cases-wrap-test')
