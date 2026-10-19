/**
 * Knappen Kobl til eksisterende i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-kobl-button-wrap-test.ts
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
const id = 'data-testid="mail-kobl-button"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 260, at + 10) : ''
const cell = 'className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm transition-all hover:shadow-md break-words min-w-0" data-testid="mail-kobl-button"'
const bare = 'className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm transition-all hover:shadow-md"'
ok(row.includes('<button'), 'det er knappen')
ok(row.includes('onClick={onLink}'), 'klikket bliver paa knappen')
ok(row.includes('className'), 'klassen er paa knappen')
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(row.includes('bg-blue-600'), 'farven bliver')
ok(!row.includes('Kobl til eksisterende'), 'teksten er et andet sted')
ok(!row.includes('<Link2'), 'ikonet er et andet sted')
ok(!row.includes('bg-green-600'), 'opret-knappen er et andet sted')
ok(!row.includes('UserPlus'), 'opret-ikonet er et andet sted')
ok(!row.includes('link_status'), 'betingelsen er et andet sted')
ok(!row.includes('pt-2 flex-wrap'), 'handlingsraekken er et andet sted')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(cell).length === 2, 'knapklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare knapklasse er vaek')
ok(view.includes('Kobl til eksisterende'), 'teksten bliver')
ok(view.includes('<Link2 className="w-4 h-4" />'), 'ikonet bliver')
ok(view.includes('onClick={onLink}'), 'klikket bliver')
ok(view.includes('className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-green-600 text-white rounded-md hover:bg-green-700 shadow-sm transition-all hover:shadow-md"'), 'opret-knappen bliver')
ok(view.includes('Opret som ny kunde'), 'opret-teksten bliver')
ok(view.includes('data-testid="mail-task-title"'), 'opgavetitlen bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-kobl-button-wrap-test')
