/**
 * Indlæsningen af mailens brødtekst kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-body-loading-wrap-test.ts
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
const id = 'data-testid="mail-body-loading"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 100, at + 10) : ''
const cell = 'className="text-xs text-gray-400 mb-2 flex items-center gap-1 break-words min-w-0" data-testid="mail-body-loading"'
ok(row.includes('<p'), 'det er indlaesningen')
ok(row.includes('text-xs text-gray-400 mb-2 flex items-center gap-1 break-words min-w-0'), 'indlaesningen kan krympe')
ok(!row.includes('Henter'), 'teksten er et andet sted')
ok(!row.includes('Loader2'), 'spinneren er et andet sted')
ok(!row.includes('mail-body-plain'), 'broedteksten er et andet sted')
ok(!row.includes('mail-body-html'), 'html-teksten er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('email.body_text'), 'indholdet er et andet sted')
ok(!row.includes('animate-spin'), 'spinneren er et andet sted')
ok(view.split(id).length === 2, 'indlaesningen findes en gang')
ok(view.split(cell).length === 2, 'indlaesningens klasse findes en gang')
ok(view.includes('Henter hele mailen…'), 'teksten bliver')
ok(view.includes('<Loader2 className="w-3 h-3 animate-spin" />'), 'spinneren bliver')
ok(view.includes('data-testid="mail-body-plain"'), 'broedteksten bliver')
ok(view.includes('data-testid="mail-body-html"'), 'html-teksten bliver')
ok(view.includes('className="mb-4 empty:hidden"'), 'henvendelsen bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-body-loading-wrap-test')
