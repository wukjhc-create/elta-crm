/** Unit: forskud/rater efter kreditnota (fradrag + procentloft). Kør: npx tsx scripts/stage-net-test.ts */
import { netStageAmount, netStagePercentage } from '../src/lib/invoices/stage-net'
let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${got} forventet=${want}`}`) }
eq('ikke krediteret → fuldt fradrag', netStageAmount(300, 0), 300)
eq('delvist krediteret → netto', netStageAmount(500, 200), 300)
eq('fuldt krediteret → 0', netStageAmount(300, 300), 0)
eq('overkrediteret → aldrig negativt', netStageAmount(300, 400), 0)
eq('streng-beløb', netStageAmount('1250.50', 250.5), 1000)
eq('procent: 30 % ikke krediteret', netStagePercentage(30, 3000, 0), 30)
eq('procent: 30 % fuldt krediteret → 0', netStagePercentage(30, 3000, 3000), 0)
eq('procent: 40 % halvt krediteret → 20', netStagePercentage(40, 4000, 2000), 20)
eq('procent: uden procent (linje-rate) → 0', netStagePercentage(null, 1000, 0), 0)
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle rate/kredit-tests PASS')
process.exitCode = fail ? 1 : 0
