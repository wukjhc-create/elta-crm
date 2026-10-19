/**
 * Komponenttabellen paa skrivebord kan krympe. Priserne er uaendret.
 *   npx tsx scripts/ai-project-components-frame-wrap-test.ts
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
const id = 'data-testid="ai-project-components-frame"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const locked = 'hidden md:block border rounded-lg overflow-hidden'
ok(row.includes(locked + ' break-words min-w-0'), 'rammen kan krympe')
ok(row.includes(locked), 'skrivebordet bliver skjult paa mobil')
ok(!row.includes('formatCurrency(comp.total)'), 'totalen er en anden')
ok(!row.includes('ai-components-mobile'), 'mobilkortet er et andet')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(locked).length === 2, 'den laaste klasse findes en gang')
ok(view.includes('data-testid="ai-components-mobile"'), 'mobilkortet bliver')
ok(view.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen bliver')
ok(view.includes('formatCurrency(comp.total)'), 'totalen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-components-frame-wrap-test')
