/**
 * FIN2-9 (2026-10-20): øre-afrunding som SQL ROUND(numeric,2) — halv øre væk fra nul.
 *   npx tsx scripts/money-round-test.ts
 */
import { roundMoney } from '../src/lib/utils/money-round'
let bad = 0
const eq = (n: number, want: number) => { const got = roundMoney(n); const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} → ${got}${ok ? '' : ` (forventet ${want})`}`) }
eq(308.525, 308.53)
eq(1234.10 * 0.25, 308.53)
eq(1.005, 1.01)
eq(-2.675, -2.68)
eq(0.1 + 0.2, 0.3)
eq(100, 100)
eq(99.994, 99.99)
eq(-0.004, -0)
eq(12345678.905, 12345678.91)
console.log(`\n${bad === 0 ? '✅ ALLE AFRUNDINGS-TESTS PASS' : `❌ ${bad} FEJL`}`)
process.exit(bad === 0 ? 0 : 1)
