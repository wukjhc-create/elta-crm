/**
 * Antallet ved Vedhæftede filer kan krympe. Overskriften og filnavnet bliver.
 *   npx tsx scripts/mail-attachments-count-wrap-test.ts
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
const id = 'data-testid="mail-attachments-count"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 70, at + 70) : ''
const cell = 'className="text-gray-400 font-normal ml-1 break-words min-w-0" data-testid="mail-attachments-count"'
ok(row.includes('<span'), 'det er antallet')
ok(row.includes('text-gray-400 font-normal ml-1 break-words min-w-0'), 'antallet kan krympe')
ok(row.includes('>({realAttachments.length})'), 'udtrykket ligger i antallet')
ok(!row.includes('Vedhæftede filer'), 'overskriften er et andet sted')
ok(!row.includes('mail-attachments-heading'), 'overskriftens id er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('formatFileSize'), 'filstørrelsen er et andet sted')
ok(!row.includes('mail-gallery-size'), 'galleriets størrelse er et andet sted')
ok(!row.includes('mail-list-size'), 'listens størrelse er et andet sted')
ok(!row.includes('realAttachments.length > 0'), 'betingelsen er et andet sted')
ok(view.split(id).length === 2, 'antallet findes en gang')
ok(view.split(cell).length === 2, 'antallets klasse findes en gang')
ok(view.includes('data-testid="mail-attachments-heading"'), 'overskriften bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('data-testid="mail-gallery-size"'), 'galleriets størrelse bliver')
ok(view.includes('data-testid="mail-list-size"'), 'listens størrelse bliver')
ok(view.includes('className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2"'), 'boksen bliver')
ok(view.includes('Vedhæftningerne er ikke downloadet endnu.'), 'sætningen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-attachments-count-wrap-test')
