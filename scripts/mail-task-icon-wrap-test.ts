/**
 * Advarselsikonet ved auto-opgaven kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-task-icon-wrap-test.ts
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
const id = 'data-testid="mail-task-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = 'className="w-4 h-4 text-orange-600 shrink-0 break-words min-w-0" data-testid="mail-task-icon"'
const bare = 'className="w-4 h-4 text-orange-600 shrink-0"'
ok(row.includes('<AlertCircle'), 'det er ikonet')
ok(row.includes('className'), 'klassen er paa ikonet')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(row.includes('text-orange-600'), 'farven bliver')
ok(row.includes('shrink-0'), 'shrink bliver')
ok(!row.includes('mail-task-frame'), 'rammen er et andet sted')
ok(!row.includes('mail-task-text'), 'spanet er et andet sted')
ok(!row.includes('Auto-opgave'), 'opgaveteksten er et andet sted')
ok(!row.includes('openAutoTasks'), 'betingelsen er et andet sted')
ok(!row.includes('text-orange-800'), 'tekstfarven er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare ikonklasse er vaek')
ok(view.split('data-testid="mail-task-frame"').length === 2, 'ramme-id kolliderer ikke')
ok(view.split('data-testid="mail-task-text"').length === 2, 'tekst-id kolliderer ikke')
ok(view.split('data-testid="mail-task-link"').length === 2, 'link-id kolliderer ikke')
ok(view.includes('Auto-opgave oprettet:'), 'opgaveteksten bliver')
ok(view.includes('åbne auto-opgaver for denne tråd'), 'flere opgaver bliver')
ok(view.includes('text-orange-800'), 'tekstfarven bliver')
ok(view.includes('<AlertCircle'), 'ikonet bliver')
ok(view.includes('data-testid="mail-task-frame"'), 'rammen bliver')
ok(view.includes('data-testid="mail-task-text"'), 'spanet bliver')
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
console.log('PASS  mail-task-icon-wrap-test')
