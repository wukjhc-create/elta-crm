/**
 * Naeste skridt-afsnittet kan krympe. Overskrift og tekst er uaendret.
 *   npx tsx scripts/ai-project-next-step-wrap-test.ts
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
const id = 'data-testid="ai-project-next-step"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('bg-white border rounded-lg p-6 break-words min-w-0'), 'afsnittet kan krympe')
ok(row.includes('rounded-lg p-6'), 'polstringen bliver')
ok(!row.includes('ai-project-next-step-heading'), 'overskriften er en anden')
ok(!row.includes('handleCreateOffer'), 'oprettelsen er en anden')
ok(view.split(id).length === 2, 'afsnittet findes en gang')
ok(view.split('bg-white border rounded-lg p-6 break-words min-w-0').length === 2, 'rammen findes en gang')
ok(view.includes('bg-white border rounded-lg p-6 mb-6'), 'beskrivelsesrammen bliver')
ok(view.includes('data-testid="ai-project-next-step-heading"'), 'overskriften bliver')
ok(view.includes('>Næste skridt<'), 'teksten bliver')
ok(view.includes('onClick={handleCreateOffer}'), 'oprettelsen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-next-step-wrap-test')
