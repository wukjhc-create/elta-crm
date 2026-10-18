/**
 * Fragt og gebyr tælles hver for sig i fakturakontrollens tekst.
 *   npx tsx scripts/invoice-review-split-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { countInvoiceReviewLines, reviewCountText } from '../src/lib/invoice-control/review-counts'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

const counts = countInvoiceReviewLines([
  { verdict: 'ok', description: 'Fragt' },
  { verdict: 'overcharge', description: 'Ekspeditionsgebyr' },
  { verdict: 'ok', description: 'Afbryder' },
])
ok(counts.freight === 1 && counts.fee === 1 && counts.overcharge === 1, 'fragt og gebyr er to tal', JSON.stringify(counts))
const text = reviewCountText(counts)
ok(text === '1 overpris, 0 underpris, 1 fragt, 1 gebyr.', 'teksten nævner dem hver for sig', text)
ok(!text.includes('fragt/gebyr'), 'teksten slår dem ikke sammen')

const panel = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
ok(panel.includes('{review.freight} fragt, {review.fee} gebyr.'), 'panelet viser de to tal')
ok(!panel.includes('review.freight + review.fee'), 'panelet lægger dem ikke sammen')
ok(panel.includes('Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.'), '0-linje-sætningen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-review-split-test')
