/**
 * Titlen paa auto-opgaven i mail-detaljen kan krympe. Titlen bliver.
 *   npx tsx scripts/mail-task-title-wrap-test.ts
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
const id = 'data-testid="mail-task-title"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 50, at + 10) : ''
const cell = 'className="break-words min-w-0" data-testid="mail-task-title"'
const bare = '<strong>{openAutoTasks[0].title}</strong>'
ok(row.includes('<strong'), 'det er titlen')
ok(row.includes('className'), 'klassen er paa titlen')
ok(row.includes('break-words min-w-0'), 'titlen kan krympe')
ok(!row.includes('Auto-opgave'), 'indledningen er et andet sted')
ok(!row.includes('openAutoTasks'), 'titlen er et andet sted')
ok(!row.includes('.title'), 'udtrykket er et andet sted')
ok(!row.includes('mail-task-text'), 'spanet er et andet sted')
ok(!row.includes('mail-task-icon'), 'ikonet er et andet sted')
ok(view.split(id).length === 2, 'titlen findes en gang')
ok(view.split(cell).length === 2, 'titelklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare titel er vaek')
ok(view.split('data-testid="mail-task-text"').length === 2, 'tekst-id kolliderer ikke')
ok(view.split('data-testid="mail-task-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.split('data-testid="mail-task-link"').length === 2, 'link-id kolliderer ikke')
ok(view.includes('{openAutoTasks[0].title}'), 'titlen bliver')
ok(view.includes('Auto-opgave oprettet:'), 'indledningen bliver')
ok(view.includes('åbne auto-opgaver for denne tråd'), 'flere opgaver bliver')
ok(view.includes('data-testid="mail-task-text"'), 'spanet bliver')
ok(view.includes('data-testid="mail-task-icon"'), 'ikonet bliver')
ok(view.includes('Se opgave'), 'linkteksten bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-task-title-wrap-test')
