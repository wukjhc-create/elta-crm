/**
 * Linket Se opgave i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-task-link-wrap-test.ts
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
const id = 'data-testid="mail-task-link"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 220, at + 10) : ''
const cell = 'className="ml-auto text-orange-700 hover:underline inline-flex items-center gap-1 text-xs font-medium break-words min-w-0" data-testid="mail-task-link"'
const bare = 'className="ml-auto text-orange-700 hover:underline inline-flex items-center gap-1 text-xs font-medium"'
ok(row.includes('<a'), 'det er linket')
ok(row.includes('className'), 'klassen er paa linket')
ok(row.includes('break-words min-w-0'), 'linket kan krympe')
ok(row.includes('text-orange-700'), 'farven bliver')
ok(row.includes('source_email_id'), 'href er paa linket')
ok(!row.includes('Se opgave'), 'linkteksten er et andet sted')
ok(!row.includes('ExternalLink'), 'pil-ikonet er et andet sted')
ok(!row.includes('mail-task-frame'), 'rammen er et andet sted')
ok(!row.includes('text-orange-800'), 'opgaveteksten er et andet sted')
ok(!row.includes('AlertCircle'), 'advarselsikonet er et andet sted')
ok(!row.includes('openAutoTasks'), 'betingelsen er et andet sted')
ok(!row.includes('mail-portal-frame'), 'portalen er et andet sted')
ok(view.split(id).length === 2, 'linket findes en gang')
ok(view.split(cell).length === 2, 'linkklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare linkklasse er vaek')
ok(view.split('data-testid="mail-task-frame"').length === 2, 'ramme-id kolliderer ikke')
ok(view.includes('Se opgave'), 'linkteksten bliver')
ok(view.includes('Se opgave <ExternalLink className="w-3 h-3 break-words min-w-0" data-testid="mail-opgave-arrow" />'), 'pil-ikonet bliver')
ok(view.includes('text-orange-800'), 'opgaveteksten bliver')
ok(view.includes('source_email_id=${email.id}'), 'href bliver')
ok(view.includes('data-testid="mail-task-frame"'), 'rammen bliver')
ok(view.includes('data-testid="mail-portal-link"'), 'portallinket bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-task-link-wrap-test')
