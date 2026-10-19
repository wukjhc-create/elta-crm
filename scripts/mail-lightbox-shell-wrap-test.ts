/**
 * Lysboksen i mailen kan krympe. Luk bliver.
 *   npx tsx scripts/mail-lightbox-shell-wrap-test.ts
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
const id = 'data-testid="mail-lightbox-shell"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 10) : ''
const cell = 'className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 break-words min-w-0" data-testid="mail-lightbox-shell"'
ok(row.includes('<div'), 'det er lysboksen')
ok(row.includes('fixed inset-0 z-50 flex items-center justify-center bg-black/70 break-words min-w-0'), 'lysboksen kan krympe')
ok(!row.includes('mail-inquiry-frame'), 'henvendelsen er et andet sted')
ok(!row.includes('aria-label'), 'luk er et andet sted')
ok(!row.includes('lightboxName'), 'navnet er et andet sted')
ok(!row.includes('relative max-w'), 'panelet er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('WebInquiryCard'), 'kortet er et andet sted')
ok(view.split(id).length === 2, 'lysboksen findes en gang')
ok(view.split(cell).length === 2, 'lysboksens klasse findes en gang')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('setLightboxUrl(null)'), 'lukningen bliver')
ok(view.includes('break-all min-w-0 flex-1">{lightboxName}'), 'navnet bliver')
ok(view.includes('className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"'), 'panelet bliver')
ok(view.includes('data-testid="mail-inquiry-frame"'), 'henvendelsen bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-lightbox-shell-wrap-test')
