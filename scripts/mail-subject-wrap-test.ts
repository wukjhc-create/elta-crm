/**
 * Emnet i mail-detaljen kan krympe. Emneteksten bliver.
 *   npx tsx scripts/mail-subject-wrap-test.ts
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
const id = 'data-testid="mail-subject"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 70, at + 10) : ''
const cell = 'className="text-xl font-bold text-gray-900 break-words min-w-0" data-testid="mail-subject"'
ok(row.includes('<h2'), 'det er emnet')
ok(row.includes('text-xl font-bold text-gray-900 break-words min-w-0'), 'emnet kan krympe')
ok(!row.includes('email.subject'), 'emneteksten er et andet sted')
ok(!row.includes('Intet emne'), 'tomt emne er et andet sted')
ok(!row.includes('formatDate'), 'datoen er et andet sted')
ok(!row.includes('aria-label'), 'etiketten er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('lightbox'), 'lysboksen er et andet sted')
ok(!row.includes('Ulæst'), 'ulæst er et andet sted')
ok(!row.includes('justify-between'), 'raekken er et andet sted')
ok(view.split(id).length === 2, 'emnet findes en gang')
ok(view.split(cell).length === 2, 'emnets klasse findes en gang')
ok(view.split('className="text-xl font-bold text-gray-900"').length === 1, 'det bare emne er vaek')
ok(view.includes('data-testid="mail-subject">{email.subject || \'(Intet emne)\'}'), 'emneteksten bliver')
ok(view.includes('formatDate(email.received_at)'), 'modtagelsestidspunktet bliver')
ok(view.includes('>Ulæst</span>'), 'ulæst bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('aria-label="Download"'), 'download-etiketten bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-subject-wrap-test')
