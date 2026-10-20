/**
 * Boksens ramme når vedhæftninger ikke er downloadet kan krympe.
 * Sætningen og download-knappen bliver.
 *   npx tsx scripts/mail-attachments-pending-box-wrap-test.ts
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
const id = 'data-testid="mail-attachments-pending-box"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 100, at + 180) : ''
const cell = 'className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2 break-words min-w-0" data-testid="mail-attachments-pending-box"'
ok(row.includes('<div'), 'det er boksen')
ok(row.includes('bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2 break-words min-w-0'), 'boksen kan krympe')
ok(row.includes('Vedhæftningerne er ikke downloadet endnu.'), 'sætningen ligger i boksen')
ok(!row.includes('Download vedhæftninger nu'), 'knappen er et andet sted')
ok(!row.includes('handleBackfill'), 'handlingen er et andet sted')
ok(!row.includes('mail-attachments-count'), 'antallet er et andet sted')
ok(!row.includes('mail-attachments-heading'), 'overskriften er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('formatFileSize'), 'filstørrelsen er et andet sted')
ok(view.split(id).length === 2, 'boksen findes en gang')
ok(view.split(cell).length === 2, 'boksens klasse findes en gang')
ok(view.includes('text-sm text-amber-800'), 'sætningens klasse bliver')
ok(view.includes('className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 break-words min-w-0" data-testid="mail-attachments-download-button"'), 'knappen bliver')
ok(view.includes('data-testid="mail-attachments-count"'), 'antallet bliver')
ok(view.includes('data-testid="mail-attachments-heading"'), 'overskriften bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-attachments-pending-box-wrap-test')
