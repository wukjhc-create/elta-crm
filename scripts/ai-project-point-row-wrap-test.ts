/**
 * Elpunktrækken kan krympe. Punktantallet og kalkulationsgitteret bliver.
 *   npx tsx scripts/ai-project-point-row-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
const id = 'data-testid="ai-project-point-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 90, at + 130) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-point-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0"'
ok(row.includes('<div'), 'det er elpunktrækken')
ok(row.includes('key={key}'), 'nøglen bliver')
ok(row.includes('flex flex-wrap justify-between gap-x-3 min-w-0 break-words'), 'rækken kan krympe')
ok(row.includes('getPointTypeName'), 'punktnavnet ligger i rækken')
ok(!row.includes('ai-project-point-count'), 'punktantallet er et andet sted')
ok(!row.includes('{value}'), 'antallet er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-points-list'), 'elpunktlisten er et andet sted')
ok(!row.includes('>Elpunkter<'), 'overskriften er et andet sted')
ok(!row.includes('Tilgængelighedsfaktor'), 'tilgængelighedsfaktoren er et andet sted')
ok(view.split(id).length === 2, 'elpunktrækken findes en gang')
ok(view.split('data-testid="ai-project-point-count"').length === 2, 'punktantallet findes en gang')
ok(view.split(cell).length === 2, 'elpunktrækkens klasse findes en gang')
ok(view.split(bare).length === 1, 'ingen bar række bliver')
ok(view.includes('data-testid="ai-project-point-count">{value} stk'), 'antallet bliver')
ok(view.includes('break-words">{getPointTypeName(key)}'), 'punktnavnet bliver')
ok(view.includes('<div className="grid grid-cols-1 md:grid-cols-2 gap-6 break-words min-w-0" data-testid="ai-project-calculation-grid">\r\n              {/* Price Breakdown */}'), 'kalkulationsgitteret kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-point-row-wrap-test')
