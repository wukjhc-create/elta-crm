/**
 * Opgavelinkets ramme i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-task-frame-wrap-test.ts
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
const id = 'data-testid="mail-task-frame"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 130, at + 10) : ''
const cell = 'className="flex items-center gap-2 text-sm bg-orange-50 border border-orange-200 p-2.5 rounded-md break-words min-w-0" data-testid="mail-task-frame"'
const bare = 'className="flex items-center gap-2 text-sm bg-orange-50 border border-orange-200 p-2.5 rounded-md"'
ok(row.includes('<div'), 'det er rammen')
ok(row.includes('className'), 'klassen er paa rammen')
ok(row.includes('break-words min-w-0'), 'rammen kan krympe')
ok(row.includes('bg-orange-50'), 'baggrunden bliver')
ok(row.includes('border-orange-200'), 'kanten bliver')
ok(!row.includes('openAutoTasks'), 'betingelsen er et andet sted')
ok(!row.includes('AlertCircle'), 'ikonet er et andet sted')
ok(!row.includes('text-orange-800'), 'tekstfarven er et andet sted')
ok(!row.includes('Se opgave'), 'linkteksten er et andet sted')
ok(!row.includes('bg-purple-50'), 'portalen er et andet sted')
ok(!row.includes('mail-unlink-button'), 'fjern-knappen er et andet sted')
ok(!row.includes('source_email_id'), 'href er et andet sted')
ok(!row.includes('mail-case-frame'), 'sagsrammen er et andet sted')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(cell).length === 2, 'rammeklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare rammeklasse er vaek')
ok(view.includes('Se opgave'), 'linkteksten bliver')
ok(view.includes('text-orange-800'), 'tekstfarven bliver')
ok(view.includes('openAutoTasks'), 'betingelsen bliver')
ok(view.includes('source_email_id=${email.id}'), 'href bliver')
ok(view.includes('bg-purple-50'), 'portalen bliver')
ok(view.includes('data-testid="mail-unlink-button"'), 'fjern-knappen bliver')
ok(view.includes('data-testid="mail-case-frame"'), 'sagsrammen bliver')
ok(view.includes('data-testid="mail-backfill-msg"'), 'download-svaret bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-task-frame-wrap-test')
