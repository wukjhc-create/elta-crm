/**
 * Brødteksten i mailen kan krympe. Indholdet bliver.
 *   npx tsx scripts/mail-body-plain-wrap-test.ts
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
const id = 'data-testid="mail-body-plain"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 100, at + 10) : ''
const cell = 'className="whitespace-pre-wrap text-sm text-gray-700 font-sans break-words min-w-0" data-testid="mail-body-plain"'
ok(row.includes('<pre'), 'det er broedteksten')
ok(row.includes('whitespace-pre-wrap text-sm text-gray-700 font-sans break-words min-w-0'), 'broedteksten kan krympe')
ok(!row.includes('email.body_text'), 'indholdet er et andet sted')
ok(!row.includes('mail-body-loading'), 'indlaesningen er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('formatFileSize'), 'filstørrelsen er et andet sted')
ok(!row.includes('mail-file-link'), 'fillinket er et andet sted')
ok(!row.includes('dangerouslySetInnerHTML'), 'html-teksten er et andet sted')
ok(!row.includes('(Tom email)'), 'tom-teksten er et andet sted')
ok(view.split(id).length === 2, 'broedteksten findes en gang')
ok(view.split(cell).length === 2, 'broedtekstens klasse findes en gang')
ok(view.includes('{email.body_text || email.body_preview || \'(Tom email)\'}'), 'indholdet bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('className="prose prose-sm max-w-none"'), 'html-teksten bliver')
ok(view.includes('sanitizeEmailHtml(email.body_html)'), 'rensningen bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-body-plain-wrap-test')
