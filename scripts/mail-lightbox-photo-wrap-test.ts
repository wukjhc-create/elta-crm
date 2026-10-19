/**
 * Billedet i mailens lysboks kan krympe. Luk bliver.
 *   npx tsx scripts/mail-lightbox-photo-wrap-test.ts
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
const id = 'data-testid="mail-lightbox-photo"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 140, at + 10) : ''
const cell = 'className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain break-words min-w-0" data-testid="mail-lightbox-photo"'
ok(row.includes('<img'), 'det er lysbilledet')
ok(row.includes('max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain break-words min-w-0'), 'lysbilledet kan krympe')
ok(!row.includes('mail-lightbox-title-row'), 'titelraekken er et andet sted')
ok(!row.includes('mail-lightbox-panel'), 'panelet er et andet sted')
ok(!row.includes('mail-lightbox-shell'), 'lysboksen er et andet sted')
ok(!row.includes('aria-label'), 'luk er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('setLightboxUrl'), 'lukningen er et andet sted')
ok(!row.includes('mail-gallery-photo'), 'galleribilledet er et andet sted')
ok(view.split(id).length === 2, 'lysbilledet findes en gang')
ok(view.split(cell).length === 2, 'lysbilledets klasse findes en gang')
ok(!view.includes('className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain"'), 'det bare lysbillede er vaek')
ok(view.includes('data-testid="mail-lightbox-title-row"'), 'titelraekken bliver')
ok(view.includes('data-testid="mail-lightbox-panel"'), 'panelet bliver')
ok(view.includes('data-testid="mail-lightbox-shell"'), 'lysboksen bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('setLightboxUrl(null)'), 'lukningen bliver')
ok(view.includes('break-all min-w-0 flex-1 break-words min-w-0" data-testid="mail-lightbox-name">{lightboxName}'), 'navnet bliver')
ok(view.includes('src={lightboxUrl}'), 'kilden bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-lightbox-photo-wrap-test')
