/**
 * Portalrammen i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-portal-frame-wrap-test.ts
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
const id = 'data-testid="mail-portal-frame"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 130, at + 10) : ''
const cell = 'className="flex items-center gap-2 text-sm bg-purple-50 border border-purple-200 p-2.5 rounded-md break-words min-w-0" data-testid="mail-portal-frame"'
const bare = 'className="flex items-center gap-2 text-sm bg-purple-50 border border-purple-200 p-2.5 rounded-md"'
ok(row.includes('<div'), 'det er rammen')
ok(row.includes('className'), 'klassen er paa rammen')
ok(row.includes('break-words min-w-0'), 'rammen kan krympe')
ok(row.includes('bg-purple-50'), 'baggrunden bliver')
ok(row.includes('border-purple-200'), 'kanten bliver')
ok(!row.includes('hasPortal'), 'betingelsen er et andet sted')
ok(!row.includes('MessageCircle'), 'ikonet er et andet sted')
ok(!row.includes('text-purple-700'), 'tekstfarven er et andet sted')
ok(!row.includes('Kunden har en aktiv portal'), 'teksten er et andet sted')
ok(!row.includes('Hop til Chat'), 'linkteksten er et andet sted')
ok(!row.includes('mail-task-frame'), 'opgaverammen er et andet sted')
ok(!row.includes('bg-orange-50'), 'opgavebaggrunden er et andet sted')
ok(!row.includes('Se opgave'), 'opgaveteksten er et andet sted')
ok(!row.includes('#chat'), 'href er et andet sted')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(cell).length === 2, 'rammeklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare rammeklasse er vaek')
ok(view.includes('Kunden har en aktiv portal'), 'teksten bliver')
ok(view.includes('Hop til Chat'), 'linkteksten bliver')
ok(view.includes('hasPortal'), 'betingelsen bliver')
ok(view.includes('href={`/dashboard/customers/${email.customers.id}#chat`}'), 'href bliver')
ok(view.includes('data-testid="mail-task-frame"'), 'opgaverammen bliver')
ok(view.includes('Se opgave'), 'opgaveteksten bliver')
ok(view.includes('className="text-purple-700"'), 'tekstfarven bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-portal-frame-wrap-test')
