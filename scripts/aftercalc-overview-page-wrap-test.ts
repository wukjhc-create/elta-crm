/**
 * Efterkalkulationens side kan krympe. Filtre og beloeb bliver.
 *   npx tsx scripts/aftercalc-overview-page-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const id = '<div className="p-4 md:p-6 space-y-4 break-words min-w-0" data-testid="aftercalc-overview">'
const bare = '<div className="p-4 md:p-6 space-y-4" data-testid="aftercalc-overview">'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<div'), 'det er siden')
ok(row.includes('break-words min-w-0'), 'siden kan krympe')
ok(row.includes('p-4 md:p-6 space-y-4'), 'afstanden bliver')
ok(row.includes('data-testid="aftercalc-overview"'), 'testid bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('Efterkalkulation'), 'overskriften er et andet sted')
ok(!row.includes('Fra dato'), 'filtret er et andet sted')
ok(!row.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'siden findes en gang')
ok(view.split(bare).length === 1, 'den bare side er vaek')
ok(view.includes('<div className="flex flex-wrap items-start justify-between gap-3 break-words min-w-0" data-testid="aftercalc-overview-heading-row">'), 'raekken kan stadig krympe')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const testId = 'data-testid="aftercalc-overview"'
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== testId && (q.startsWith(testId) || testId.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-page-wrap-test')
