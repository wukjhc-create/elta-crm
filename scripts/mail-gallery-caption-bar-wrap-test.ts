/**
 * Billedtekstens bjælke i mailgalleriet kan krympe. Filnavnet bliver.
 *   npx tsx scripts/mail-gallery-caption-bar-wrap-test.ts
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
const id = 'data-testid="mail-gallery-caption-bar"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 140, at + 10) : ''
const cell = 'className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 break-words min-w-0" data-testid="mail-gallery-caption-bar"'
ok(row.includes('<div'), 'det er billedtekstens bjælke')
ok(row.includes('absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 break-words min-w-0'), 'bjælken kan krympe')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('formatFileSize'), 'filstørrelsen er et andet sted')
ok(!row.includes('mail-gallery-size'), 'billedteksten er et andet sted')
ok(!row.includes('mail-gallery-image-button'), 'billedknappen er et andet sted')
ok(!row.includes('grid grid-cols-3'), 'galleriet er et andet sted')
ok(!row.includes('att.filename'), 'filnavnet er et andet sted')
ok(!row.includes('object-cover'), 'billedet er et andet sted')
ok(view.split(id).length === 2, 'bjælken findes en gang')
ok(view.split(cell).length === 2, 'bjælkens klasse findes en gang')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('data-testid="mail-gallery-size"'), 'billedteksten bliver')
ok(view.includes('data-testid="mail-gallery-image-button"'), 'billedknappen bliver')
ok(view.includes('<img src={att.url} alt={att.filename} className="w-full h-full object-cover" />'), 'billedet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-gallery-caption-bar-wrap-test')
