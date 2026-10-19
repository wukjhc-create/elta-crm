/**
 * Luk-ikonet i mailens lysboks kan krympe. Luk bliver.
 *   npx tsx scripts/mail-lightbox-close-icon-wrap-test.ts
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
const id = 'data-testid="mail-lightbox-close-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 10) : ''
const cell = 'className="w-4 h-4 text-white break-words min-w-0" data-testid="mail-lightbox-close-icon"'
ok(row.includes('<X'), 'det er luk-ikonet')
ok(row.includes('w-4 h-4 text-white break-words min-w-0'), 'luk-ikonet kan krympe')
ok(!row.includes('aria-label'), 'etiketten er et andet sted')
ok(!row.includes('mail-lightbox-download-icon'), 'download-ikonet er et andet sted')
ok(!row.includes('mail-lightbox-photo'), 'lysbilledet er et andet sted')
ok(!row.includes('mail-lightbox-title-row'), 'titelraekken er et andet sted')
ok(!row.includes('mail-lightbox-panel'), 'panelet er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('setLightboxUrl'), 'lukningen er et andet sted')
ok(!row.includes('href='), 'linket er et andet sted')
ok(view.split(id).length === 2, 'luk-ikonet findes en gang')
ok(view.split(cell).length === 2, 'luk-ikonets klasse findes en gang')
ok(view.split('className="w-4 h-4 text-white"').length === 1, 'den bare hvide ikonklasse er vaek')
ok(view.includes('data-testid="mail-lightbox-download-icon"'), 'download-ikonet bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('aria-label="Download"'), 'download-etiketten bliver')
ok(view.includes('setLightboxUrl(null)'), 'lukningen bliver')
ok(view.includes('className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"'), 'luk-knappen bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-lightbox-close-icon-wrap-test')
