/**
 * Elpunktkolonnen kan krympe. Bygningskolonnen og listen bliver.
 *   npx tsx scripts/ai-project-points-column-wrap-test.ts
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
const id = 'data-testid="ai-project-points-column"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 180) : ''
const cell = 'className="break-words min-w-0" data-testid="ai-project-points-column"'
ok(row.includes('<div'), 'det er elpunktkolonnen')
ok(row.includes('break-words min-w-0'), 'kolonnen kan krympe')
ok(row.includes('>Elpunkter</h4>'), 'overskriften ligger i kolonnen')
ok(row.includes('ai-project-points-heading'), 'elpunktsoverskriften ligger i kolonnen')
ok(!row.includes('<dl'), 'listen er et andet sted')
ok(!row.includes('ai-project-points-list'), 'elpunktlisten er et andet sted')
ok(!row.includes('Bygningsinformation'), 'bygningskolonnen er en anden')
ok(!row.includes('ai-project-building-column'), 'bygningskolonnen er et andet sted')
ok(!row.includes('getPointTypeName'), 'punktnavnet er et andet sted')
ok(!row.includes('ai-project-point-count'), 'punktantallet er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'elpunktkolonnen findes en gang')
ok(view.split(cell).length === 2, 'elpunktkolonens klasse findes en gang')
ok(!view.includes('<div>\r\n                <h4 className="font-medium mb-3 break-words min-w-0" data-testid="ai-project-points-heading">'), 'den bare elpunktkolonne er vaek')
ok(view.includes('<div className="break-words min-w-0" data-testid="ai-project-building-column">\r\n                <h4 className="font-medium mb-3 break-words min-w-0" data-testid="ai-project-building-heading">'), 'bygningskolonnen kan krympe')
ok(view.includes('break-words">{getPointTypeName(key)}'), 'punktnavnet bliver')
ok(view.includes('{value} stk'), 'punktantallet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-points-column-wrap-test')
