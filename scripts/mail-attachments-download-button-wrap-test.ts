/**
 * Knappen Download vedhæftninger nu kan krympe. Sætningen og boksen bliver.
 *   npx tsx scripts/mail-attachments-download-button-wrap-test.ts
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
const id = 'data-testid="mail-attachments-download-button"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 290, at + 270) : ''
const cell = 'className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 break-words min-w-0" data-testid="mail-attachments-download-button"'
ok(row.includes('<button'), 'det er knappen')
ok(row.includes('inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 break-words min-w-0'), 'knappen kan krympe')
ok(row.includes('Download vedhæftninger nu'), 'teksten ligger paa knappen')
ok(!row.includes('Vedhæftningerne er ikke downloadet endnu.'), 'sætningen er et andet sted')
ok(!row.includes('mail-attachments-pending-box'), 'boksen er et andet sted')
ok(!row.includes('mail-attachments-count'), 'antallet er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('formatFileSize'), 'filstørrelsen er et andet sted')
ok(!row.includes('mail-attachments-heading'), 'overskriften er et andet sted')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(cell).length === 2, 'knappens klasse findes en gang')
ok(view.includes('Vedhæftningerne er ikke downloadet endnu.'), 'sætningen bliver')
ok(view.includes('data-testid="mail-attachments-pending-box"'), 'boksen bliver')
ok(view.includes('className="mt-6 pt-4 border-t"'), 'afsnittets ramme bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('data-testid="mail-attachments-heading"'), 'overskriften bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-attachments-download-button-wrap-test')
