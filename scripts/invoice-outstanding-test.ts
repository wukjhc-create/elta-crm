/**
 * Unit-tests for B1 udestående (src/lib/invoices/outstanding.ts). Ingen DB.
 *   npx tsx scripts/invoice-outstanding-test.ts
 */
import { computeOutstanding } from '../src/lib/invoices/outstanding'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

ok(computeOutstanding(12500, 0, 0) === 12500, 'ubetalt = hele beløbet')
ok(computeOutstanding(12500, 10000, 2500) === 0, 'review-eksemplet: kredit 2.500 + betaling 10.000 = betalt')
ok(computeOutstanding(12500, 10000, -2500) === 0, 'kreditnotaens fortegn er ligegyldigt')
ok(computeOutstanding(12500, 5000, 2500) === 5000, 'delvis betalt + delvis krediteret', String(computeOutstanding(12500, 5000, 2500)))
ok(computeOutstanding('125.03', '0', 125.025) === 0, 'under 1 øre = intet udestående')
ok(computeOutstanding(100, 150, 0) === 0, 'overbetaling giver aldrig negativt udestående')
ok(computeOutstanding(null, null, 0) === 0, 'tomme felter')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle udestående-tests bestået')
process.exitCode = bad ? 1 : 0
