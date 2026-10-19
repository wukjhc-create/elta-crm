/**
 * Knapraekken i mailens lysboks kan krympe. Download og luk bliver.
 *   npx tsx scripts/mail-lightbox-actions-wrap-test.ts
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
const id = 'data-testid="mail-lightbox-actions"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 70, at + 10) : ''
const cell = 'className="flex items-center gap-2 shrink-0 break-words min-w-0" data-testid="mail-lightbox-actions"'
ok(row.includes('<div'), 'det er knapraekken')
ok(row.includes('flex items-center gap-2 shrink-0 break-words min-w-0'), 'knapraekken kan krympe')
ok(!row.includes('lightboxName'), 'navnet er et andet sted')
ok(!row.includes('mail-lightbox-name'), 'navne-id er et andet sted')
ok(!row.includes('href='), 'linket er et andet sted')
ok(!row.includes('aria-label'), 'etiketten er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('setLightboxUrl'), 'lukningen er et andet sted')
ok(!row.includes('mail-lightbox-download-link'), 'download-linket er et andet sted')
ok(!row.includes('mail-lightbox-close-button'), 'luk-knappen er et andet sted')
ok(!row.includes('mail-lightbox-photo'), 'lysbilledet er et andet sted')
ok(!row.includes('mail-lightbox-title-row'), 'titelraekken er et andet sted')
ok(!row.includes('mail-lightbox-panel'), 'panelet er et andet sted')
ok(view.split(id).length === 2, 'knapraekken findes en gang')
ok(view.split(cell).length === 2, 'knapraekkens klasse findes en gang')
ok(view.split('className="flex items-center gap-2 shrink-0"').length === 2, 'den anden bare raekke bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')
ok(view.includes('onClick={() => setLightboxUrl(null)}'), 'lukningen bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('aria-label="Download"'), 'download-etiketten bliver')
ok(view.includes('data-testid="mail-lightbox-download-link"'), 'download-linket bliver')
ok(view.includes('data-testid="mail-lightbox-close-button"'), 'luk-knappen bliver')
ok(view.includes('data-testid="mail-lightbox-name">{lightboxName}'), 'navnet bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-lightbox-actions-wrap-test')
