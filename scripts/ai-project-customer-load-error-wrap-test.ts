/**
 * Kundelistens fejltekst kan krympe. Fejlteksten er uaendret.
 *   npx tsx scripts/ai-project-customer-load-error-wrap-test.ts
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
const id = 'data-testid="ai-customer-load-error"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 120) : ''
const cell = 'className="text-center py-8 text-sm text-red-700 break-words min-w-0" data-testid="ai-customer-load-error"'
const bare = 'className="text-center py-8 text-sm text-red-700 break-words" data-testid="ai-customer-load-error"'
ok(row.includes('<div'), 'det er fejlteksten')
ok(row.includes('break-words min-w-0'), 'fejlteksten kan krympe')
ok(row.includes('text-red-700'), 'farven bliver')
ok(row.includes('{customerLoadError}'), 'fejlen bliver i raekken')
ok(row.includes('Det tælles ikke som ingen kunder.'), 'forklaringen bliver')
ok(!row.includes('ai-project-customer-retry'), 'prov-igen er et andet sted')
ok(!row.includes('Prøv igen'), 'knapteksten er et andet sted')
ok(!row.includes('ai-project-customer-empty'), 'den tomme liste er et andet sted')
ok(!row.includes('Ingen kunder'), 'tom-teksten er et andet sted')
ok(!row.includes('ai-project-customer-loading'), 'indlaesningen er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-history-load-error'), 'historikfejlen er en anden')
ok(!row.includes('ai-quick-load-error'), 'hurtig-fejlen er en anden')
ok(view.split(id).length === 2, 'fejlteksten findes en gang')
ok(view.split(cell).length === 2, 'fejltekstens klasse findes en gang')
ok(view.split(bare).length === 1, 'den gamle klasse er vaek')
ok(view.includes('data-testid="ai-project-customer-retry"'), 'prov-igen bliver')
ok(view.includes("'Ingen kunder'"), 'tom-teksten bliver')
ok(view.includes('data-testid="ai-project-customer-empty"'), 'den tomme liste bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-load-error-wrap-test')
