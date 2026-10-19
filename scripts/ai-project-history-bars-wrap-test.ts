/**
 * Historikkens pladsholderbjaelker kan krympe. Pris og beskrivelse er uaendrede.
 *   npx tsx scripts/ai-project-history-bars-wrap-test.ts
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
const wrapped = 'h-10 bg-gray-200 rounded break-words min-w-0'
const oneId = 'data-testid="ai-project-history-bar-one"'
const twoId = 'data-testid="ai-project-history-bar-two"'
const oneAt = view.indexOf(oneId)
const twoAt = view.indexOf(twoId)
const one = oneAt >= 0 ? view.slice(oneAt - 80, oneAt + 40) : ''
const two = twoAt >= 0 ? view.slice(twoAt - 80, twoAt + 40) : ''
const oneCell = 'className="h-10 bg-gray-200 rounded break-words min-w-0" data-testid="ai-project-history-bar-one"'
const twoCell = 'className="h-10 bg-gray-200 rounded break-words min-w-0" data-testid="ai-project-history-bar-two"'
ok(one.includes(wrapped), 'foerste bjaelke kan krympe')
ok(one.includes('<div'), 'foerste er en bjaelke')
ok(!one.includes('ai-project-history-bar-two'), 'anden bjaelke er et andet sted')
ok(!one.includes('formatCurrency'), 'prisen er et andet sted')
ok(!one.includes('line-clamp-2'), 'beskrivelsen er et andet sted')
ok(two.includes(wrapped), 'anden bjaelke kan krympe')
ok(two.includes('<div'), 'anden er en bjaelke')
ok(!two.includes('ai-project-history-bar-one'), 'foerste bjaelke er et andet sted')
ok(!two.includes('formatCurrency'), 'prisen er ogsaa et andet sted')
ok(!two.includes('analysis.description'), 'beskrivelsen er ogsaa et andet sted')
ok(view.split(oneId).length === 2, 'foerste bjaelke findes en gang')
ok(view.split(twoId).length === 2, 'anden bjaelke findes en gang')
ok(view.split(oneCell).length === 2, 'foerste klasse findes en gang')
ok(view.split(twoCell).length === 2, 'anden klasse findes en gang')
ok(view.split(wrapped).length === 3, 'begge bjaelker har klassen')
ok(!view.includes('<div className="h-10 bg-gray-200 rounded" />'), 'de bare bjaelker er vaek')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'beskrivelsen forbliver to linjer')
ok(view.includes('formatCurrency(analysis.total_price)'), 'historikprisen bliver')
ok(view.split('>{title}<').length === 2, 'titelteksten findes en gang')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-history-bars-wrap-test')
