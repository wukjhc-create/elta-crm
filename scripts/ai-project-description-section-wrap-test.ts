/**
 * Beskrivelsesafsnittet paa AI-projekt kan krympe. Feltet er uaendret.
 *   npx tsx scripts/ai-project-description-section-wrap-test.ts
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
const id = 'data-testid="ai-project-description-section"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('bg-white border rounded-lg p-6 mb-6 break-words min-w-0'), 'afsnittet kan krympe')
ok(row.includes('p-6 mb-6'), 'margen bliver')
ok(!row.includes('ai-project-description-label'), 'etiketten er en anden')
ok(!row.includes('value={description}'), 'vaerdien er en anden')
ok(view.split(id).length === 2, 'afsnittet findes en gang')
ok(view.split('bg-white border rounded-lg p-6 mb-6').length === 2, 'rammen findes en gang')
ok(view.includes('data-testid="ai-project-description-label"'), 'etiketten bliver')
ok(view.includes('value={description}'), 'vaerdien bliver')
ok(view.includes('placeholder="Eksempel: Renovering af 140m2 hus. Nye spots i køkken, 20 stikkontakter, ny tavle, udendørs belysning..."'), 'pladsholderen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-description-section-wrap-test')
