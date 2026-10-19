/**
 * Billedknappen i mailgalleriet kan krympe. Filnavnet bliver.
 *   npx tsx scripts/mail-gallery-image-button-wrap-test.ts
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
const id = 'data-testid="mail-gallery-image-button"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 360, at + 20) : ''
const cell = 'className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all bg-gray-100 break-words min-w-0" data-testid="mail-gallery-image-button"'
ok(row.includes('<button'), 'det er billedknappen')
ok(row.includes('group relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all bg-gray-100 break-words min-w-0'), 'knappen kan krympe')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('formatFileSize'), 'filstørrelsen er et andet sted')
ok(!row.includes('mail-gallery-size'), 'billedteksten er et andet sted')
ok(!row.includes('mail-attachments-stack'), 'stakken er et andet sted')
ok(!row.includes('grid grid-cols-3'), 'galleriet er et andet sted')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(cell).length === 2, 'knappens klasse findes en gang')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('data-testid="mail-gallery-size"'), 'billedteksten bliver')
ok(view.includes('className="grid grid-cols-3 gap-2"'), 'galleriet bliver')
ok(view.includes('className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5"'), 'bjaelken bliver')
ok(view.includes('data-testid="mail-attachments-stack"'), 'stakken bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-gallery-image-button-wrap-test')
