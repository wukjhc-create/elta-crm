/**
 * Rækken over Vedhæftede filer kan krympe. Overskriften og papirclipsen bliver.
 *   npx tsx scripts/mail-attachments-title-row-wrap-test.ts
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
const id = 'data-testid="mail-attachments-title-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 20) : ''
const cell = 'className="flex items-center gap-2 mb-3 break-words min-w-0" data-testid="mail-attachments-title-row"'
ok(row.includes('<div'), 'det er rækken')
ok(row.includes('flex items-center gap-2 mb-3 break-words min-w-0'), 'rækken kan krympe')
ok(!row.includes('Vedhæftede filer'), 'overskriften er et andet sted')
ok(!row.includes('mail-attachments-heading'), 'overskriftens id er et andet sted')
ok(!row.includes('Paperclip'), 'papirclipsen er et andet sted')
ok(!row.includes('mail-attachments-section'), 'rammen er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('formatFileSize'), 'filstørrelsen er et andet sted')
ok(!row.includes('space-y-3'), 'stakken er et andet sted')
ok(view.split(id).length === 2, 'rækken findes en gang')
ok(view.split(cell).length === 2, 'rækkens klasse findes en gang')
ok(view.includes('className="space-y-3"'), 'stakken bliver')
ok(view.includes('Paperclip className="w-5 h-5 text-gray-500"'), 'papirclipsen bliver')
ok(view.includes('data-testid="mail-attachments-heading"'), 'overskriften bliver')
ok(view.includes('data-testid="mail-attachments-section"'), 'rammen bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-attachments-title-row-wrap-test')
