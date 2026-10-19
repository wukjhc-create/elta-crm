/**
 * Navnet i mailens lysboks kan krympe. Luk og download bliver.
 *   npx tsx scripts/mail-lightbox-name-wrap-test.ts
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
const id = 'data-testid="mail-lightbox-name"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 90, at + 10) : ''
const cell = 'className="text-sm text-white/80 break-all min-w-0 flex-1 break-words min-w-0" data-testid="mail-lightbox-name"'
ok(row.includes('<span'), 'det er navnet')
ok(row.includes('text-sm text-white/80 break-all min-w-0 flex-1 break-words min-w-0'), 'navnet kan krympe')
ok(!row.includes('lightboxName'), 'navneudtrykket er et andet sted')
ok(!row.includes('href='), 'linket er et andet sted')
ok(!row.includes('aria-label'), 'etiketten er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('setLightboxUrl'), 'lukningen er et andet sted')
ok(!row.includes('mail-lightbox-download-link'), 'download-linket er et andet sted')
ok(!row.includes('mail-lightbox-download-icon'), 'download-ikonet er et andet sted')
ok(!row.includes('mail-lightbox-close-button'), 'luk-knappen er et andet sted')
ok(!row.includes('mail-lightbox-close-icon'), 'luk-ikonet er et andet sted')
ok(!row.includes('mail-lightbox-photo'), 'lysbilledet er et andet sted')
ok(!row.includes('mail-lightbox-title-row'), 'titelraekken er et andet sted')
ok(!row.includes('mail-lightbox-panel'), 'panelet er et andet sted')
ok(!row.includes('mail-lightbox-shell'), 'lysboksen er et andet sted')
ok(view.split(id).length === 2, 'navnet findes en gang')
ok(view.split(cell).length === 2, 'navnets klasse findes en gang')
ok(view.split('className="text-sm text-white/80 break-all min-w-0 flex-1"').length === 1, 'det bare navn er vaek')
ok(view.includes('data-testid="mail-lightbox-name">{lightboxName}'), 'navneudtrykket bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')
ok(view.includes('onClick={() => setLightboxUrl(null)}'), 'lukningen bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('aria-label="Download"'), 'download-etiketten bliver')
ok(view.includes('data-testid="mail-lightbox-download-link"'), 'download-linket bliver')
ok(view.includes('data-testid="mail-lightbox-close-button"'), 'luk-knappen bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-lightbox-name-wrap-test')
