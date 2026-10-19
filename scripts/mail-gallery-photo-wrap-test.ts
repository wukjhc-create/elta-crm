/**
 * Billedet i mailgalleriet kan krympe. Filnavnet bliver.
 *   npx tsx scripts/mail-gallery-photo-wrap-test.ts
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
const id = 'data-testid="mail-gallery-photo"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 100, at + 10) : ''
const cell = 'className="w-full h-full object-cover break-words min-w-0" data-testid="mail-gallery-photo"'
ok(row.includes('<img'), 'det er billedet')
ok(row.includes('w-full h-full object-cover break-words min-w-0'), 'billedet kan krympe')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('formatFileSize'), 'filstørrelsen er et andet sted')
ok(!row.includes('mail-gallery-size'), 'billedteksten er et andet sted')
ok(!row.includes('mail-gallery-caption-bar'), 'bjælken er et andet sted')
ok(!row.includes('mail-gallery-image-button'), 'billedknappen er et andet sted')
ok(!row.includes('grid grid-cols-3'), 'galleriet er et andet sted')
ok(view.split(id).length === 2, 'billedet findes en gang')
ok(view.split(cell).length === 2, 'billedets klasse findes en gang')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('data-testid="mail-gallery-caption-bar"'), 'bjælken bliver')
ok(view.includes('data-testid="mail-gallery-size"'), 'billedteksten bliver')
ok(view.includes('data-testid="mail-gallery-image-button"'), 'billedknappen bliver')
ok(view.includes('className="group flex items-start gap-3 px-3 py-2.5 border rounded-md bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-colors"'), 'fillinket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-gallery-photo-wrap-test')
