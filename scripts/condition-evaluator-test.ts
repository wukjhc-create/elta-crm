/**
 * AU-8 (automations-review 2026-10-17): betingelses-DSL kaster ikke på fejlformede udtryk; neq på manglende felt = falsk.
 *   npx tsx scripts/condition-evaluator-test.ts
 */
import { evaluateCondition } from '../src/lib/automation/condition-evaluator'

let bad = 0
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — fik ${String(got)}, ville have ${String(want)}`}`)
}
eq('tom betingelse = sand', evaluateCondition({}, { a: 1 }), true)
eq('gte opfyldt', evaluateCondition({ days_overdue: { op: 'gte', value: 3 } }, { days_overdue: 5 }), true)
eq('gte ikke opfyldt', evaluateCondition({ days_overdue: { op: 'gte', value: 3 } }, { days_overdue: 1 }), false)
let threw = false
let r: boolean | null = null
try { r = evaluateCondition({ x: null } as never, { x: 1 }) } catch { threw = true }
eq('fejlformet udtryk kaster ikke', threw, false)
eq('fejlformet udtryk = falsk', r, false)
eq('neq på manglende felt = falsk', evaluateCondition({ status: { op: 'neq', value: 'paid' } }, {}), false)
eq('neq på andet felt = sand', evaluateCondition({ status: { op: 'neq', value: 'paid' } }, { status: 'sent' }), true)
eq('neq på samme = falsk', evaluateCondition({ status: { op: 'neq', value: 'paid' } }, { status: 'paid' }), false)
eq('indlejret sti', evaluateCondition({ 'a.b': { op: 'eq', value: true } }, { a: { b: true } }), true)
console.log(bad ? `❌ ${bad} fejl` : '✅ alle bestået')
process.exitCode = bad ? 1 : 0
