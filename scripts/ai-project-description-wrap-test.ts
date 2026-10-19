/**
 * Beskrivelsesfeltet paa AI-projekt kan krympe. Pladsholder og vaerdi er uaendret.
 *   npx tsx scripts/ai-project-description-wrap-test.ts
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
const id = 'data-testid="ai-project-description"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 480) : ''
ok(row.includes('break-words min-w-0'), 'feltet kan krympe')
ok(row.includes('placeholder="Eksempel: Renovering af 140m2 hus. Nye spots i køkken, 20 stikkontakter, ny tavle, udendørs belysning..."'), 'pladsholderen er uaendret')
ok(row.includes('value={description}'), 'vaerdien er uaendret')
ok(row.includes('handleDescriptionChange(e.target.value)'), 'aendringen bliver')
ok(view.split(id).length === 2, 'feltet findes en gang')
ok(view.includes('data-testid="ai-project-description-label"'), 'etiketten bliver')
ok(view.includes('data-testid="ai-project-charger-search"'), 'soegefeltet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-description-wrap-test')
