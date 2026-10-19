/**
 * Opgaveteksten i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-task-text-wrap-test.ts
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
const id = 'data-testid="mail-task-text"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 10) : ''
const cell = 'className="text-orange-800 break-words min-w-0" data-testid="mail-task-text"'
const bare = 'className="text-orange-800"'
ok(row.includes('<span'), 'det er spanet')
ok(row.includes('className'), 'klassen er paa spanet')
ok(row.includes('break-words min-w-0'), 'teksten kan krympe')
ok(row.includes('text-orange-800'), 'farven bliver')
ok(!row.includes('Auto-opgave'), 'opgaveteksten er et andet sted')
ok(!row.includes('openAutoTasks'), 'betingelsen er et andet sted')
ok(!row.includes('AlertCircle'), 'advarselsikonet er et andet sted')
ok(!row.includes('mail-task-frame'), 'rammen er et andet sted')
ok(!row.includes('mail-task-link'), 'linket er et andet sted')
ok(!row.includes('Se opgave'), 'linkteksten er et andet sted')
ok(view.split(id).length === 2, 'spanet findes en gang')
ok(view.split(cell).length === 2, 'spanklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare tekstklasse er vaek')
ok(view.split('data-testid="mail-task-frame"').length === 2, 'ramme-id kolliderer ikke')
ok(view.split('data-testid="mail-task-link"').length === 2, 'link-id kolliderer ikke')
ok(view.includes('Auto-opgave oprettet:'), 'opgaveteksten bliver')
ok(view.includes('åbne auto-opgaver for denne tråd'), 'flere opgaver bliver')
ok(view.includes('<AlertCircle className="w-4 h-4 text-orange-600 shrink-0 break-words min-w-0" data-testid="mail-task-icon" />'), 'advarselsikonet bliver')
ok(view.includes('Se opgave'), 'linkteksten bliver')
ok(view.includes('data-testid="mail-task-frame"'), 'rammen bliver')
ok(view.includes('data-testid="mail-task-link"'), 'linket bliver')
ok(view.includes('source_email_id=${email.id}'), 'href bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-task-text-wrap-test')
