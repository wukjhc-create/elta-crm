/**
 * Komponenttabellen kan krympe. Priserne er uaendret.
 *   npx tsx scripts/ai-project-components-table-wrap-test.ts
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
const id = 'data-testid="ai-project-components-table"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const locked = 'hidden md:block border rounded-lg overflow-hidden'
ok(row.includes('w-full text-sm break-words min-w-0'), 'tabellen kan krympe')
ok(row.includes('w-full text-sm'), 'bredden bliver')
ok(!row.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen er en anden')
ok(!row.includes('formatCurrency(comp.total)'), 'totalen er en anden')
ok(!row.includes('ai-project-components-frame'), 'rammen er en anden')
ok(view.split(id).length === 2, 'tabellen findes en gang')
ok(view.split('w-full text-sm').length === 2, 'tabelklassen findes en gang')
ok(view.includes(locked), 'skrivebordsrammen bliver')
ok(view.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen bliver')
ok(view.includes('formatCurrency(comp.total)'), 'totalen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-components-table-wrap-test')
