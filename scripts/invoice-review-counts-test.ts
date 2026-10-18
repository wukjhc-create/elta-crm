/**
 * Linjetælling i fakturakontrol. Ingen DB. Ingen beløb.
 *   npx tsx scripts/invoice-review-counts-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { countInvoiceReviewLines, reviewCountText } from '../src/lib/invoice-control/review-counts'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

const empty = countInvoiceReviewLines([])
ok(empty.lines === 0 && empty.overcharge === 0 && empty.undercharge === 0 && empty.freight === 0 && empty.fee === 0, 'ingen linjer er 0')
ok(reviewCountText(empty) === '0 overpris, 0 underpris, 0 fragt, 0 gebyr.', 'tom tekst er 0, ikke et grønt stemmer')

const lines = countInvoiceReviewLines([
  { verdict: 'overcharge', description: 'Fragt til byggeplads' },
  { verdict: 'undercharge', description: 'Kabel 5G2,5' },
  { verdict: 'ok', description: 'Ekspeditionsgebyr' },
  { verdict: 'not_controllable', description: 'Porto' },
  { verdict: 'ok', description: 'Afbryder' },
])
ok(lines.lines === 5 && lines.overcharge === 1 && lines.undercharge === 1 && lines.freight === 2 && lines.fee === 1, 'overpris, underpris, fragt og gebyr tælles hver for sig', JSON.stringify(lines))
ok(reviewCountText(lines) === '1 overpris, 1 underpris, 2 fragt, 1 gebyr.', 'teksten holder fragt og gebyr hver for sig')

const both = countInvoiceReviewLines([{ verdict: 'overcharge', description: 'Transportgebyr' }])
ok(both.overcharge === 1 && both.fee === 1 && both.freight === 0, 'samme linje kan være både overpris og gebyr')

const panel = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
ok(panel.includes('data-testid="invoice-control-review-counts"'), 'panelet viser tællingen')
ok(panel.includes('countInvoiceReviewLines(res.control.lines)'), 'panelet bruger de kontrollerede linjer')
ok(panel.includes("review.overcharge > 0 ? 'text-red-700 font-medium'"), 'overpris er rød kun når tallet er over 0')
ok(panel.includes("review.undercharge > 0 ? 'text-amber-800 font-medium'"), 'underpris er gul kun når tallet er over 0')
ok(panel.includes('Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.'), '0-kontrollerede-linje-sætningen er uændret')
ok(panel.includes('res.control.controlledLines > 0 ? kr(res.control.overchargeAmount) : \'—\''), 'overprisbeløbet er uændret')

const helper = readFileSync(join('src', 'lib', 'invoice-control', 'review-counts.ts'), 'utf8')
ok(!helper.includes('overchargeAmount') && !helper.includes("from '@/lib/invoice-control/engine'"), 'tælleren rører ikke beløb eller motoren')
ok(!helper.includes('economic'), 'tælleren poster ikke til e-conomic')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-review-counts-test')
