/**
 * Emnet i beskedlisten ombrydes. Teksten er uændret.
 *   npx tsx scripts/message-list-subject-wrap-test.ts
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
ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync('src/components/modules/messages/messages-list.tsx', 'utf8')
const at = view.indexOf('data-testid="message-list-subject"')
const row = at >= 0 ? view.slice(at - 160, at + 120) : ''
ok(row.includes('break-words min-w-0'), 'emnet ombrydes')
ok(row.includes('{message.subject}'), 'teksten er uændret')
ok(!row.includes('line-clamp-2'), 'det klippes ikke til to linjer')
ok(view.includes('message.body.substring(0, 100)'), 'forhåndsvisningen bliver')
ok(view.includes("message.from_name"), 'afsenderen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  message-list-subject-wrap-test')
