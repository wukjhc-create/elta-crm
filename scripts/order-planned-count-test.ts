/** Aabne arbejdsordrer siger naar optaellingen fejler. Et aegte 0 bliver. Koer: npx tsx scripts/order-planned-count-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/orders/[id]/page.tsx', 'utf8')
eq('fejl laeses', page.includes('error: countError') && page.includes("plannedCountError = 'Kunne ikke tælle arbejdsordrer'"), true)
eq('aegte nul bliver', page.includes('plannedCount = count ?? 0'), true)
eq('status bliver', page.includes(".in('status', ['planned', 'in_progress'])"), true)
eq('formand bliver', page.includes('sag.formand_id') && page.includes(".eq('id', sag.formand_id)"), true)

const view = fs.readFileSync('src/app/dashboard/orders/[id]/order-detail-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="order-planned-count-error"') && view.includes('Det tælles ikke som 0.'), true)
const statStart = view.indexOf('data-testid="order-planned-count-error"')
const statEnd = view.indexOf('CaseStartHint', statStart)
const stat = view.slice(statStart, statEnd)
eq('aegte nul vises', stat.includes("'0'"), true)
eq('fejl staar foer nullet', stat.indexOf('plannedCountError') < stat.indexOf("'0'"), true)
eq('tal over nul bliver', view.includes('plannedWorkOrderCount > 0'), true)
eq('fanen bliver', view.includes("setActive('planlaegning')"), true)

console.log(fail ? `\n${fail} fejl` : '\norder-planned-count-test OK')
process.exitCode = fail ? 1 : 0
