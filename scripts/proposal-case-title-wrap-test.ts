/**
 * Sagstitlen i mailforslag ombrydes. Teksten er uændret.
 *   npx tsx scripts/proposal-case-title-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/mail/proposals/proposals-client.tsx', 'utf8')
const at = view.indexOf('data-testid="proposal-case-title"')
const row = at >= 0 ? view.slice(at - 120, at + 60) : ''
ok(row.includes('break-words min-w-0'), 'titlen ombrydes')
ok(row.includes('>{c.title}'), 'teksten er uændret')
ok(!row.includes('line-clamp-1'), 'den klippes ikke til en linje')
ok(view.includes('line-clamp-1">{o.title}'), 'tilbudstitlen bliver')
ok(view.includes('onPromoteCase(c.id)'), 'opret bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  proposal-case-title-wrap-test')
