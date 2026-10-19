/**
 * Fillinket i mailens vedhæftningsliste kan krympe. Filnavnet bliver.
 *   npx tsx scripts/mail-file-link-wrap-test.ts
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
const id = 'data-testid="mail-file-link"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 380, at + 10) : ''
const cell = 'className="group flex items-start gap-3 px-3 py-2.5 border rounded-md bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-colors break-words min-w-0" data-testid="mail-file-link"'
ok(row.includes('<a'), 'det er fillinket')
ok(row.includes('group flex items-start gap-3 px-3 py-2.5 border rounded-md bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-colors break-words min-w-0'), 'linket kan krympe')
ok(row.includes('href={att.url}'), 'adressen bliver i linket')
ok(!row.includes('line-clamp-2'), 'gallerifilnavnet er et andet sted')
ok(!row.includes('formatFileSize'), 'filstørrelsen er et andet sted')
ok(!row.includes('mail-list-size'), 'listestørrelsen er et andet sted')
ok(!row.includes('att.filename'), 'filnavnet er et andet sted')
ok(!row.includes('Download'), 'download-ikonet er et andet sted')
ok(!row.includes('mail-gallery-photo'), 'billedet er et andet sted')
ok(!row.includes('object-cover'), 'billedet er et andet sted')
ok(view.split(id).length === 2, 'linket findes en gang')
ok(view.split(cell).length === 2, 'linkets klasse findes en gang')
ok(view.includes('break-all min-w-0 flex-1 text-sm text-gray-700'), 'filnavnet bliver')
ok(view.includes('href={att.url}'), 'download bliver')
ok(view.includes('data-testid="mail-list-size"'), 'listestørrelsen bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'gallerifilnavnet bliver')
ok(view.includes('className="whitespace-pre-wrap text-sm text-gray-700 font-sans"'), 'broedteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-file-link-wrap-test')
