/**
 * Datoen på prisadvarslerne ombrydes. formatDateUtil(alert.changed_at) er uændret.
 *   npx tsx scripts/pricing-alert-date-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate(null) === '', 'tom dato bliver')
ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const ids = ['pricing-alert-date-mobile', 'pricing-alert-date']
for (const id of ids) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 120, at + 120) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes('{formatDateUtil(alert.changed_at)}'), `${id} kaldet er uændret`)
}
ok((view.match(/\{formatDateUtil\(alert\.changed_at\)\}/g) || []).length === 2, 'begge kald bliver')
ok(view.includes('{formatDateUtil(offer.created_at)}'), 'tilbudsdatoen venter')
ok(view.includes('Synk: {formatDateUtil(stat.last_sync_at)}'), 'synk-datoen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-date-wrap-test')
