/**
 * Overskriften Vedhæftede filer kan krympe. Antallet og filnavnet bliver.
 *   npx tsx scripts/mail-attachments-heading-wrap-test.ts
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
const id = 'data-testid="mail-attachments-heading"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const cell = 'className="text-sm font-semibold text-gray-700 break-words min-w-0" data-testid="mail-attachments-heading"'
ok(row.includes('<h3'), 'det er overskriften')
ok(row.includes('text-sm font-semibold text-gray-700 break-words min-w-0'), 'overskriften kan krympe')
ok(row.includes('Vedhæftede filer'), 'teksten ligger i overskriften')
ok(!row.includes('realAttachments.length'), 'antallet er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('formatFileSize'), 'filstørrelsen er et andet sted')
ok(!row.includes('mail-gallery-size'), 'galleriets størrelse er et andet sted')
ok(!row.includes('mail-list-size'), 'listens størrelse er et andet sted')
ok(view.split(id).length === 2, 'overskriften findes en gang')
ok(view.split(cell).length === 2, 'overskriftens klasse findes en gang')
ok(view.split('Vedhæftede filer').length === 2, 'teksten findes en gang')
ok(view.includes('text-gray-400 font-normal ml-1">({realAttachments.length})'), 'antallet bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('data-testid="mail-gallery-size"'), 'galleriets størrelse bliver')
ok(view.includes('data-testid="mail-list-size"'), 'listens størrelse bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-attachments-heading-wrap-test')
