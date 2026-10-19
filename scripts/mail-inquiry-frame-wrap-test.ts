/**
 * Rammen om webhenvendelsen i mailen kan krympe. Kortet bliver.
 *   npx tsx scripts/mail-inquiry-frame-wrap-test.ts
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
const id = 'data-testid="mail-inquiry-frame"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 10) : ''
const cell = 'className="mb-4 empty:hidden break-words min-w-0" data-testid="mail-inquiry-frame"'
ok(row.includes('<div'), 'det er rammen')
ok(row.includes('mb-4 empty:hidden break-words min-w-0'), 'rammen kan krympe')
ok(!row.includes('WebInquiryCard'), 'kortet er et andet sted')
ok(!row.includes('mail-body-loading'), 'indlaesningen er et andet sted')
ok(!row.includes('mail-body-html'), 'html-teksten er et andet sted')
ok(!row.includes('mail-body-plain'), 'broedteksten er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('email.body_text'), 'indholdet er et andet sted')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(cell).length === 2, 'rammens klasse findes en gang')
ok(view.includes('<WebInquiryCard email={email} />'), 'kortet bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"'), 'lysboksen bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-inquiry-frame-wrap-test')
