/**
 * Badge-raekken ved emnet kan krympe. Ulaest bliver.
 *   npx tsx scripts/mail-badge-row-wrap-test.ts
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
const id = 'data-testid="mail-badge-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 70, at + 10) : ''
const cell = 'className="flex items-center gap-2 shrink-0 break-words min-w-0" data-testid="mail-badge-row"'
ok(row.includes('<div'), 'det er badge-raekken')
ok(row.includes('flex items-center gap-2 shrink-0 break-words min-w-0'), 'badge-raekken kan krympe')
ok(!row.includes('Ulæst'), 'teksten er et andet sted')
ok(!row.includes('mail-unread'), 'ulaest-id er et andet sted')
ok(!row.includes('is_read'), 'vagten er et andet sted')
ok(!row.includes('<h2'), 'overskriften er et andet sted')
ok(!row.includes('mail-subject"'), 'emnet er et andet sted')
ok(!row.includes('mail-subject-row'), 'emnerakken er et andet sted')
ok(!row.includes('mail-detail-header'), 'sidehovedet er et andet sted')
ok(!row.includes('lightbox'), 'lysboksen er et andet sted')
ok(!row.includes('mail-lightbox-actions'), 'knapraekken er et andet sted')
ok(view.split(id).length === 2, 'badge-raekken findes en gang')
ok(view.split(cell).length === 2, 'badge-raekkens klasse findes en gang')
ok(view.split('className="flex items-center gap-2 shrink-0"').length === 1, 'den bare raekke er vaek')
ok(view.split('data-testid="mail-unread-badge"').length === 2, 'ulaest-id kolliderer ikke')
ok(view.split('data-testid="mail-subject"').length === 2, 'emne-id kolliderer ikke')
ok(view.split('data-testid="mail-lightbox-actions"').length === 2, 'knapraekke-id kolliderer ikke')
ok(view.includes('>Ulæst</span>'), 'teksten bliver')
ok(view.includes('data-testid="mail-subject">{email.subject || \'(Intet emne)\'}'), 'emnet bliver')
ok(view.includes('className="flex items-center gap-2 shrink-0 break-words min-w-0" data-testid="mail-lightbox-actions"'), 'knapraekken bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('aria-label="Download"'), 'download-etiketten bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-badge-row-wrap-test')
