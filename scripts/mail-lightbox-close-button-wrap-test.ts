/**
 * Luk-knappen i mailens lysboks kan krympe. Luk bliver.
 *   npx tsx scripts/mail-lightbox-close-button-wrap-test.ts
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
const id = 'data-testid="mail-lightbox-close-button"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 140, at + 10) : ''
const cell = 'className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 break-words min-w-0" data-testid="mail-lightbox-close-button"'
ok(row.includes('<button'), 'det er luk-knappen')
ok(row.includes('p-1.5 rounded-full bg-white/10 hover:bg-white/20 break-words min-w-0'), 'luk-knappen kan krympe')
ok(!row.includes('aria-label'), 'etiketten er et andet sted')
ok(!row.includes('mail-lightbox-close-icon'), 'luk-ikonet er et andet sted')
ok(!row.includes('mail-lightbox-download-icon'), 'download-ikonet er et andet sted')
ok(!row.includes('href='), 'linket er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('mail-lightbox-photo'), 'lysbilledet er et andet sted')
ok(!row.includes('title="Luk"'), 'titel-luk er et andet sted')
ok(!row.includes('title="Download"'), 'titel-download er et andet sted')
ok(view.split(id).length === 2, 'luk-knappen findes en gang')
ok(view.split(cell).length === 2, 'luk-knappens klasse findes en gang')
ok(view.split('className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"').length === 2, 'download-linkets bare klasse bliver')
ok(view.includes('className="p-1.5 rounded-full bg-white/10 hover:bg-white/20" title="Download"'), 'download-linket bliver')
ok(view.includes('onClick={() => setLightboxUrl(null)}'), 'lukningen bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('aria-label="Download"'), 'download-etiketten bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')
ok(view.includes('data-testid="mail-lightbox-close-icon"'), 'luk-ikonet bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-lightbox-close-button-wrap-test')
