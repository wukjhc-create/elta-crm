/**
 * Tilbudsteksten paa AI-projekt kan krympe. Teksten er uaendret.
 *   npx tsx scripts/ai-project-offer-pre-wrap-test.ts
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
const id = 'data-testid="ai-project-offer-pre"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 120) : ''
const expr = 'result.offer_text.full_offer_text'
ok(row.includes('bg-gray-50 p-4 rounded-lg text-sm whitespace-pre-wrap font-mono overflow-x-auto break-words min-w-0'), 'teksten kan krympe')
ok(row.includes('whitespace-pre-wrap'), 'linjeskift bliver')
ok(row.includes(expr), 'tilbudsteksten bliver i rammen')
ok(!row.includes('ai-project-copy'), 'kopier-knappen er en anden')
ok(!row.includes('navigator.clipboard'), 'udklipsholderen er en anden')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split('whitespace-pre-wrap font-mono overflow-x-auto').length === 2, 'mono-rammen findes en gang')
ok(view.split(expr).length === 3, 'teksten bruges to steder')
ok(view.includes('onClick={copyOfferText}'), 'kopieringen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-offer-pre-wrap-test')
