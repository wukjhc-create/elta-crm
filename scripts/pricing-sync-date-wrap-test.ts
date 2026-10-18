/**
 * Synk-datoen på prisstatistikken ombrydes. formatDateUtil er uændret.
 *   npx tsx scripts/pricing-sync-date-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate(null) === '', 'tom dato bliver tom')
ok(formatDate(undefined) === '', 'manglende dato bliver tom')
ok(formatDate('2026-06-02').includes('2026'), 'en rigtig dato formateres')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-sync-date"')
const row = at >= 0 ? view.slice(at - 200, at + 140) : ''
ok(row.includes('break-words min-w-0'), 'datoen ombrydes')
ok(row.includes('Synk: {formatDateUtil(stat.last_sync_at)}'), 'kald og ord er uændret')
ok(row.includes('stat.last_sync_at &&'), 'datoen vises kun når der er en synk')
ok(view.includes('data-testid="pricing-supplier-name"'), 'leverandørnavnet bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-sync-date-wrap-test')
