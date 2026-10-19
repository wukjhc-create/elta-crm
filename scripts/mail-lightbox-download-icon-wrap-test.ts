/**
 * Download-ikonet i mailens lysboks kan krympe. Luk bliver.
 *   npx tsx scripts/mail-lightbox-download-icon-wrap-test.ts
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
const id = 'data-testid="mail-lightbox-download-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = 'className="w-4 h-4 text-white break-words min-w-0" data-testid="mail-lightbox-download-icon"'
ok(row.includes('<Download'), 'det er download-ikonet')
ok(row.includes('w-4 h-4 text-white break-words min-w-0'), 'download-ikonet kan krympe')
ok(!row.includes('aria-label'), 'etiketten er et andet sted')
ok(!row.includes('mail-lightbox-photo'), 'lysbilledet er et andet sted')
ok(!row.includes('mail-lightbox-title-row'), 'titelraekken er et andet sted')
ok(!row.includes('mail-lightbox-panel'), 'panelet er et andet sted')
ok(!row.includes('mail-lightbox-shell'), 'lysboksen er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('setLightboxUrl'), 'lukningen er et andet sted')
ok(!row.includes('href='), 'linket er et andet sted')
ok(!row.includes('text-gray-300'), 'listeikonet er et andet sted')
ok(view.split(id).length === 2, 'download-ikonet findes en gang')
ok(view.split(cell).length === 2, 'download-ikonets klasse findes en gang')
ok(view.split('className="w-4 h-4 text-white"').length === 1, 'den bare hvide ikonklasse er vaek')
ok(view.includes('<X className="w-4 h-4 text-white break-words min-w-0" data-testid="mail-lightbox-close-icon" />'), 'luk-ikonet bliver')
ok(view.includes('aria-label="Download"'), 'download-etiketten bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('setLightboxUrl(null)'), 'lukningen bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')
ok(view.includes('data-testid="mail-lightbox-photo"'), 'lysbilledet bliver')
ok(view.includes('text-gray-300 group-hover:text-blue-500 shrink-0'), 'listeikonet bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-lightbox-download-icon-wrap-test')
