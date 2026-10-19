/**
 * Filnavnet i downloadlisten kan krympe. Navnet bliver.
 *   npx tsx scripts/mail-file-name-wrap-test.ts
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
const id = 'data-testid="mail-file-name"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 10) : ''
const bare = '<span className="break-all min-w-0 flex-1 text-sm text-gray-700 group-hover:text-blue-700 font-medium">'
const cell = '<span className="break-all min-w-0 flex-1 text-sm text-gray-700 group-hover:text-blue-700 font-medium break-words" data-testid="mail-file-name">'
ok(row.includes('<span'), 'det er filnavnet')
ok(row.includes('break-words'), 'navnet kan krympe')
ok(row.includes('break-all'), 'navnet kan stadig brydes')
ok(!row.includes('att.filename'), 'navnet er et andet sted')
ok(!row.includes('mail-file-link'), 'linket er et andet sted')
ok(!row.includes('line-clamp-2'), 'galleriet er et andet sted')
ok(!row.includes('mail-list-size'), 'stoerrelsen er et andet sted')
ok(!row.includes('Download'), 'download er et andet sted')
ok(!row.includes('space-y-1.5'), 'listen er et andet sted')
ok(!row.includes('w-5 h-5'), 'ikonet er et andet sted')
ok(view.split(id).length === 2, 'navnet findes en gang')
ok(view.split(cell).length === 2, 'navneklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare afsnit er vaek')
ok(view.includes('{att.filename}'), 'navnet bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'gallerifilnavnet bliver')
ok(view.includes('data-testid="mail-file-link"'), 'linket bliver')
ok(view.includes('data-testid="mail-list-size"'), 'stoerrelsen bliver')
ok(view.includes('break-all min-w-0 flex-1 text-sm text-gray-700'), 'filnavnsklassen bliver')
ok(view.includes('<Bot className="w-4 h-4 break-words min-w-0" data-testid="mail-agent-icon" />'), 'mailagent-ikonet bliver')
ok(view.includes('Kør Mailagent'), 'mailagent-teksten bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-file-name-wrap-test')
