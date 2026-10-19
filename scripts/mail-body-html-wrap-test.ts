/**
 * HTML-brødteksten i mailen kan krympe. Rensningen bliver.
 *   npx tsx scripts/mail-body-html-wrap-test.ts
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
const id = 'data-testid="mail-body-html"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = 'className="prose prose-sm max-w-none break-words min-w-0" data-testid="mail-body-html"'
ok(row.includes('<div'), 'det er html-teksten')
ok(row.includes('prose prose-sm max-w-none break-words min-w-0'), 'html-teksten kan krympe')
ok(!row.includes('mail-body-plain'), 'broedteksten er et andet sted')
ok(!row.includes('email.body_text'), 'indholdet er et andet sted')
ok(!row.includes('mail-body-loading'), 'indlaesningen er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('sanitizeEmailHtml'), 'rensningen er et andet sted')
ok(!row.includes('dangerouslySetInnerHTML'), 'html-saetningen er et andet sted')
ok(!row.includes('(Tom email)'), 'tom-teksten er et andet sted')
ok(view.split(id).length === 2, 'html-teksten findes en gang')
ok(view.split(cell).length === 2, 'html-tekstens klasse findes en gang')
ok(view.includes('dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(email.body_html) }}'), 'rensningen bliver')
ok(view.includes('data-testid="mail-body-plain"'), 'broedteksten bliver')
ok(view.includes('{email.body_text || email.body_preview || \'(Tom email)\'}'), 'indholdet bliver')
ok(view.includes('className="text-xs text-gray-400 mb-2 flex items-center gap-1" data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-body-html-wrap-test')
