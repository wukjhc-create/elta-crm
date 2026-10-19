/**
 * Eksempelafsnittet i AI-projekt kan krympe. Overskrift, titel og tekst er uaendrede.
 *   npx tsx scripts/ai-project-examples-section-wrap-test.ts
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
const id = 'data-testid="ai-project-examples-section"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('bg-gray-50 border rounded-lg p-6 break-words min-w-0'), 'afsnittet kan krympe')
ok(!row.includes('>{example.title}'), 'titlen er en anden')
ok(!row.includes('>{example.text}'), 'teksten er en anden')
ok(view.split(id).length === 2, 'afsnittet findes en gang')
ok(view.includes('data-testid="ai-project-examples-heading"'), 'overskriften bliver')
ok(view.includes('Eksempler på projektbeskrivelser'), 'overskriftsteksten bliver')
ok(view.includes('>{example.title}'), 'titlen bliver')
ok(view.includes('>{example.text}'), 'teksten bliver')
ok(view.includes('data-testid="ai-project-example-grid"'), 'gitteret bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-examples-section-wrap-test')
